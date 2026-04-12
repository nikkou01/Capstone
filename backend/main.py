from fastapi import FastAPI, Depends, HTTPException, status, Response, Request, Query
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
from pymongo import ReturnDocument
from pydantic import BaseModel, Field
from passlib.context import CryptContext
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Set, Tuple
from pathlib import Path
from collections import deque
from urllib.parse import urlsplit, parse_qsl, urlencode, urlunsplit
from bson import ObjectId
from bson.errors import InvalidId
import os, uuid, jwt, logging, json, base64, asyncio, io, threading, tempfile, time, math
import subprocess
import importlib
import re
import httpx
from dotenv import load_dotenv

try:
    import cv2
except Exception:
    cv2 = None

try:
    from ultralytics import YOLO
    ULTRALYTICS_IMPORT_ERROR = None
except Exception as exc:
    YOLO = None
    ULTRALYTICS_IMPORT_ERROR = str(exc)

try:
    _imageio_ffmpeg = importlib.import_module("imageio_ffmpeg")
except Exception:
    _imageio_ffmpeg = None

load_dotenv(Path(__file__).parent / ".env")

# Prefer low-latency ffmpeg options when OpenCV uses FFmpeg backend.
if "OPENCV_FFMPEG_CAPTURE_OPTIONS" not in os.environ:
    rtsp_transport = os.getenv("LIVE_RTSP_TRANSPORT", "udp").strip().lower()
    if rtsp_transport not in ("udp", "tcp"):
        rtsp_transport = "udp"

    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
        f"rtsp_transport;{rtsp_transport}|fflags;nobuffer|flags;low_delay|"
        "max_delay;0|reorder_queue_size;0|analyzeduration;0|probesize;32|flush_packets;1"
    )

# ── Config ────────────────────────────────────────────────────────────────────
MONGO_URL   = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME     = os.getenv("DB_NAME", "safesight")
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
LIVE_STREAM_FPS = max(int(os.getenv("LIVE_STREAM_FPS", "30")), 0)
LIVE_STREAM_DRAIN_GRABS = max(int(os.getenv("LIVE_STREAM_DRAIN_GRABS", "0")), 0)
LIVE_STREAM_MAX_CATCHUP_GRABS = max(int(os.getenv("LIVE_STREAM_MAX_CATCHUP_GRABS", "4")), 0)
LIVE_STREAM_JPEG_QUALITY = max(min(int(os.getenv("LIVE_STREAM_JPEG_QUALITY", "60")), 95), 40)
LIVE_STREAM_MAX_WIDTH = max(int(os.getenv("LIVE_STREAM_MAX_WIDTH", "960")), 0)
LIVE_STREAM_MAX_HEIGHT = max(int(os.getenv("LIVE_STREAM_MAX_HEIGHT", "0")), 0)
LIVE_STREAM_MAX_READ_FAILURES = max(int(os.getenv("LIVE_STREAM_MAX_READ_FAILURES", "20")), 1)
RTSP_VALIDATION_TIMEOUT_SECONDS = max(float(os.getenv("RTSP_VALIDATION_TIMEOUT_SECONDS", "5")), 1.0)
RTSP_VALIDATION_RETRY_INTERVAL_SECONDS = max(float(os.getenv("RTSP_VALIDATION_RETRY_INTERVAL_SECONDS", "0.05")), 0.01)
CAMERA_RECONNECT_FAIL_AFTER_SECONDS = max(int(os.getenv("CAMERA_RECONNECT_FAIL_AFTER_SECONDS", "30")), 10)
LIVE_FORCE_SUBTYPE0 = os.getenv("LIVE_FORCE_SUBTYPE0", "1").strip().lower() in ("1", "true", "yes", "on")
PREBUFFER_ACTIVE_CAMERAS_ON_STARTUP = os.getenv("PREBUFFER_ACTIVE_CAMERAS_ON_STARTUP", "0").strip().lower() in (
    "1", "true", "yes", "on"
)
DETECTION_ENABLED = os.getenv("DETECTION_ENABLED", "0").strip().lower() in ("1", "true", "yes", "on")
DETECTION_MODEL_PATH = os.getenv("DETECTION_MODEL_PATH", "backend/models/best.pt").strip()
DETECTION_CONFIDENCE_THRESHOLD = min(max(float(os.getenv("DETECTION_CONFIDENCE_THRESHOLD", "0.60")), 0.0), 1.0)
DETECTION_COOLDOWN_SECONDS = max(float(os.getenv("DETECTION_COOLDOWN_SECONDS", "12")), 0.0)
DETECTION_POLL_INTERVAL_SECONDS = max(float(os.getenv("DETECTION_POLL_INTERVAL_SECONDS", "0.40")), 0.05)
DETECTION_ALLOWED_CLASS_IDS = os.getenv("DETECTION_ALLOWED_CLASS_IDS", "").strip()
DETECTION_ALLOWED_CLASS_NAMES = os.getenv("DETECTION_ALLOWED_CLASS_NAMES", "").strip()
DETECTION_DESCRIPTION_PREFIX = os.getenv("DETECTION_DESCRIPTION_PREFIX", "Auto-detected collision").strip() or "Auto-detected collision"
COLLISION_PRE_EVENT_SECONDS = min(COLLISION_PRE_EVENT_SECONDS, COLLISION_CLIP_SECONDS - 1)
COLLISION_POST_EVENT_SECONDS = COLLISION_CLIP_SECONDS - COLLISION_PRE_EVENT_SECONDS
ALLOWED_CAMERA_STATUSES = {"active", "inactive", "maintenance", "failed"}

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def _utc_now() -> datetime:
    return datetime.now(timezone.utc)

def _utc_now_iso() -> str:
    return _utc_now().isoformat()

def _parse_iso_datetime(value: str) -> Optional[datetime]:
    if not value:
        return None

    raw = str(value).strip()
    if not raw:
        return None

    if raw.endswith("Z"):
        raw = f"{raw[:-1]}+00:00"
    elif len(raw) >= 19 and raw[10] == "T":
        tz_tail = raw[19:]
        if not tz_tail or ("+" not in tz_tail and "-" not in tz_tail):
            raw = f"{raw}+00:00"

    try:
        parsed = datetime.fromisoformat(raw)
    except Exception:
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed

def _parse_csv_int_set(raw_value: str) -> Set[int]:
    values: Set[int] = set()
    if not raw_value:
        return values

    for token in raw_value.split(","):
        item = token.strip()
        if not item:
            continue
        try:
            values.add(int(item))
        except Exception:
            logger.warning("Ignoring invalid DETECTION_ALLOWED_CLASS_IDS token: %s", item)
    return values

def _parse_csv_str_set(raw_value: str) -> Set[str]:
    values: Set[str] = set()
    if not raw_value:
        return values

    for token in raw_value.split(","):
        item = token.strip().lower()
        if item:
            values.add(item)
    return values

def _normalize_collision_severity(value: Optional[str]) -> str:
    severity_value = str(value or "medium").strip().lower()
    if severity_value not in {"low", "medium", "high"}:
        severity_value = "medium"
    return severity_value

def _severity_from_confidence(confidence_score: float) -> str:
    if confidence_score >= 0.90:
        return "high"
    if confidence_score >= 0.75:
        return "medium"
    return "low"

def _tune_capture_for_low_latency(capture):
    if capture is None:
        return

    for prop_name, value in (
        ("CAP_PROP_BUFFERSIZE", 1),
        ("CAP_PROP_FPS", LIVE_STREAM_FPS if LIVE_STREAM_FPS > 0 else 30),
        ("CAP_PROP_OPEN_TIMEOUT_MSEC", 3000),
        ("CAP_PROP_READ_TIMEOUT_MSEC", 1000),
    ):
        if hasattr(cv2, prop_name):
            try:
                capture.set(getattr(cv2, prop_name), value)
            except Exception:
                pass

