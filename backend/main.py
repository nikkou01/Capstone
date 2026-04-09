from fastapi import FastAPI, Depends, HTTPException, status, Response
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
from pymongo import ReturnDocument
from pydantic import BaseModel, Field
from passlib.context import CryptContext
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from pathlib import Path
from collections import deque
from bson import ObjectId
from bson.errors import InvalidId
import os, uuid, jwt, logging, json, base64, asyncio, io, threading, tempfile, time
import httpx
from dotenv import load_dotenv

try:
    import cv2
except Exception:
    cv2 = None

load_dotenv(Path(__file__).parent / ".env")

# ── Config ────────────────────────────────────────────────────────────────────
MONGO_URL   = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME     = os.getenv("DB_NAME", "safecctv")
SECRET_KEY  = os.getenv("SECRET_KEY", "changeme-in-production")
ALGORITHM   = "HS256"
TOKEN_EXP   = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
SMS_API_URL = os.getenv("SMS_API_URL", "").strip()
SMS_API_KEY = os.getenv("SMS_API_KEY", "").strip()
SMS_API_AUTH_HEADER = os.getenv("SMS_API_AUTH_HEADER", "Authorization").strip()
SMS_API_AUTH_SCHEME = os.getenv("SMS_API_AUTH_SCHEME", "Bearer").strip()
SMS_API_FROM = os.getenv("SMS_API_FROM", "").strip()
SMS_API_TO_FIELD = os.getenv("SMS_API_TO_FIELD", "to").strip()
SMS_API_MESSAGE_FIELD = os.getenv("SMS_API_MESSAGE_FIELD", "message").strip()
SMS_API_FROM_FIELD = os.getenv("SMS_API_FROM_FIELD", "from").strip()
SMS_API_EXTRA_JSON = os.getenv("SMS_API_EXTRA_JSON", "").strip()
SMS_API_TIMEOUT_SECONDS = float(os.getenv("SMS_API_TIMEOUT_SECONDS", "10"))
COLLISION_CLIP_SECONDS = max(int(os.getenv("COLLISION_CLIP_SECONDS", "15")), 5)
COLLISION_PRE_EVENT_SECONDS = max(int(os.getenv("COLLISION_PRE_EVENT_SECONDS", "5")), 0)
COLLISION_CLIP_FPS = max(int(os.getenv("COLLISION_CLIP_FPS", "10")), 1)
COLLISION_PRE_EVENT_SECONDS = min(COLLISION_PRE_EVENT_SECONDS, COLLISION_CLIP_SECONDS - 1)
COLLISION_POST_EVENT_SECONDS = COLLISION_CLIP_SECONDS - COLLISION_PRE_EVENT_SECONDS

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CameraPreBufferWorker:
    """Continuously reads frames and keeps a short in-memory pre-event frame buffer."""

    def __init__(self, camera_id: str, rtsp_url: str, pre_seconds: int, target_fps: int):
        self.camera_id = camera_id
        self.rtsp_url = rtsp_url
        self.pre_seconds = pre_seconds
        self.target_fps = target_fps
        self.max_frames = max(pre_seconds * target_fps, 1)
        self.buffer = deque(maxlen=self.max_frames)
        self.latest_frame = None
        self.lock = threading.Lock()
        self.stop_event = threading.Event()
        self.thread = threading.Thread(target=self._run, daemon=True, name=f"clip-buffer-{camera_id}")

    def start(self):
        if not self.thread.is_alive():
            self.thread.start()

    def stop(self):
        self.stop_event.set()
        if self.thread.is_alive():
            self.thread.join(timeout=3)

    def get_pre_frames(self, event_ts: datetime):
        if self.pre_seconds <= 0:
            return []

        cutoff = event_ts - timedelta(seconds=self.pre_seconds)
        with self.lock:
            frames = [frame.copy() for ts, frame in self.buffer if ts >= cutoff]
        return frames

    def get_latest_frame(self):
        with self.lock:
            if self.latest_frame is None:
                return None
            return self.latest_frame.copy()

    def _run(self):
        if cv2 is None:
            logger.error("OpenCV not available. Collision clip buffering is disabled.")
            return

        capture = None
        sleep_s = 1.0 / self.target_fps

        while not self.stop_event.is_set():
            if capture is None or not capture.isOpened():
                capture = cv2.VideoCapture(self.rtsp_url)
                if not capture.isOpened():
                    logger.warning("Unable to open stream for camera %s", self.camera_id)
                    time.sleep(1.0)
                    continue

            ok, frame = capture.read()
            if not ok or frame is None:
                time.sleep(0.15)
                continue

            now = datetime.utcnow()
            with self.lock:
                self.buffer.append((now, frame.copy()))
                self.latest_frame = frame.copy()

            time.sleep(sleep_s)

        if capture is not None:
            capture.release()

