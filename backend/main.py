from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument
from pydantic import BaseModel, Field
from passlib.context import CryptContext
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from pathlib import Path
import os, uuid, jwt, logging
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

# ── Config ────────────────────────────────────────────────────────────────────
MONGO_URL   = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME     = os.getenv("DB_NAME", "safecctv")
SECRET_KEY  = os.getenv("SECRET_KEY", "changeme-in-production")
ALGORITHM   = "HS256"
TOKEN_EXP   = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
    logger.info(f"Connected to MongoDB: {DB_NAME}")
    await ensure_default_captain(app.db)

@app.on_event("shutdown")
async def shutdown():
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

@app.post("/api/cameras/", status_code=201)
async def create_camera(body: CameraCreate, db=Depends(get_db), _=Depends(captain_only)):
    doc = {"id": str(uuid.uuid4()), "status": "active",
        "created_at": datetime.utcnow().isoformat(), **body.model_dump()}
    await db.cameras.insert_one(doc)
    return clean(doc)

@app.put("/api/cameras/{camera_id}")
async def update_camera(camera_id: str, body: CameraUpdate, db=Depends(get_db), _=Depends(captain_only)):
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    update["updated_at"] = datetime.utcnow().isoformat()
    result = await db.cameras.find_one_and_update(
        {"id": camera_id}, {"$set": update}, return_document=ReturnDocument.AFTER)
    if not result:
        raise HTTPException(404, "Camera not found")
    return clean(result)

@app.delete("/api/cameras/{camera_id}")
async def delete_camera(camera_id: str, db=Depends(get_db), _=Depends(captain_only)):
    result = await db.cameras.delete_one({"id": camera_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Camera not found")
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
    }
    await db.collisions.insert_one(doc)
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
    }
    await db.collisions.insert_one(doc)
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
@app.get("/api/alerts/")
async def list_alerts(db=Depends(get_db), user=Depends(get_current_user)):
    query = {} if user["role"] == "captain" else {"user_id": user["id"]}
    docs  = await db.alerts.find(query).sort("sent_at", -1).limit(200).to_list(None)
    return [clean(d) for d in docs]

async def _send_alerts(db, collision: dict):
    """Create alert records for every active user."""
    users = await db.users.find({"is_active": True}).to_list(None)
    ts    = collision.get("timestamp", "")
    msg   = (f"🚨 COLLISION ALERT: {collision['severity'].upper()} severity at "
             f"{collision['camera_name']} ({collision['camera_location']}) "
             f"on {ts[:16].replace('T',' ')}. "
             f"Confidence: {collision['confidence_score']:.0%}")
    for u in users:
        await db.alerts.insert_one({
            "id": str(uuid.uuid4()), "collision_id": collision["id"],
            "user_id": u["id"], "recipient_name": u["full_name"],
            "recipient_phone": u["phone_number"], "message": msg,
            "status": "sent", "sent_at": datetime.utcnow().isoformat()
        })

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