def _open_capture(rtsp_url: str):
    capture = None

    if hasattr(cv2, "CAP_FFMPEG"):
        try:
            capture = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
        except Exception:
            capture = None

    if capture is None or not capture.isOpened():
        if capture is not None:
            capture.release()
        capture = cv2.VideoCapture(rtsp_url)

    _tune_capture_for_low_latency(capture)
    return capture

def _resize_frame_for_live(frame):
    if frame is None or LIVE_STREAM_MAX_WIDTH <= 0 and LIVE_STREAM_MAX_HEIGHT <= 0:
        return frame

    try:
        height, width = frame.shape[:2]
    except Exception:
        return frame

    scale = 1.0
    if LIVE_STREAM_MAX_WIDTH > 0 and width > LIVE_STREAM_MAX_WIDTH:
        scale = min(scale, LIVE_STREAM_MAX_WIDTH / float(width))
    if LIVE_STREAM_MAX_HEIGHT > 0 and height > LIVE_STREAM_MAX_HEIGHT:
        scale = min(scale, LIVE_STREAM_MAX_HEIGHT / float(height))

    if scale >= 1.0:
        return frame

    next_width = max(int(width * scale), 1)
    next_height = max(int(height * scale), 1)

    try:
        return cv2.resize(frame, (next_width, next_height), interpolation=cv2.INTER_AREA)
    except Exception:
        return frame