class CollisionClipRecorder:
    """Keeps per-camera pre-event buffers and provides clip snapshots for collisions."""

    def __init__(self):
        self._workers = {}
        self._lock = threading.Lock()

    def ensure_worker(self, camera_id: str, rtsp_url: str):
        if not camera_id or not rtsp_url:
            return None

        with self._lock:
            worker = self._workers.get(camera_id)
            if worker and worker.rtsp_url == rtsp_url:
                return worker

            if worker:
                worker.stop()

            worker = CameraPreBufferWorker(
                camera_id=camera_id,
                rtsp_url=rtsp_url,
                pre_seconds=COLLISION_PRE_EVENT_SECONDS,
                target_fps=COLLISION_CLIP_FPS,
            )
            self._workers[camera_id] = worker
            worker.start()
            return worker

    def remove_worker(self, camera_id: str):
        with self._lock:
            worker = self._workers.pop(camera_id, None)
        if worker:
            worker.stop()

    def stop_all(self):
        with self._lock:
            workers = list(self._workers.values())
            self._workers.clear()
        for worker in workers:
            worker.stop()

clip_recorder = CollisionClipRecorder()

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="SafeSight API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── DB lifecycle ──────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    app.client = AsyncIOMotorClient(MONGO_URL)
    app.db     = app.client[DB_NAME]
    app.fs_bucket = AsyncIOMotorGridFSBucket(app.db)
    logger.info(f"Connected to MongoDB: {DB_NAME}")
    await ensure_default_captain(app.db)

    cameras = await app.db.cameras.find({"status": "active"}).to_list(None)
    for camera in cameras:
        clip_recorder.ensure_worker(camera.get("id", ""), camera.get("rtsp_url", ""))

@app.on_event("shutdown")
async def shutdown():
    clip_recorder.stop_all()
    app.client.close()

def get_db():
    return app.db

# ── Security ──────────────────────────────────────────────────────────────────
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2  = OAuth2PasswordBearer(tokenUrl="/api/auth/token")

def hash_pw(pw: str) -> str:              return pwd_ctx.hash(pw)
def verify_pw(plain: str, hashed: str):   return pwd_ctx.verify(plain, hashed)

def make_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + timedelta(minutes=TOKEN_EXP)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2), db=Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        subject = payload.get("sub")
        if not subject:
            raise ValueError
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # New tokens store user id in sub; fallback to username for legacy tokens.
    user = await db.users.find_one({"id": subject})
    if not user:
        user = await db.users.find_one({"username": subject})

    if not user or not user.get("is_active"):
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user

def captain_only(user=Depends(get_current_user)):
    if user["role"] != "captain":
        raise HTTPException(status_code=403, detail="Captain access required")
    return user

# ── Helpers ───────────────────────────────────────────────────────────────────
def clean(doc: dict) -> dict:
    """Remove MongoDB _id and return serialisable dict."""
    doc.pop("_id", None)
    doc.pop("hashed_password", None)
    return doc

def _format_alert_timestamp(ts: str) -> str:
    if not ts:
        return datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    return ts[:16].replace("T", " ")

def _build_collision_alert_message(collision: dict) -> str:
    confidence = collision.get("confidence_score")
    confidence_text = f"{confidence:.0%}" if isinstance(confidence, (int, float)) else "N/A"
    return (
        f"COLLISION ALERT: {str(collision.get('severity', 'unknown')).upper()} severity at "
        f"{collision.get('camera_name', 'Unknown camera')} "
        f"({collision.get('camera_location', 'Unknown location')}) on "
        f"{_format_alert_timestamp(collision.get('timestamp', ''))}. "
        f"Confidence: {confidence_text}"
    )

def _build_sms_payload(recipient_phone: str, message: str) -> dict:
    payload = {
        SMS_API_TO_FIELD or "to": recipient_phone,
        SMS_API_MESSAGE_FIELD or "message": message,
    }
    if SMS_API_FROM:
        payload[SMS_API_FROM_FIELD or "from"] = SMS_API_FROM

    if SMS_API_EXTRA_JSON:
        try:
            extra = json.loads(SMS_API_EXTRA_JSON)
            if isinstance(extra, dict):
                payload.update(extra)
            else:
                logger.warning("SMS_API_EXTRA_JSON is not an object; ignoring")
        except Exception:
            logger.warning("SMS_API_EXTRA_JSON is invalid JSON; ignoring")

    return payload

def _build_sms_auth_header_value() -> Optional[str]:
    if not SMS_API_KEY:
        return None

    scheme = (SMS_API_AUTH_SCHEME or "").strip()
    if scheme.lower() == "basic":
        # UniSMS expects HTTP Basic auth where username is secret key and password is empty.
        encoded = base64.b64encode(f"{SMS_API_KEY}:".encode("utf-8")).decode("ascii")
        return f"Basic {encoded}"

    if scheme:
        return f"{scheme} {SMS_API_KEY}"

    return SMS_API_KEY

async def _send_sms_via_api(recipient_phone: str, message: str) -> dict:
    if not recipient_phone:
        return {"ok": False, "error": "Missing recipient phone number"}
    if not SMS_API_URL:
        return {"ok": False, "error": "SMS API URL is not configured"}

    headers = {"Content-Type": "application/json"}
    auth_value = _build_sms_auth_header_value()
    if auth_value:
        headers[SMS_API_AUTH_HEADER or "Authorization"] = auth_value

    try:
        payload = _build_sms_payload(recipient_phone, message)
        async with httpx.AsyncClient(timeout=SMS_API_TIMEOUT_SECONDS) as client:
            response = await client.post(SMS_API_URL, json=payload, headers=headers)

        provider_message_status = None
        provider_reference_id = None
        provider_fail_reason = None

        try:
            body = response.json()
            if isinstance(body, dict) and isinstance(body.get("message"), dict):
                message_data = body["message"]
                status_raw = message_data.get("status")
                provider_message_status = str(status_raw).lower().strip() if status_raw is not None else None
                provider_reference_id = message_data.get("reference_id")
                provider_fail_reason = message_data.get("fail_reason")
        except Exception:
            pass

        ok = 200 <= response.status_code < 300 and provider_message_status != "failed"
        error = None if ok else (provider_fail_reason or f"Provider returned HTTP {response.status_code}")

        return {
            "ok": ok,
            "status_code": response.status_code,
            "response": response.text[:500],
            "provider_message_status": provider_message_status,
            "provider_reference_id": provider_reference_id,
            "error": error,
        }
    except Exception as exc:
        logger.exception("SMS provider call failed")
        return {"ok": False, "error": str(exc)}

async def _store_alert_record(
    db,
    collision_id: Optional[str],
    user_doc: dict,
    message: str,
    send_result: dict,
    is_test: bool = False,
    triggered_by: Optional[str] = None,
):
    await db.alerts.insert_one({
        "id": str(uuid.uuid4()),
        "collision_id": collision_id,
        "user_id": user_doc["id"],
        "recipient_name": user_doc.get("full_name", "Unknown"),
        "recipient_phone": user_doc.get("phone_number", ""),
        "message": message,
        "status": "sent" if send_result.get("ok") else "failed",
        "channel": "sms",
        "is_test": is_test,
        "triggered_by": triggered_by,
        "provider_status_code": send_result.get("status_code"),
        "provider_response": send_result.get("response"),
        "provider_message_status": send_result.get("provider_message_status"),
        "provider_reference_id": send_result.get("provider_reference_id"),
        "delivery_error": send_result.get("error"),
        "sent_at": datetime.utcnow().isoformat(),
    })