def _normalize_camera_status(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None

    status_value = str(value).strip().lower()
    if not status_value:
        raise HTTPException(422, "Camera status cannot be empty.")
    if status_value == "error":
        status_value = "failed"
    if status_value not in ALLOWED_CAMERA_STATUSES:
        allowed = ", ".join(sorted(ALLOWED_CAMERA_STATUSES))
        raise HTTPException(422, f"Invalid camera status '{status_value}'. Allowed: {allowed}.")
    return status_value

def _probe_rtsp_stream_sync(rtsp_url: str):
    if cv2 is None:
        return False, "OpenCV is not installed on backend."

    candidate = (rtsp_url or "").strip()
    if not candidate:
        return False, "Camera stream URL is missing."
    if not candidate.lower().startswith("rtsp://"):
        return False, "RTSP URL must start with rtsp://"

    capture = None
    effective_rtsp_url = _prefer_main_stream_rtsp(candidate)

    try:
        capture = _open_capture(effective_rtsp_url)
        if capture is None or not capture.isOpened():
            return False, "Unable to open RTSP stream. Check stream URL, credentials, and path."

        deadline = time.perf_counter() + RTSP_VALIDATION_TIMEOUT_SECONDS
        while time.perf_counter() < deadline:
            if capture.grab():
                ok, frame = capture.retrieve()
                if ok and frame is not None:
                    return True, ""
            time.sleep(RTSP_VALIDATION_RETRY_INTERVAL_SECONDS)

        return False, (
            "RTSP stream opened but no frames were received within "
            f"{RTSP_VALIDATION_TIMEOUT_SECONDS:.1f}s."
        )
    except Exception as exc:
        return False, f"RTSP validation error: {exc}"
    finally:
        if capture is not None:
            capture.release()

async def _ensure_rtsp_reachable(rtsp_url: str):
    loop = asyncio.get_running_loop()
    ok, detail = await loop.run_in_executor(None, _probe_rtsp_stream_sync, rtsp_url)
    if not ok:
        raise HTTPException(400, detail)

def _prefer_main_stream_rtsp(rtsp_url: str) -> str:
    if not LIVE_FORCE_SUBTYPE0 or not rtsp_url or "subtype=" not in rtsp_url.lower():
        return rtsp_url

    try:
        parsed = urlsplit(rtsp_url)
        query_pairs = parse_qsl(parsed.query, keep_blank_values=True)
        changed = False
        next_pairs = []

        for key, value in query_pairs:
            if key.lower() == "subtype" and value.strip() == "1":
                next_pairs.append((key, "0"))
                changed = True
            else:
                next_pairs.append((key, value))

        if not changed:
            return rtsp_url

        new_query = urlencode(next_pairs)
        updated = urlunsplit((parsed.scheme, parsed.netloc, parsed.path, new_query, parsed.fragment))
        logger.info("Camera stream adjusted to low-latency main stream (subtype=0)")
        return updated
    except Exception:
        return rtsp_url

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
        self.latest_frame_ts = None
        self.latest_jpeg = None
        self.latest_jpeg_ts = None
        self._buffer_interval_ns = int(1_000_000_000 / max(target_fps, 1))
        self._last_buffer_append_ns = 0
        self._drain_grabs = LIVE_STREAM_DRAIN_GRABS
        self._max_catchup_grabs = LIVE_STREAM_MAX_CATCHUP_GRABS
        self._live_encode_interval_ns = int(1_000_000_000 / LIVE_STREAM_FPS) if LIVE_STREAM_FPS > 0 else 0
        self._last_live_encode_ns = 0
        self._last_capture_ns = 0
        self._base_sleep_s = max(1.0 / max(target_fps, 1), 0.02)
        self._live_subscribers = 0
        self._max_read_failures = LIVE_STREAM_MAX_READ_FAILURES
        self._read_failures = 0
        now_ns = time.time_ns()
        self._created_ns = now_ns
        self._last_frame_ok_ns = 0
        self._last_open_attempt_ns = 0
        self._last_open_success_ns = 0
        self._last_failure_ns = 0
        self._last_failure_reason = ""
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

    def get_latest_frame_packet(self):
        with self.lock:
            if self.latest_frame is None or self.latest_frame_ts is None:
                return None, None
            return self.latest_frame.copy(), self.latest_frame_ts

    def get_latest_jpeg_packet(self):
        with self.lock:
            if self.latest_jpeg is None or self.latest_jpeg_ts is None:
                return None, None
            return self.latest_jpeg, self.latest_jpeg_ts

    def add_live_subscriber(self):
        with self.lock:
            self._live_subscribers += 1

    def remove_live_subscriber(self):
        with self.lock:
            self._live_subscribers = max(self._live_subscribers - 1, 0)

    def has_live_subscribers(self):
        with self.lock:
            return self._live_subscribers > 0

    def mark_failure(self, reason: str):
        with self.lock:
            self._last_failure_ns = time.time_ns()
            self._last_failure_reason = reason

    def mark_open_attempt(self):
        with self.lock:
            self._last_open_attempt_ns = time.time_ns()

    def mark_open_success(self):
        with self.lock:
            now_ns = time.time_ns()
            self._last_open_success_ns = now_ns
            self._last_failure_ns = 0
            self._last_failure_reason = ""

    def mark_frame_ok(self, frame_ts_ns: int):
        with self.lock:
            self._last_frame_ok_ns = frame_ts_ns
            self._last_failure_ns = 0
            self._last_failure_reason = ""

    def get_health_snapshot(self):
        with self.lock:
            return {
                "created_ns": self._created_ns,
                "last_frame_ok_ns": self._last_frame_ok_ns,
                "last_open_attempt_ns": self._last_open_attempt_ns,
                "last_open_success_ns": self._last_open_success_ns,
                "last_failure_ns": self._last_failure_ns,
                "last_failure_reason": self._last_failure_reason,
            }

    def is_reconnect_stalled(self, fail_after_seconds: int):
        if fail_after_seconds <= 0:
            return False

        snapshot = self.get_health_snapshot()
        threshold_ns = int(fail_after_seconds * 1_000_000_000)
        now_ns = time.time_ns()
        last_ok_ns = snapshot["last_frame_ok_ns"] or snapshot["last_open_success_ns"] or snapshot["created_ns"]
        is_stale = (now_ns - last_ok_ns) >= threshold_ns
        has_failure_after_ok = snapshot["last_failure_ns"] >= last_ok_ns
        return is_stale and has_failure_after_ok

    def _run(self):
        if cv2 is None:
            logger.error("OpenCV not available. Collision clip buffering is disabled.")
            return

        capture = None

        while not self.stop_event.is_set():
            if capture is None or not capture.isOpened():
                self.mark_open_attempt()
                capture = _open_capture(self.rtsp_url)
                if capture is None or not capture.isOpened():
                    self.mark_failure("Unable to open camera stream")
                    logger.warning("Unable to open stream for camera %s", self.camera_id)
                    time.sleep(0.3)
                    continue
                self._read_failures = 0
                self.mark_open_success()

            loop_now_ns = time.time_ns()
            live_active = self.has_live_subscribers()

            drain_grabs = self._drain_grabs
            # Keep the stream close to realtime by catching up only when loop cadence falls behind.
            if self._last_capture_ns > 0 and self._live_encode_interval_ns > 0:
                elapsed_ns = loop_now_ns - self._last_capture_ns
                if elapsed_ns > self._live_encode_interval_ns:
                    behind = int(elapsed_ns // self._live_encode_interval_ns) - 1
                    if behind > 0:
                        drain_grabs = max(drain_grabs, min(behind, self._max_catchup_grabs))

            if not live_active:
                # When no live viewers are connected, still drain a little so the next viewer doesn't start stale.
                drain_grabs = max(drain_grabs, 1)

            # Grab first to avoid decoding stale queued frames, then optionally drain more grabs.
            if not capture.grab():
                self.mark_failure("Failed to grab frame from camera stream")
                self._read_failures += 1
                if self._read_failures >= self._max_read_failures:
                    if capture is not None:
                        capture.release()
                        capture = None
                    self._read_failures = 0
                    time.sleep(0.05)
                else:
                    time.sleep(0.005)
                continue

            if drain_grabs > 0:
                for _ in range(drain_grabs):
                    if not capture.grab():
                        break

            ok, frame = capture.retrieve()
            if not ok or frame is None:
                self.mark_failure("Failed to decode frame from camera stream")
                self._read_failures += 1
                if self._read_failures >= self._max_read_failures:
                    if capture is not None:
                        capture.release()
                        capture = None
                    self._read_failures = 0
                    time.sleep(0.05)
                else:
                    time.sleep(0.005)
                continue

            self._read_failures = 0

            now_dt = _utc_now()
            now_ns = time.time_ns()
            self._last_capture_ns = now_ns
            self.mark_frame_ok(now_ns)
            should_store_frame = (
                self._last_buffer_append_ns == 0
                or (now_ns - self._last_buffer_append_ns) >= self._buffer_interval_ns
            )

            jpeg_payload = None
            if live_active:
                if (
                    self._live_encode_interval_ns == 0
                    or self._last_live_encode_ns == 0
                    or (now_ns - self._last_live_encode_ns) >= self._live_encode_interval_ns
                ):
                    frame_for_live = _resize_frame_for_live(frame)
                    ok_jpeg, encoded_jpeg = cv2.imencode(
                        ".jpg",
                        frame_for_live,
                        [int(cv2.IMWRITE_JPEG_QUALITY), LIVE_STREAM_JPEG_QUALITY],
                    )
                    if ok_jpeg:
                        jpeg_payload = encoded_jpeg.tobytes()
                        self._last_live_encode_ns = now_ns

            with self.lock:
                if jpeg_payload is not None:
                    self.latest_jpeg = jpeg_payload
                    self.latest_jpeg_ts = now_ns

                if should_store_frame:
                    frame_copy = frame.copy()
                    self.latest_frame = frame_copy
                    self.latest_frame_ts = now_ns
                    self.buffer.append((now_dt, frame_copy))
                    self._last_buffer_append_ns = now_ns

            if not live_active:
                time.sleep(self._base_sleep_s)

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

        effective_rtsp_url = _prefer_main_stream_rtsp(rtsp_url)

        with self._lock:
            worker = self._workers.get(camera_id)
            if worker and worker.rtsp_url == effective_rtsp_url:
                return worker

            if worker:
                worker.stop()

            worker = CameraPreBufferWorker(
                camera_id=camera_id,
                rtsp_url=effective_rtsp_url,
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

    def get_worker(self, camera_id: str):
        with self._lock:
            return self._workers.get(camera_id)

    def stop_all(self):
        with self._lock:
            workers = list(self._workers.values())
            self._workers.clear()
        for worker in workers:
            worker.stop()

clip_recorder = CollisionClipRecorder()

class LiveCollisionDetectionService:
    """Runs collision inference on active camera frames and writes events to DB."""

    def __init__(self):
        project_root = Path(__file__).resolve().parent.parent
        model_path = Path(DETECTION_MODEL_PATH).expanduser()
        if not model_path.is_absolute():
            model_path = (project_root / model_path).resolve()

        self.model_path = model_path
        self.enabled = DETECTION_ENABLED
        self.confidence_threshold = DETECTION_CONFIDENCE_THRESHOLD
        self.cooldown_seconds = DETECTION_COOLDOWN_SECONDS
        self.poll_interval_seconds = DETECTION_POLL_INTERVAL_SECONDS
        self.allowed_class_ids = _parse_csv_int_set(DETECTION_ALLOWED_CLASS_IDS)
        self.allowed_class_names = _parse_csv_str_set(DETECTION_ALLOWED_CLASS_NAMES)
        self.description_prefix = DETECTION_DESCRIPTION_PREFIX

        self.db = None
        self._task = None
        self._stop_event = asyncio.Event()
        self._model = None
        self._model_lock = threading.Lock()
        self._last_processed_frame_ts: Dict[str, int] = {}
        self._last_detection_ts: Dict[str, float] = {}
        self._last_error = ""
        self._last_detection = None

        # Collision heuristic state (derived from validated offline test logic).
        self.track_match_iou = 0.30
        self.max_ghost_frames = 15
        self.ghost_box_fraction_limit = 0.25
        self.ghost_margin_px = 80
        self.ghost_id_switch_iou = 0.80
        self.moving_speed_threshold = 5.0
        self.crash_drop_factor = 0.50
        self.safe_pass_factor = 0.70
        self.collision_iou = 0.15
        self.ghost_collision_iou = 0.02
        self.confirmation_frames = 2

        self._camera_histories: Dict[str, Dict[int, dict]] = {}
        self._camera_pair_collision_frames: Dict[str, Dict[Tuple[int, int], int]] = {}
        self._camera_next_track_id: Dict[str, int] = {}

    async def start(self, db):
        self.db = db
        if self._task and not self._task.done():
            return

        self._stop_event = asyncio.Event()
        self._task = asyncio.create_task(self._run_loop(), name="live-collision-detector")

        if self.enabled:
            logger.info(
                "Live collision detection is enabled (model=%s, conf>=%.2f)",
                self.model_path,
                self.confidence_threshold,
            )
        else:
            logger.info("Live collision detection is disabled. Set DETECTION_ENABLED=1 to activate.")

    async def stop(self):
        if not self._task:
            return

        self._stop_event.set()
        try:
            await asyncio.wait_for(self._task, timeout=5)
        except Exception:
            self._task.cancel()
        finally:
            self._task = None

    def status(self) -> dict:
        running = bool(self._task and not self._task.done())
        task_exception = None
        if self._task and self._task.done():
            try:
                task_exception = self._task.exception()
                if task_exception is not None:
                    task_exception = str(task_exception)
            except Exception:
                task_exception = "Unable to retrieve task exception."

        return {
            "enabled": self.enabled,
            "running": running,
            "task_done": bool(self._task.done()) if self._task else False,
            "task_exception": task_exception,
            "model_path": str(self.model_path),
            "model_exists": self.model_path.exists(),
            "model_loaded": self._model is not None,
            "confidence_threshold": self.confidence_threshold,
            "cooldown_seconds": self.cooldown_seconds,
            "poll_interval_seconds": self.poll_interval_seconds,
            "allowed_class_ids": sorted(self.allowed_class_ids),
            "allowed_class_names": sorted(self.allowed_class_names),
            "last_error": self._last_error or None,
            "last_detection": self._last_detection,
        }

    def set_enabled(self, enabled: bool):
        self.enabled = bool(enabled)

    async def test_camera(self, camera_id: str, create_event: bool = True) -> dict:
        if self.db is None:
            raise HTTPException(503, "Detection service is not initialized.")

        camera = await self.db.cameras.find_one({"id": camera_id})
        if not camera:
            raise HTTPException(404, "Camera not found")

        rtsp_url = str(camera.get("rtsp_url") or "").strip()
        if not rtsp_url:
            raise HTTPException(400, "Camera stream URL is missing")

        worker = clip_recorder.ensure_worker(camera_id, rtsp_url)
        if not worker:
            raise HTTPException(503, "Camera stream worker is unavailable")

        frame, frame_ts = worker.get_latest_frame_packet()
        if frame is None or frame_ts is None:
            raise HTTPException(409, "No camera frame available yet. Try again in a few seconds.")

        loop = asyncio.get_running_loop()
        inference = await loop.run_in_executor(None, self._detect_frame_sync, camera_id, frame)
        if not inference.get("detected"):
            return {
                "detected": False,
                "camera_id": camera_id,
                "frame_timestamp": frame_ts,
                "detail": inference.get("error") or "No collision detected on this frame.",
                "candidate_count": int(inference.get("candidate_count", 0)),
                "top_candidates": inference.get("top_candidates") or [],
            }

        confidence = float(inference["confidence"])
        class_name = inference.get("class_name") or "collision"
        class_id = int(inference.get("class_id", -1))
        created_collision_id = None

        if create_event:
            severity = _severity_from_confidence(confidence)
            description = f"{self.description_prefix}: class={class_name}, confidence={confidence:.0%}"
            created = await _create_collision_entry(
                db=self.db,
                camera_id=camera_id,
                confidence_score=confidence,
                severity=severity,
                description=description,
                camera_doc=camera,
            )
            created_collision_id = created.get("id")

        return {
            "detected": True,
            "camera_id": camera_id,
            "frame_timestamp": frame_ts,
            "class_id": class_id,
            "class_name": class_name,
            "confidence": confidence,
            "pair_id": inference.get("pair_id") or None,
            "event_created": bool(created_collision_id),
            "collision_id": created_collision_id,
            "candidate_count": int(inference.get("candidate_count", 0)),
            "top_candidates": inference.get("top_candidates") or [],
        }

    async def _run_loop(self):
        while not self._stop_event.is_set():
            if not self.enabled or self.db is None:
                await asyncio.sleep(1.0)
                continue

            try:
                cameras = await self.db.cameras.find({"status": "active"}).to_list(None)
                for camera in cameras:
                    if self._stop_event.is_set() or not self.enabled:
                        break
                    await self._process_camera(camera)
            except Exception as exc:
                self._last_error = str(exc)
                logger.exception("Live collision detection loop failed")

            await asyncio.sleep(self.poll_interval_seconds)

    async def _process_camera(self, camera: dict):
        camera_id = str(camera.get("id") or "")
        rtsp_url = str(camera.get("rtsp_url") or "").strip()
        if not camera_id or not rtsp_url:
            return

        worker = clip_recorder.ensure_worker(camera_id, rtsp_url)
        if not worker:
            return

        frame, frame_ts = worker.get_latest_frame_packet()
        if frame is None or frame_ts is None:
            return

        if self._last_processed_frame_ts.get(camera_id) == frame_ts:
            return
        self._last_processed_frame_ts[camera_id] = frame_ts

        now_ts = time.time()
        last_detection_ts = self._last_detection_ts.get(camera_id, 0.0)
        if self.cooldown_seconds > 0 and (now_ts - last_detection_ts) < self.cooldown_seconds:
            return

        loop = asyncio.get_running_loop()
        inference = await loop.run_in_executor(None, self._detect_frame_sync, camera_id, frame)
        if not inference.get("detected"):
            return

        confidence = float(inference["confidence"])
        class_name = inference.get("class_name") or "collision"
        class_id = int(inference.get("class_id", -1))
        severity = _severity_from_confidence(confidence)
        description = f"{self.description_prefix}: class={class_name}, confidence={confidence:.0%}"

        created = await _create_collision_entry(
            db=self.db,
            camera_id=camera_id,
            confidence_score=confidence,
            severity=severity,
            description=description,
            camera_doc=camera,
        )

        self._last_detection_ts[camera_id] = now_ts
        self._last_detection = {
            "collision_id": created.get("id"),
            "camera_id": camera_id,
            "class_id": class_id,
            "class_name": class_name,
            "confidence": confidence,
            "pair_id": inference.get("pair_id") or None,
            "timestamp": _utc_now_iso(),
        }
        logger.info(
            "Auto collision detected on camera %s (class=%s, conf=%.2f)",
            camera_id,
            class_name,
            confidence,
        )

    def _get_iou(self, box1: List[float], box2: List[float]) -> float:
        x_left = max(float(box1[0]), float(box2[0]))
        y_top = max(float(box1[1]), float(box2[1]))
        x_right = min(float(box1[2]), float(box2[2]))
        y_bottom = min(float(box1[3]), float(box2[3]))

        if x_right <= x_left or y_bottom <= y_top:
            return 0.0

        intersection = (x_right - x_left) * (y_bottom - y_top)
        area1 = max((float(box1[2]) - float(box1[0])) * (float(box1[3]) - float(box1[1])), 0.0)
        area2 = max((float(box2[2]) - float(box2[0])) * (float(box2[3]) - float(box2[1])), 0.0)
        union = area1 + area2 - intersection
        return float(intersection / union) if union > 0 else 0.0

    def _update_kinematics(
        self,
        camera_history: Dict[int, dict],
        track_id: int,
        center: Tuple[float, float],
        coords: List[float],
        class_id: Optional[int] = None,
        class_name: Optional[str] = None,
        confidence: Optional[float] = None,
    ) -> dict:
        if track_id not in camera_history:
            camera_history[track_id] = {
                "center": center,
                "coords": coords,
                "current_speed": self.moving_speed_threshold,
                "avg_speed": self.moving_speed_threshold,
                "lost_frames": 0,
                "age": 1,
                "class_id": int(class_id) if class_id is not None else -1,
                "class_name": str(class_name) if class_name is not None else "unknown",
                "confidence": float(confidence) if confidence is not None else 0.0,
            }
            return camera_history[track_id]

        prev = camera_history[track_id]
        dist = math.hypot(center[0] - prev["center"][0], center[1] - prev["center"][1])
        avg = (float(prev.get("avg_speed", self.moving_speed_threshold)) * 0.8) + (dist * 0.2)

        next_state = {
            "center": center,
            "coords": coords,
            "current_speed": dist,
            "avg_speed": avg,
            "lost_frames": 0,
            "age": int(prev.get("age", 1)) + 1,
            "class_id": int(prev.get("class_id", -1)),
            "class_name": str(prev.get("class_name", "unknown")),
            "confidence": float(prev.get("confidence", 0.0)),
        }

        if class_id is not None:
            next_state["class_id"] = int(class_id)
        if class_name is not None:
            next_state["class_name"] = str(class_name)
        if confidence is not None:
            next_state["confidence"] = float(confidence)

        camera_history[track_id] = next_state
        return next_state

    def _detect_frame_sync(self, camera_id: str, frame) -> dict:
        model = self._ensure_model_loaded_sync()
        if model is None:
            return {
                "detected": False,
                "error": self._last_error or "YOLO model is unavailable.",
            }

        try:
            results = model.predict(
                source=frame,
                conf=self.confidence_threshold,
                iou=0.85,
                verbose=False,
            )
        except Exception as exc:
            self._last_error = f"Inference failed: {exc}"
            logger.exception("YOLO inference failed")
            return {"detected": False, "error": self._last_error}

        if frame is None or getattr(frame, "shape", None) is None or len(frame.shape) < 2:
            return {"detected": False, "error": "Invalid frame for collision analysis."}

        frame_height = int(frame.shape[0])
        frame_width = int(frame.shape[1])

        all_candidates = []
        detections = []
        for result in results:
            boxes = getattr(result, "boxes", None)
            names_lookup = getattr(result, "names", None) or getattr(model, "names", None) or {}
            if boxes is None:
                continue

            for box in boxes:
                try:
                    confidence = float(box.conf.item()) if hasattr(box.conf, "item") else float(box.conf[0])
                    class_id = int(box.cls.item()) if hasattr(box.cls, "item") else int(box.cls[0])
                except Exception:
                    continue

                if isinstance(names_lookup, dict):
                    class_name = str(names_lookup.get(class_id, class_id))
                elif isinstance(names_lookup, (list, tuple)) and 0 <= class_id < len(names_lookup):
                    class_name = str(names_lookup[class_id])
                else:
                    class_name = str(class_id)

                coords_tensor = getattr(box, "xyxy", None)
                if coords_tensor is None:
                    continue

                try:
                    raw_coords = coords_tensor.tolist() if hasattr(coords_tensor, "tolist") else list(coords_tensor)
                    if raw_coords and isinstance(raw_coords[0], (list, tuple)):
                        coords = [float(v) for v in raw_coords[0]]
                    else:
                        coords = [float(v) for v in raw_coords]
                except Exception:
                    continue

                if len(coords) != 4:
                    continue

                all_candidates.append(
                    {
                        "class_id": class_id,
                        "class_name": class_name,
                        "confidence": confidence,
                    }
                )

                if self.allowed_class_ids and class_id not in self.allowed_class_ids:
                    continue
                if self.allowed_class_names and class_name.strip().lower() not in self.allowed_class_names:
                    continue

                detections.append(
                    {
                        "coords": coords,
                        "class_id": class_id,
                        "class_name": class_name,
                        "confidence": confidence,
                    }
                )

        camera_history = self._camera_histories.setdefault(camera_id, {})
        pair_collision_frames = self._camera_pair_collision_frames.setdefault(camera_id, {})
        next_track_id = int(self._camera_next_track_id.get(camera_id, 1))

        vehicles = []
        seen_ids: Set[int] = set()

        unmatched_det_indices = set(range(len(detections)))
        unmatched_track_ids = set(camera_history.keys())
        match_candidates: List[Tuple[float, int, int]] = []

        for det_index, det in enumerate(detections):
            for track_id, track_state in camera_history.items():
                if int(track_state.get("lost_frames", 0)) > self.max_ghost_frames:
                    continue
                previous_coords = track_state.get("coords")
                if not previous_coords or len(previous_coords) != 4:
                    continue
                iou = self._get_iou(det["coords"], previous_coords)
                if iou >= self.track_match_iou:
                    match_candidates.append((iou, det_index, track_id))

        for _, det_index, track_id in sorted(match_candidates, key=lambda item: item[0], reverse=True):
            if det_index not in unmatched_det_indices or track_id not in unmatched_track_ids:
                continue

            det = detections[det_index]
            cx = (det["coords"][0] + det["coords"][2]) / 2.0
            cy = (det["coords"][1] + det["coords"][3]) / 2.0
            kinematics = self._update_kinematics(
                camera_history=camera_history,
                track_id=track_id,
                center=(cx, cy),
                coords=det["coords"],
                class_id=det["class_id"],
                class_name=det["class_name"],
                confidence=det["confidence"],
            )
            vehicles.append(
                {
                    "id": track_id,
                    "coords": det["coords"],
                    "kinematics": kinematics,
                    "confidence": float(det["confidence"]),
                    "class_id": int(det["class_id"]),
                    "class_name": str(det["class_name"]),
                    "is_ghost": False,
                }
            )
            seen_ids.add(track_id)
            unmatched_det_indices.remove(det_index)
            unmatched_track_ids.remove(track_id)

        for det_index in sorted(unmatched_det_indices):
            det = detections[det_index]
            track_id = next_track_id
            next_track_id += 1

            cx = (det["coords"][0] + det["coords"][2]) / 2.0
            cy = (det["coords"][1] + det["coords"][3]) / 2.0
            kinematics = self._update_kinematics(
                camera_history=camera_history,
                track_id=track_id,
                center=(cx, cy),
                coords=det["coords"],
                class_id=det["class_id"],
                class_name=det["class_name"],
                confidence=det["confidence"],
            )
            vehicles.append(
                {
                    "id": track_id,
                    "coords": det["coords"],
                    "kinematics": kinematics,
                    "confidence": float(det["confidence"]),
                    "class_id": int(det["class_id"]),
                    "class_name": str(det["class_name"]),
                    "is_ghost": False,
                }
            )
            seen_ids.add(track_id)

        self._camera_next_track_id[camera_id] = next_track_id

        for track_id in sorted(unmatched_track_ids):
            if track_id not in camera_history:
                continue

            data = camera_history[track_id]
            data["lost_frames"] = int(data.get("lost_frames", 0)) + 1

            if data["lost_frames"] > self.max_ghost_frames:
                camera_history.pop(track_id, None)
                for pair_key in list(pair_collision_frames.keys()):
                    if track_id in pair_key:
                        pair_collision_frames.pop(pair_key, None)
                continue

            ghost_coords = data.get("coords")
            if not ghost_coords or len(ghost_coords) != 4:
                continue

            x1, y1, x2, y2 = [float(v) for v in ghost_coords]
            box_width = x2 - x1
            box_height = y2 - y1

            if box_width > (frame_width * self.ghost_box_fraction_limit) or box_height > (frame_height * self.ghost_box_fraction_limit):
                continue

            margin = self.ghost_margin_px
            if x1 < margin or y1 < margin or x2 > (frame_width - margin) or y2 > (frame_height - margin):
                continue

            is_id_switch = False
            for active_vehicle in vehicles:
                if self._get_iou([x1, y1, x2, y2], active_vehicle["coords"]) > self.ghost_id_switch_iou:
                    is_id_switch = True
                    break
            if is_id_switch:
                continue

            data["current_speed"] = 0.0
            vehicles.append(
                {
                    "id": track_id,
                    "coords": [x1, y1, x2, y2],
                    "kinematics": data,
                    "confidence": float(data.get("confidence", 0.0)),
                    "class_id": int(data.get("class_id", -1)),
                    "class_name": str(data.get("class_name", "unknown")),
                    "is_ghost": True,
                }
            )

        detected_pair = None
        detected_confidence = 0.0

        for i in range(len(vehicles)):
            for j in range(i + 1, len(vehicles)):
                car_a = vehicles[i]
                car_b = vehicles[j]

                pair_id = tuple(sorted([int(car_a["id"]), int(car_b["id"])]))
                overlap_iou = self._get_iou(car_a["coords"], car_b["coords"])

                kinematics_a = car_a["kinematics"]
                kinematics_b = car_b["kinematics"]

                avg_speed_a = float(kinematics_a.get("avg_speed", 0.0))
                avg_speed_b = float(kinematics_b.get("avg_speed", 0.0))
                current_speed_a = float(kinematics_a.get("current_speed", 0.0))
                current_speed_b = float(kinematics_b.get("current_speed", 0.0))

                car_a_is_ghost = current_speed_a == 0.0 and avg_speed_a > self.moving_speed_threshold
                car_b_is_ghost = current_speed_b == 0.0 and avg_speed_b > self.moving_speed_threshold

                car_a_parked = avg_speed_a < self.moving_speed_threshold
                car_b_parked = avg_speed_b < self.moving_speed_threshold

                if (car_a_is_ghost and car_b_parked) or (car_b_is_ghost and car_a_parked):
                    overlap_iou = 0.0

                car_a_crash = avg_speed_a > self.moving_speed_threshold and current_speed_a < (avg_speed_a * self.crash_drop_factor)
                car_b_crash = avg_speed_b > self.moving_speed_threshold and current_speed_b < (avg_speed_b * self.crash_drop_factor)

                car_a_safe = avg_speed_a > self.moving_speed_threshold and current_speed_a > (avg_speed_a * self.safe_pass_factor)
                car_b_safe = avg_speed_b > self.moving_speed_threshold and current_speed_b > (avg_speed_b * self.safe_pass_factor)

                is_safe_pass = car_a_safe or car_b_safe
                if (car_a_is_ghost and not car_b_parked) or (car_b_is_ghost and not car_a_parked):
                    is_safe_pass = False

                required_iou = self.ghost_collision_iou if (car_a_is_ghost or car_b_is_ghost) else self.collision_iou

                if overlap_iou > required_iou and (car_a_crash or car_b_crash) and not is_safe_pass:
                    pair_collision_frames[pair_id] = pair_collision_frames.get(pair_id, 0) + 1
                else:
                    pair_collision_frames[pair_id] = 0

                if pair_collision_frames.get(pair_id, 0) > self.confirmation_frames:
                    pair_confidence = max(
                        float(car_a.get("confidence", 0.0)),
                        float(car_b.get("confidence", 0.0)),
                        float(overlap_iou),
                    )
                    if detected_pair is None or pair_confidence > detected_confidence:
                        detected_pair = pair_id
                        detected_confidence = pair_confidence

        top_candidates = sorted(all_candidates, key=lambda item: item["confidence"], reverse=True)[:5]

        if detected_pair is not None:
            self._last_error = ""
            return {
                "detected": True,
                "confidence": detected_confidence,
                "class_id": -1,
                "class_name": "collision-heuristic",
                "pair_id": [int(detected_pair[0]), int(detected_pair[1])],
                "candidate_count": len(detections),
                "top_candidates": top_candidates,
            }

        return {
            "detected": False,
            "error": "No collision detected by heuristic on current frame.",
            "candidate_count": len(detections),
            "top_candidates": top_candidates,
        }

    def _ensure_model_loaded_sync(self):
        if self._model is not None:
            return self._model

        if YOLO is None:
            import_error_detail = f" Import error: {ULTRALYTICS_IMPORT_ERROR}" if ULTRALYTICS_IMPORT_ERROR else ""
            self._last_error = (
                "ultralytics is not available in the current Python environment. "
                "Install backend requirements and restart the API."
                f"{import_error_detail}"
            )
            return None

        if not self.model_path.exists():
            self._last_error = f"Model file not found: {self.model_path}"
            return None

        with self._model_lock:
            if self._model is not None:
                return self._model
            try:
                self._model = YOLO(str(self.model_path))
                self._last_error = ""
                logger.info("Loaded YOLO model from %s", self.model_path)
            except Exception as exc:
                self._last_error = f"Failed to load model: {exc}"
                logger.exception("Unable to load YOLO model")
                return None
        return self._model

detection_service = LiveCollisionDetectionService()

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

    if PREBUFFER_ACTIVE_CAMERAS_ON_STARTUP:
        cameras = await app.db.cameras.find({"status": "active"}).to_list(None)
        for camera in cameras:
            clip_recorder.ensure_worker(camera.get("id", ""), camera.get("rtsp_url", ""))

    await detection_service.start(app.db)

@app.on_event("shutdown")
async def shutdown():
    await detection_service.stop()
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

async def _get_user_from_access_token(token: str, db):
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

def _parse_bearer_token(auth_header: Optional[str]) -> Optional[str]:
    if not auth_header:
        return None

    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
        return token or None

    return None

async def _get_current_user_from_header_or_query(request: Request, db, token_query: Optional[str] = None):
    token = _parse_bearer_token(request.headers.get("Authorization"))
    if not token and token_query:
        token = token_query.strip()

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    return await _get_user_from_access_token(token, db)

async def get_current_user(token: str = Depends(oauth2), db=Depends(get_db)):
    return await _get_user_from_access_token(token, db)

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
    parsed = _parse_iso_datetime(ts)
    if parsed is None:
        parsed = _utc_now()
    return parsed.astimezone().strftime("%Y-%m-%d %H:%M")

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
        "sent_at": _utc_now_iso(),
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
        "video_codec": None,
        "video_error": None,
    }

async def _create_collision_entry(
    db,
    camera_id: str,
    confidence_score: float,
    severity: Optional[str] = "medium",
    description: Optional[str] = None,
    timestamp: Optional[datetime] = None,
    camera_doc: Optional[dict] = None,
):
    camera = camera_doc or await db.cameras.find_one({"id": camera_id})
    cam_name = camera["name"] if camera else "Unknown"
    cam_loc = camera["location"] if camera else "Unknown"

    ts_value = timestamp or _utc_now()
    if ts_value.tzinfo is None:
        ts_value = ts_value.replace(tzinfo=timezone.utc)

    doc = {
        "id": str(uuid.uuid4()),
        "camera_id": camera_id,
        "camera_name": cam_name,
        "camera_location": cam_loc,
        "confidence_score": float(confidence_score),
        "severity": _normalize_collision_severity(severity),
        "description": description,
        "status": "pending",
        "timestamp": ts_value.isoformat(),
        "acknowledged_by": None,
        "acknowledged_at": None,
        **_initial_collision_video_fields(),
    }

    await db.collisions.insert_one(doc)
    await _queue_collision_video_capture(db, doc, camera)
    await _send_alerts(db, doc)
    return doc

def _resolve_ffmpeg_executable() -> Optional[str]:
    if _imageio_ffmpeg is None:
        return None

    try:
        ffmpeg_path = _imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None

    if ffmpeg_path and os.path.exists(ffmpeg_path):
        return ffmpeg_path
    return None

def _transcode_mp4_bytes_to_h264(video_bytes: bytes) -> Optional[bytes]:
    if not video_bytes:
        return None

    ffmpeg_path = _resolve_ffmpeg_executable()
    if not ffmpeg_path:
        return None

    input_path = None
    output_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as input_file:
            input_file.write(video_bytes)
            input_path = input_file.name

        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as output_file:
            output_path = output_file.name

        command = [
            ffmpeg_path,
            "-y",
            "-i",
            input_path,
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            output_path,
        ]

        transcode = subprocess.run(command, capture_output=True, text=True, timeout=180)
        if transcode.returncode != 0 or not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
            return None

        with open(output_path, "rb") as output_file:
            return output_file.read()
    except Exception:
        return None
    finally:
        for path in (input_path, output_path):
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except Exception:
                    pass

def _probe_mp4_codec_hint(video_bytes: bytes) -> str:
    if not video_bytes:
        return ""

    header = video_bytes[:4096]
    if b"avc1" in header or b"h264" in header:
        return "h264"
    if b"mp4v" in header or b"FMP4" in header:
        return "mp4v"
    return ""

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

    event_time = _utc_now()
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
    transcode_path = None
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

        upload_path = tmp_path
        video_codec = "mp4v"

        ffmpeg_path = _resolve_ffmpeg_executable()
        if ffmpeg_path:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as transcoded_file:
                transcode_path = transcoded_file.name

            command = [
                ffmpeg_path,
                "-y",
                "-i",
                tmp_path,
                "-an",
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                transcode_path,
            ]

            transcode = subprocess.run(command, capture_output=True, text=True, timeout=180)
            if transcode.returncode == 0 and os.path.exists(transcode_path) and os.path.getsize(transcode_path) > 0:
                upload_path = transcode_path
                video_codec = "h264"
            else:
                logger.warning("H264 transcode failed; keeping mp4v collision clip")

        with open(upload_path, "rb") as file_obj:
            clip_bytes = file_obj.read()

        if not clip_bytes:
            raise RuntimeError("Generated clip file is empty.")

        filename = f"collision_{collision_id}.mp4"
        metadata = {
            "collision_id": collision_id,
            "camera_id": camera_id,
            "recorded_at": _utc_now_iso(),
            "duration_seconds": COLLISION_CLIP_SECONDS,
            "pre_event_seconds": COLLISION_PRE_EVENT_SECONDS,
            "post_event_seconds": COLLISION_POST_EVENT_SECONDS,
            "codec": video_codec,
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
                    "video_recorded_at": _utc_now_iso(),
                    "video_codec": video_codec,
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
        for path in (tmp_path, transcode_path):
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except Exception:
                    pass

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
            "email": "captain@safesight.local", "full_name": "Barangay Captain",
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
def _camera_failed_detail_from_worker(worker: CameraPreBufferWorker) -> str:
    snapshot = worker.get_health_snapshot()
    reason = snapshot.get("last_failure_reason") or "Camera stream became unavailable"
    return (
        f"{reason}. Failed to reconnect for more than {CAMERA_RECONNECT_FAIL_AFTER_SECONDS}s. "
        "Manual reconnect is required."
    )

def _camera_unavailable_detail(camera: dict) -> str:
    status_value = str(camera.get("status") or "inactive").strip().lower()
    if status_value == "failed":
        return camera.get("last_stream_error") or (
            "Camera failed to reconnect. Use manual reconnect in Camera Management."
        )
    return f"Camera is {status_value}."

async def _mark_camera_failed(db, camera_id: str, detail: str):
    now_iso = datetime.utcnow().isoformat()
    updated = await db.cameras.find_one_and_update(
        {"id": camera_id, "status": "active"},
        {
            "$set": {
                "status": "failed",
                "last_stream_error": detail,
                "updated_at": now_iso,
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    if updated:
        clip_recorder.remove_worker(camera_id)
    return updated

async def _refresh_camera_runtime_status(db, camera: Optional[dict]):
    if not camera:
        return camera

    camera_status = str(camera.get("status") or "").strip().lower()
    camera_id = camera.get("id", "")
    if camera_status == "error":
        updated = await db.cameras.find_one_and_update(
            {"id": camera_id, "status": "error"},
            {
                "$set": {
                    "status": "failed",
                    "updated_at": datetime.utcnow().isoformat(),
                }
            },
            return_document=ReturnDocument.AFTER,
        )
        return updated if updated else camera

    if camera_status != "active":
        return camera

    worker = clip_recorder.get_worker(camera_id)
    if not worker:
        rtsp_url = str(camera.get("rtsp_url") or "").strip()
        if not rtsp_url:
            updated = await _mark_camera_failed(db, camera_id, "Camera stream URL is missing.")
            return updated if updated else camera
        worker = clip_recorder.ensure_worker(camera_id, rtsp_url)
        if not worker:
            return camera

    if worker.is_reconnect_stalled(CAMERA_RECONNECT_FAIL_AFTER_SECONDS):
        detail = _camera_failed_detail_from_worker(worker)
        updated = await _mark_camera_failed(db, camera_id, detail)
        if updated:
            return updated
    return camera

class CameraCreate(BaseModel):
    name: str
    location: str
    rtsp_url: str
    description: Optional[str] = None
    map_latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    map_longitude: Optional[float] = Field(default=None, ge=-180, le=180)

class CameraUpdate(BaseModel):
    name:        Optional[str] = None
    location:    Optional[str] = None
    rtsp_url:    Optional[str] = None
    description: Optional[str] = None
    status:      Optional[str] = None
    map_latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    map_longitude: Optional[float] = Field(default=None, ge=-180, le=180)

@app.get("/api/cameras/")
async def list_cameras(db=Depends(get_db), _=Depends(get_current_user)):
    docs = await db.cameras.find().sort("created_at", -1).to_list(None)
    refreshed = []
    for camera in docs:
        refreshed_camera = await _refresh_camera_runtime_status(db, camera)
        refreshed.append(clean(refreshed_camera if refreshed_camera else camera))
    return refreshed

@app.get("/api/cameras/{camera_id}/snapshot")
async def camera_snapshot(camera_id: str, db=Depends(get_db), _=Depends(get_current_user)):
    if cv2 is None:
        raise HTTPException(503, "OpenCV is not installed on backend.")

    camera = await db.cameras.find_one({"id": camera_id})
    if not camera:
        raise HTTPException(404, "Camera not found")

    camera = await _refresh_camera_runtime_status(db, camera)

    if camera.get("status") != "active":
        raise HTTPException(409, _camera_unavailable_detail(camera))

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
        if worker.is_reconnect_stalled(CAMERA_RECONNECT_FAIL_AFTER_SECONDS):
            detail = _camera_failed_detail_from_worker(worker)
            await _mark_camera_failed(db, camera_id, detail)
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

async def _camera_mjpeg_stream_generator(
    request: Request,
    worker: CameraPreBufferWorker,
    camera_id: str,
    db,
):
    last_payload_ts = 0
    stream_started_ns = time.time_ns()
    health_probe_clock = 0.0
    worker.add_live_subscriber()

    try:
        while True:
            if await request.is_disconnected():
                break

            payload, payload_ts = worker.get_latest_jpeg_packet()

            # Avoid sending stale payloads from a previous client session.
            if payload is None or payload_ts is None or payload_ts < stream_started_ns:
                now_clock = time.perf_counter()
                if now_clock - health_probe_clock >= 1.0:
                    health_probe_clock = now_clock
                    if worker.is_reconnect_stalled(CAMERA_RECONNECT_FAIL_AFTER_SECONDS):
                        detail = _camera_failed_detail_from_worker(worker)
                        await _mark_camera_failed(db, camera_id, detail)
                        break
                await asyncio.sleep(0.005)
                continue

            if payload_ts <= last_payload_ts:
                await asyncio.sleep(0.005)
                continue

            last_payload_ts = payload_ts

            header = (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n"
                + f"Content-Length: {len(payload)}\r\n\r\n".encode("ascii")
            )

            yield header + payload + b"\r\n"
            await asyncio.sleep(0)
    finally:
        worker.remove_live_subscriber()

@app.get("/api/cameras/{camera_id}/stream")
async def camera_stream(
    camera_id: str,
    request: Request,
    token: Optional[str] = Query(default=None),
    db=Depends(get_db),
):
    if cv2 is None:
        raise HTTPException(503, "OpenCV is not installed on backend.")

    await _get_current_user_from_header_or_query(request, db, token)

    camera = await db.cameras.find_one({"id": camera_id})
    if not camera:
        raise HTTPException(404, "Camera not found")

    camera = await _refresh_camera_runtime_status(db, camera)

    if camera.get("status") != "active":
        raise HTTPException(409, _camera_unavailable_detail(camera))

    rtsp_url = camera.get("rtsp_url", "")
    if not rtsp_url:
        raise HTTPException(400, "Camera stream URL is missing")

    worker = clip_recorder.ensure_worker(camera_id, rtsp_url)
    if not worker:
        raise HTTPException(503, "Camera stream is unavailable")

    if worker.is_reconnect_stalled(CAMERA_RECONNECT_FAIL_AFTER_SECONDS):
        detail = _camera_failed_detail_from_worker(worker)
        await _mark_camera_failed(db, camera_id, detail)
        raise HTTPException(503, detail)

    return StreamingResponse(
        _camera_mjpeg_stream_generator(request, worker, camera_id, db),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )

@app.post("/api/cameras/", status_code=201)
async def create_camera(body: CameraCreate, db=Depends(get_db), _=Depends(captain_only)):
    payload = body.model_dump()
    payload["name"] = payload["name"].strip()
    payload["location"] = payload["location"].strip()
    payload["rtsp_url"] = payload["rtsp_url"].strip()
    if payload.get("description") is not None:
        payload["description"] = payload["description"].strip()

    await _ensure_rtsp_reachable(payload["rtsp_url"])

    now_iso = datetime.utcnow().isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "status": "active",
        "created_at": now_iso,
        "updated_at": now_iso,
        "last_stream_error": None,
        "last_reconnect_at": now_iso,
        **payload,
    }
    await db.cameras.insert_one(doc)
    if doc.get("status") == "active":
        clip_recorder.ensure_worker(doc.get("id", ""), doc.get("rtsp_url", ""))
    return clean(doc)

@app.put("/api/cameras/{camera_id}")
async def update_camera(camera_id: str, body: CameraUpdate, db=Depends(get_db), _=Depends(captain_only)):
    existing = await db.cameras.find_one({"id": camera_id})
    if not existing:
        raise HTTPException(404, "Camera not found")

    raw_update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    update = {}
    for key, value in raw_update.items():
        if key == "status":
            update[key] = _normalize_camera_status(value)
        elif isinstance(value, str):
            update[key] = value.strip()
        else:
            update[key] = value

    if not update:
        return clean(existing)

    next_status = update.get("status", str(existing.get("status") or "active").strip().lower())
    next_rtsp_url = str(update.get("rtsp_url", existing.get("rtsp_url") or "")).strip()

    if "rtsp_url" in update and not next_rtsp_url:
        raise HTTPException(400, "Camera stream URL is missing")

    if "rtsp_url" in update:
        await _ensure_rtsp_reachable(next_rtsp_url)

    if next_status == "active" and existing.get("status") != "active" and "rtsp_url" not in update:
        if not next_rtsp_url:
            raise HTTPException(400, "Camera stream URL is missing")
        await _ensure_rtsp_reachable(next_rtsp_url)

    if next_status == "active":
        update["last_stream_error"] = None
        update["last_reconnect_at"] = datetime.utcnow().isoformat()

    update["updated_at"] = datetime.utcnow().isoformat()
    result = await db.cameras.find_one_and_update(
        {"id": camera_id}, {"$set": update}, return_document=ReturnDocument.AFTER)
    if not result:
        raise HTTPException(404, "Camera not found")

    if result.get("status") == "active":
        worker = clip_recorder.ensure_worker(result.get("id", ""), result.get("rtsp_url", ""))
        if not worker:
            detail = "Failed to initialize camera stream worker."
            failed = await _mark_camera_failed(db, camera_id, detail)
            if failed:
                return clean(failed)
    else:
        clip_recorder.remove_worker(result.get("id", ""))

    result = await _refresh_camera_runtime_status(db, result)
    return clean(result)

@app.post("/api/cameras/{camera_id}/reconnect")
async def reconnect_camera(camera_id: str, db=Depends(get_db), _=Depends(captain_only)):
    camera = await db.cameras.find_one({"id": camera_id})
    if not camera:
        raise HTTPException(404, "Camera not found")

    rtsp_url = str(camera.get("rtsp_url") or "").strip()
    if not rtsp_url:
        raise HTTPException(400, "Camera stream URL is missing")

    try:
        await _ensure_rtsp_reachable(rtsp_url)
    except HTTPException as exc:
        detail = str(exc.detail)
        await db.cameras.update_one(
            {"id": camera_id},
            {
                "$set": {
                    "status": "failed",
                    "last_stream_error": detail,
                    "updated_at": datetime.utcnow().isoformat(),
                }
            },
        )
        clip_recorder.remove_worker(camera_id)
        raise

    clip_recorder.remove_worker(camera_id)
    worker = clip_recorder.ensure_worker(camera_id, rtsp_url)
    if not worker:
        detail = "Failed to initialize camera stream worker."
        await db.cameras.update_one(
            {"id": camera_id},
            {
                "$set": {
                    "status": "failed",
                    "last_stream_error": detail,
                    "updated_at": datetime.utcnow().isoformat(),
                }
            },
        )
        raise HTTPException(503, detail)

    now_iso = datetime.utcnow().isoformat()
    result = await db.cameras.find_one_and_update(
        {"id": camera_id},
        {
            "$set": {
                "status": "active",
                "last_stream_error": None,
                "last_reconnect_at": now_iso,
                "updated_at": now_iso,
            }
        },
        return_document=ReturnDocument.AFTER,
    )
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
    doc = await _create_collision_entry(
        db=db,
        camera_id=body.camera_id,
        confidence_score=body.confidence_score,
        severity=body.severity,
        description=body.description,
    )
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

    # Backward compatibility for older clips that were encoded as mp4v/FMP4.
    stored_codec = str(collision.get("video_codec") or "").strip().lower()
    probed_codec = _probe_mp4_codec_hint(video_bytes)
    timestamp_raw = str(collision.get("timestamp") or "").strip()
    has_timezone = bool(re.search(r"(Z|[+\-]\d{2}:\d{2})$", timestamp_raw))
    needs_transcode = (
        stored_codec != "h264"
        or not has_timezone
        or (stored_codec == "h264" and probed_codec and probed_codec != "h264")
    )

    if needs_transcode:
        loop = asyncio.get_running_loop()
        transcoded_bytes = await loop.run_in_executor(None, _transcode_mp4_bytes_to_h264, video_bytes)
        if transcoded_bytes:
            video_bytes = transcoded_bytes

    filename = collision.get("video_filename") or f"collision_{collision_id}.mp4"

    return Response(
        content=video_bytes,
        media_type=collision.get("video_mime_type", "video/mp4"),
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Content-Length": str(len(video_bytes)),
            "Accept-Ranges": "bytes",
        },
    )

@app.post("/api/collisions/mock-detection")
async def mock_collision(camera_id: str, db=Depends(get_db), _=Depends(get_current_user)):
    import random
    camera = await db.cameras.find_one({"id": camera_id})
    if not camera:
        raise HTTPException(404, "Camera not found")

    doc = await _create_collision_entry(
        db=db,
        camera_id=camera_id,
        confidence_score=round(random.uniform(0.70, 0.99), 2),
        severity="high",
        description="Mock collision - testing",
        camera_doc=camera,
    )
    return clean(doc)

@app.get("/api/detection/status")
async def detection_status(db=Depends(get_db), _=Depends(get_current_user)):
    if detection_service.enabled:
        await detection_service.start(db)
    return detection_service.status()

@app.post("/api/detection/enable")
async def enable_detection(db=Depends(get_db), _=Depends(captain_only)):
    detection_service.set_enabled(True)
    await detection_service.start(db)
    return detection_service.status()

@app.post("/api/detection/disable")
async def disable_detection(_=Depends(captain_only)):
    detection_service.set_enabled(False)
    return detection_service.status()

@app.post("/api/detection/test/{camera_id}")
async def test_detection_on_camera(
    camera_id: str,
    create_event: bool = Query(default=True),
    _=Depends(get_current_user),
):
    return await detection_service.test_camera(camera_id, create_event=create_event)

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
    return {"status": "ok", "service": "SafeSight API"}