def _initial_collision_video_fields() -> dict:
    return {
        "video_status": "processing",
        "video_file_id": None,
        "video_filename": None,
        "video_mime_type": "video/mp4",
        "video_duration_seconds": COLLISION_CLIP_SECONDS,
        "video_pre_event_seconds": COLLISION_PRE_EVENT_SECONDS,
        "video_post_event_seconds": COLLISION_POST_EVENT_SECONDS,
        "video_recorded_at": None,
        "video_error": None,
    }

async def _capture_and_store_collision_video(db, collision: dict, camera: dict):
    collision_id = collision.get("id")
    camera_id = camera.get("id")
    rtsp_url = camera.get("rtsp_url")

    if cv2 is None:
        await db.collisions.update_one(
            {"id": collision_id},
            {"$set": {"video_status": "failed", "video_error": "OpenCV is not installed on backend."}},
        )
        return

    if not camera_id or not rtsp_url:
        await db.collisions.update_one(
            {"id": collision_id},
            {"$set": {"video_status": "failed", "video_error": "Camera stream URL is missing."}},
        )
        return

    worker = clip_recorder.ensure_worker(camera_id, rtsp_url)
    if not worker:
        await db.collisions.update_one(
            {"id": collision_id},
            {"$set": {"video_status": "failed", "video_error": "Failed to start camera recorder."}},
        )
        return

    event_time = datetime.utcnow()
    pre_frames = worker.get_pre_frames(event_time)
    target_pre_frames = COLLISION_PRE_EVENT_SECONDS * COLLISION_CLIP_FPS
    if len(pre_frames) > target_pre_frames:
        pre_frames = pre_frames[-target_pre_frames:]

    frames = list(pre_frames)
    total_frames_target = COLLISION_CLIP_SECONDS * COLLISION_CLIP_FPS
    post_frames_target = max(total_frames_target - len(frames), 1)

    for _ in range(post_frames_target):
        frame = worker.get_latest_frame()
        if frame is not None:
            frames.append(frame)
        await asyncio.sleep(1.0 / COLLISION_CLIP_FPS)

    if not frames:
        await db.collisions.update_one(
            {"id": collision_id},
            {"$set": {"video_status": "failed", "video_error": "No video frames captured from camera stream."}},
        )
        return

    height, width = frames[0].shape[:2]
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp_file:
            tmp_path = tmp_file.name

        writer = cv2.VideoWriter(
            tmp_path,
            cv2.VideoWriter_fourcc(*"mp4v"),
            COLLISION_CLIP_FPS,
            (width, height),
        )

        for frame in frames:
            if frame is None:
                continue
            fh, fw = frame.shape[:2]
            if fw != width or fh != height:
                frame = cv2.resize(frame, (width, height))
            writer.write(frame)
        writer.release()

        with open(tmp_path, "rb") as file_obj:
            clip_bytes = file_obj.read()

        if not clip_bytes:
            raise RuntimeError("Generated clip file is empty.")

        filename = f"collision_{collision_id}.mp4"
        metadata = {
            "collision_id": collision_id,
            "camera_id": camera_id,
            "recorded_at": datetime.utcnow().isoformat(),
            "duration_seconds": COLLISION_CLIP_SECONDS,
            "pre_event_seconds": COLLISION_PRE_EVENT_SECONDS,
            "post_event_seconds": COLLISION_POST_EVENT_SECONDS,
        }

        file_id = await app.fs_bucket.upload_from_stream(
            filename,
            io.BytesIO(clip_bytes),
            metadata=metadata,
        )

        await db.collisions.update_one(
            {"id": collision_id},
            {
                "$set": {
                    "video_status": "ready",
                    "video_file_id": str(file_id),
                    "video_filename": filename,
                    "video_mime_type": "video/mp4",
                    "video_duration_seconds": COLLISION_CLIP_SECONDS,
                    "video_pre_event_seconds": COLLISION_PRE_EVENT_SECONDS,
                    "video_post_event_seconds": COLLISION_POST_EVENT_SECONDS,
                    "video_recorded_at": datetime.utcnow().isoformat(),
                    "video_error": None,
                }
            },
        )
    except Exception as exc:
        logger.exception("Failed to generate/store collision video clip")
        await db.collisions.update_one(
            {"id": collision_id},
            {"$set": {"video_status": "failed", "video_error": str(exc)}},
        )
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)

async def _queue_collision_video_capture(db, collision: dict, camera: Optional[dict]):
    if not camera or not camera.get("rtsp_url"):
        await db.collisions.update_one(
            {"id": collision.get("id")},
            {"$set": {"video_status": "failed", "video_error": "Camera stream URL unavailable."}},
        )
        return

    asyncio.create_task(_capture_and_store_collision_video(db, collision, camera))

async def ensure_default_captain(db):
    if not await db.users.find_one({"role": "captain"}):
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "username": "captain",
            "email": "captain@safecctv.local", "full_name": "Barangay Captain",
            "role": "captain", "phone_number": "+639123456789",
            "is_active": True, "hashed_password": hash_pw("password"),
            "created_at": datetime.utcnow().isoformat()
        })
        logger.info("Default captain account created  (user: captain / pass: password)")

# ══════════════════════════════════════════════════════════════════════════════
# AUTH
# ══════════════════════════════════════════════════════════════════════════════
@app.post("/api/auth/token")
async def login(form: OAuth2PasswordRequestForm = Depends(), db=Depends(get_db)):
    user = await db.users.find_one({"username": form.username})
    if not user or not verify_pw(form.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    return {"access_token": make_token({"sub": user["id"]}), "token_type": "bearer"}

@app.get("/api/auth/me")
async def me(user=Depends(get_current_user)):
    return clean(dict(user))

# ══════════════════════════════════════════════════════════════════════════════
# CAMERAS
# ══════════════════════════════════════════════════════════════════════════════
class CameraCreate(BaseModel):
    name: str
    location: str
    rtsp_url: str
    ip_address: str
    port: int = 554
    description: Optional[str] = None
    map_latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    map_longitude: Optional[float] = Field(default=None, ge=-180, le=180)

class CameraUpdate(BaseModel):
    name:        Optional[str] = None
    location:    Optional[str] = None
    rtsp_url:    Optional[str] = None
    ip_address:  Optional[str] = None
    port:        Optional[int] = None
    description: Optional[str] = None
    status:      Optional[str] = None
    map_latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    map_longitude: Optional[float] = Field(default=None, ge=-180, le=180)

@app.get("/api/cameras/")
async def list_cameras(db=Depends(get_db), _=Depends(get_current_user)):
    docs = await db.cameras.find().sort("created_at", -1).to_list(None)
    return [clean(d) for d in docs]

@app.get("/api/cameras/{camera_id}/snapshot")
async def camera_snapshot(camera_id: str, db=Depends(get_db), _=Depends(get_current_user)):
    if cv2 is None:
        raise HTTPException(503, "OpenCV is not installed on backend.")

    camera = await db.cameras.find_one({"id": camera_id})
    if not camera:
        raise HTTPException(404, "Camera not found")

    if camera.get("status") != "active":
        raise HTTPException(409, "Camera is not active")

    rtsp_url = camera.get("rtsp_url", "")
    if not rtsp_url:
        raise HTTPException(400, "Camera stream URL is missing")

    worker = clip_recorder.ensure_worker(camera_id, rtsp_url)
    if not worker:
        raise HTTPException(503, "Camera stream is unavailable")

    frame = worker.get_latest_frame()
    if frame is None:
        await asyncio.sleep(0.2)
        frame = worker.get_latest_frame()

    if frame is None:
        raise HTTPException(503, "No frame available yet for this camera")

    ok, encoded = cv2.imencode(
        ".jpg",
        frame,
        [int(cv2.IMWRITE_JPEG_QUALITY), 80],
    )
    if not ok:
        raise HTTPException(500, "Failed to encode camera frame")

    return Response(
        content=encoded.tobytes(),
        media_type="image/jpeg",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )

@app.post("/api/cameras/", status_code=201)
async def create_camera(body: CameraCreate, db=Depends(get_db), _=Depends(captain_only)):
    doc = {"id": str(uuid.uuid4()), "status": "active",
        "created_at": datetime.utcnow().isoformat(), **body.model_dump()}
    await db.cameras.insert_one(doc)
    if doc.get("status") == "active":
        clip_recorder.ensure_worker(doc.get("id", ""), doc.get("rtsp_url", ""))
    return clean(doc)

@app.put("/api/cameras/{camera_id}")
async def update_camera(camera_id: str, body: CameraUpdate, db=Depends(get_db), _=Depends(captain_only)):
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    update["updated_at"] = datetime.utcnow().isoformat()
    result = await db.cameras.find_one_and_update(
        {"id": camera_id}, {"$set": update}, return_document=ReturnDocument.AFTER)
    if not result:
        raise HTTPException(404, "Camera not found")

    if result.get("status") == "active":
        clip_recorder.ensure_worker(result.get("id", ""), result.get("rtsp_url", ""))
    else:
        clip_recorder.remove_worker(result.get("id", ""))

    return clean(result)

@app.delete("/api/cameras/{camera_id}")
async def delete_camera(camera_id: str, db=Depends(get_db), _=Depends(captain_only)):
    result = await db.cameras.delete_one({"id": camera_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Camera not found")
    clip_recorder.remove_worker(camera_id)
    return {"message": "Camera deleted"}

# ══════════════════════════════════════════════════════════════════════════════
# COLLISIONS
# ══════════════════════════════════════════════════════════════════════════════
class CollisionCreate(BaseModel):
    camera_id:        str
    confidence_score: float
    severity:         Optional[str] = "medium"
    description:      Optional[str] = None

class CollisionUpdate(BaseModel):
    status: str  # pending | acknowledged | responded | resolved

@app.get("/api/collisions/")
async def list_collisions(db=Depends(get_db), _=Depends(get_current_user)):
    docs = await db.collisions.find().sort("timestamp", -1).limit(200).to_list(None)
    return [clean(d) for d in docs]

@app.post("/api/collisions/", status_code=201)
async def create_collision(body: CollisionCreate, db=Depends(get_db), _=Depends(get_current_user)):
    camera = await db.cameras.find_one({"id": body.camera_id})
    cam_name = camera["name"] if camera else "Unknown"
    cam_loc  = camera["location"] if camera else "Unknown"
    doc = {
        "id": str(uuid.uuid4()), "camera_id": body.camera_id,
        "camera_name": cam_name, "camera_location": cam_loc,
        "confidence_score": body.confidence_score, "severity": body.severity,
        "description": body.description, "status": "pending",
        "timestamp": datetime.utcnow().isoformat(),
        "acknowledged_by": None, "acknowledged_at": None,
        **_initial_collision_video_fields(),
    }
    await db.collisions.insert_one(doc)
    await _queue_collision_video_capture(db, doc, camera)
    await _send_alerts(db, doc)
    return clean(doc)

@app.put("/api/collisions/{collision_id}")
async def update_collision(collision_id: str, body: CollisionUpdate,
                           db=Depends(get_db), user=Depends(get_current_user)):
    update = {"status": body.status}
    if body.status == "acknowledged":
        update["acknowledged_by"]  = user["full_name"]
        update["acknowledged_at"]  = datetime.utcnow().isoformat()
    result = await db.collisions.find_one_and_update(
        {"id": collision_id}, {"$set": update}, return_document=True)
    if not result:
        raise HTTPException(404, "Collision not found")
    return clean(result)

@app.get("/api/collisions/{collision_id}/video")
async def get_collision_video(collision_id: str, db=Depends(get_db), _=Depends(get_current_user)):
    collision = await db.collisions.find_one({"id": collision_id})
    if not collision:
        raise HTTPException(404, "Collision not found")

    if collision.get("video_status") == "processing":
        raise HTTPException(409, "Collision clip is still being generated.")

    video_file_id = collision.get("video_file_id")
    if not video_file_id:
        raise HTTPException(404, "No video clip available for this collision.")

    try:
        object_id = ObjectId(video_file_id)
    except (InvalidId, TypeError):
        raise HTTPException(500, "Stored collision video reference is invalid.")

    try:
        grid_out = await app.fs_bucket.open_download_stream(object_id)
        video_bytes = await grid_out.read()
    except Exception:
        raise HTTPException(404, "Collision clip file was not found in storage.")

    return Response(
        content=video_bytes,
        media_type=collision.get("video_mime_type", "video/mp4"),
        headers={
            "Content-Disposition": f'inline; filename="{collision.get("video_filename") or f"collision_{collision_id}.mp4"}"'
        },
    )

@app.post("/api/collisions/mock-detection")
async def mock_collision(camera_id: str, db=Depends(get_db), _=Depends(get_current_user)):
    import random
    body = CollisionCreate(camera_id=camera_id,
                           confidence_score=round(random.uniform(0.70, 0.99), 2),
                           severity="high")
    # reuse create logic
    camera = await db.cameras.find_one({"id": camera_id})
    if not camera:
        raise HTTPException(404, "Camera not found")
    doc = {
        "id": str(uuid.uuid4()), "camera_id": camera_id,
        "camera_name": camera["name"], "camera_location": camera["location"],
        "confidence_score": body.confidence_score, "severity": body.severity,
        "description": "Mock collision – testing", "status": "pending",
        "timestamp": datetime.utcnow().isoformat(),
        "acknowledged_by": None, "acknowledged_at": None,
        **_initial_collision_video_fields(),
    }
    await db.collisions.insert_one(doc)
    await _queue_collision_video_capture(db, doc, camera)
    await _send_alerts(db, doc)
    return clean(doc)

# ══════════════════════════════════════════════════════════════════════════════
# USERS
# ══════════════════════════════════════════════════════════════════════════════
class UserCreate(BaseModel):
    username:     str
    email:        str
    full_name:    str
    role:         str   # captain | responder
    phone_number: str
    password:     str

class UserUpdate(BaseModel):
    username:     Optional[str] = None
    full_name:    Optional[str] = None
    email:        Optional[str] = None
    phone_number: Optional[str] = None
    role:         Optional[str] = None
    is_active:    Optional[bool] = None
    password:     Optional[str] = None

@app.get("/api/users/")
async def list_users(db=Depends(get_db), _=Depends(captain_only)):
    docs = await db.users.find().to_list(None)
    return [clean(dict(d)) for d in docs]

@app.post("/api/users/", status_code=201)
async def create_user(body: UserCreate, db=Depends(get_db), _=Depends(captain_only)):
    if await db.users.find_one({"$or": [{"username": body.username}, {"email": body.email}]}):
        raise HTTPException(400, "Username or email already exists")
    doc = {
        "id": str(uuid.uuid4()), "username": body.username,
        "email": body.email, "full_name": body.full_name,
        "role": body.role, "phone_number": body.phone_number,
        "is_active": True, "hashed_password": hash_pw(body.password),
        "created_at": datetime.utcnow().isoformat()
    }
    await db.users.insert_one(doc)
    return clean(dict(doc))

@app.put("/api/users/{user_id}")
async def update_user(user_id: str, body: UserUpdate, db=Depends(get_db), _=Depends(captain_only)):
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}

    # Prevent duplicate username/email when updating an existing account.
    duplicate_checks = []
    if "username" in update:
        duplicate_checks.append({"username": update["username"]})
    if "email" in update:
        duplicate_checks.append({"email": update["email"]})
    if duplicate_checks:
        duplicate = await db.users.find_one({"id": {"$ne": user_id}, "$or": duplicate_checks})
        if duplicate:
            raise HTTPException(400, "Username or email already exists")

    if "password" in update:
        if update["password"]:
            update["hashed_password"] = hash_pw(update.pop("password"))
        else:
            update.pop("password")

    update["updated_at"] = datetime.utcnow().isoformat()
    result = await db.users.find_one_and_update(
        {"id": user_id}, {"$set": update}, return_document=ReturnDocument.AFTER)
    if not result:
        raise HTTPException(404, "User not found")
    return clean(dict(result))

@app.delete("/api/users/{user_id}")
async def delete_user(user_id: str, db=Depends(get_db), user=Depends(captain_only)):
    if user["id"] == user_id:
        raise HTTPException(400, "Cannot delete yourself")
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "User not found")
    return {"message": "User deleted"}

# ══════════════════════════════════════════════════════════════════════════════
# ALERTS
# ══════════════════════════════════════════════════════════════════════════════
class SmsTestRequest(BaseModel):
    camera_id: Optional[str] = None
    message: Optional[str] = None

@app.get("/api/alerts/")
async def list_alerts(db=Depends(get_db), user=Depends(get_current_user)):
    query = {} if user["role"] == "captain" else {"user_id": user["id"]}
    docs  = await db.alerts.find(query).sort("sent_at", -1).limit(200).to_list(None)
    return [clean(d) for d in docs]

async def _send_alerts(db, collision: dict):
    """Send collision SMS alerts to active responders and persist delivery logs."""
    responders = await db.users.find({"is_active": True, "role": "responder"}).to_list(None)
    if not responders:
        logger.warning("No active responders to notify for collision %s", collision.get("id"))
        return

    msg = _build_collision_alert_message(collision)
    for responder in responders:
        send_result = await _send_sms_via_api(responder.get("phone_number", ""), msg)
        await _store_alert_record(
            db=db,
            collision_id=collision.get("id"),
            user_doc=responder,
            message=msg,
            send_result=send_result,
            is_test=False,
        )

@app.post("/api/alerts/test-sms")
async def send_test_sms(body: SmsTestRequest, db=Depends(get_db), captain=Depends(captain_only)):
    if not SMS_API_URL:
        raise HTTPException(400, "SMS API is not configured. Set SMS_API_URL in backend/.env.")

    responders = await db.users.find({"is_active": True, "role": "responder"}).to_list(None)
    if not responders:
        raise HTTPException(400, "No active responders found. Add at least one responder user first.")

    camera = None
    if body.camera_id:
        camera = await db.cameras.find_one({"id": body.camera_id})
        if not camera:
            raise HTTPException(404, "Camera not found")

    if not camera:
        camera = await db.cameras.find_one({"map_latitude": {"$ne": None}, "map_longitude": {"$ne": None}})

    cam_name = camera["name"] if camera else "Unknown camera"
    cam_location = camera["location"] if camera else "Unknown location"

    message = body.message.strip() if body.message and body.message.strip() else (
        f"TEST SMS ALERT: Accident occurred at {cam_name} ({cam_location}). Please verify and respond."
    )

    sent = 0
    failed = 0
    recipients = []

    for responder in responders:
        send_result = await _send_sms_via_api(responder.get("phone_number", ""), message)
        await _store_alert_record(
            db=db,
            collision_id=None,
            user_doc=responder,
            message=message,
            send_result=send_result,
            is_test=True,
            triggered_by=captain.get("id"),
        )

        if send_result.get("ok"):
            sent += 1
        else:
            failed += 1

        recipients.append({
            "name": responder.get("full_name"),
            "phone_number": responder.get("phone_number"),
            "status": "sent" if send_result.get("ok") else "failed",
            "error": send_result.get("error"),
        })

    return {
        "message": "Test SMS dispatch completed.",
        "total_recipients": len(responders),
        "sent": sent,
        "failed": failed,
        "recipients": recipients,
    }

# ══════════════════════════════════════════════════════════════════════════════
# DASHBOARD STATS
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/dashboard/stats")
async def dashboard_stats(db=Depends(get_db), _=Depends(get_current_user)):
    total_cameras  = await db.cameras.count_documents({})
    active_cameras = await db.cameras.count_documents({"status": "active"})
    total_col      = await db.collisions.count_documents({})
    pending_col    = await db.collisions.count_documents({"status": "pending"})
    total_alerts   = await db.alerts.count_documents({})
    return {
        "total_cameras":   total_cameras,
        "active_cameras":  active_cameras,
        "total_collisions": total_col,
        "pending_collisions": pending_col,
        "total_alerts":    total_alerts,
    }

# ══════════════════════════════════════════════════════════════════════════════
# HEALTH
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "SafeCCTV API"}
