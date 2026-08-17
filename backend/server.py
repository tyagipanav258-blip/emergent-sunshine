import os
import io
import re
import json
import uuid
import base64
import secrets
import asyncio
import logging
from pathlib import Path
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import List, Optional, Literal

import jwt
import httpx
import requests
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Query, Response, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.concurrency import run_in_threadpool
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from pwdlib import PasswordHash

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
from emergentintegrations.llm.openai.speech_to_text import OpenAISpeechToText
from emergentintegrations.llm.openai.text_to_speech import OpenAITextToSpeech

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
# 7 days. A stolen phone shouldn't hand over a health record for a month.
JWT_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", "10080"))
# Short-lived, purpose-scoped tokens for streamed media (prescription photos,
# voice notes). Never usable as a session credential.
MEDIA_TOKEN_MINUTES = 10
MEDIA_SCOPE = "media"

TTS_MODEL = os.environ.get("TTS_MODEL", "tts-1")
TTS_VOICE = os.environ.get("TTS_VOICE", "shimmer")

# Elders are in India unless they tell us otherwise. Every schedule, greeting and
# day boundary is computed in the elder's own zone, never the server's.
DEFAULT_TZ = "Asia/Kolkata"
EMERGENCY_NUMBER = "112"

# Failed-PIN throttling. A 4-digit PIN is right for this audience; unlimited
# attempts against a 10,000-key space is not.
PIN_MAX_ATTEMPTS = 5
PIN_LOCKOUT_MINUTES = 15

# Prototype mode: new accounts start with a realistic set of sample records so a
# demo is never a wall of empty states. Everything it writes is tagged demo=True
# and can be cleared; real uploads and real data are untouched by it.
DEMO_MODE = os.environ.get("DEMO_MODE", "1") == "1"

GEMINI = ("gemini", "gemini-3.1-pro-preview")
OPENAI_MINI = ("openai", "gpt-5.4-mini")
AGENT_MODEL = ("gemini", "gemini-2.5-flash")

pwd = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)

# ============================ OBJECT STORAGE ============================
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "sunshine"
_storage_key = None


def init_storage():
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    global _storage_key
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    if resp.status_code == 503:
        _storage_key = None
        key = init_storage()
        resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    global _storage_key
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

app = FastAPI()
api = APIRouter(prefix="/api")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sunshine")

# ============================ AUTH ============================
class ElderSignup(BaseModel):
    name: str
    phone: str
    pin: str = Field(min_length=4, max_length=4)
    location: Optional[str] = None
    timezone: Optional[str] = None

class ElderLogin(BaseModel):
    phone: str
    pin: str

class ChildSignup(BaseModel):
    name: str
    email: str
    password: str = Field(min_length=6)
    family_code: str
    relation: Optional[str] = None

class ChildLogin(BaseModel):
    email: str
    password: str


def norm_phone(p: str) -> str:
    return re.sub(r"[ ()\-]", "", p).strip()


def new_family_code() -> str:
    alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alpha) for _ in range(6))


def make_token(uid: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": uid, "role": role, "iat": now, "exp": now + timedelta(minutes=JWT_MINUTES)},
        JWT_SECRET, algorithm=JWT_ALG,
    )


def public_user(u: dict) -> dict:
    return {
        "id": u["id"], "role": u["role"], "name": u.get("name"),
        "phone": u.get("phone"), "email": u.get("email"),
        "family_code": u.get("family_code"), "elder_id": u.get("elder_id"),
        "location": u.get("location"), "timezone": u.get("timezone") or DEFAULT_TZ,
        "relation": u.get("relation"), "photo_url": u.get("photo_url"),
    }


async def current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> dict:
    if not creds:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
    except Exception:
        raise HTTPException(401, "Invalid token")
    # Narrow-scope tokens (e.g. prescription images) are not session credentials.
    if payload.get("scope"):
        raise HTTPException(403, "This token cannot be used to sign in")
    u = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0})
    if not u:
        raise HTTPException(401, "User not found")
    return u


def require_role(role: str):
    async def dep(u: dict = Depends(current_user)) -> dict:
        if u["role"] != role:
            raise HTTPException(403, "Wrong account type for this action")
        return u
    return dep


async def elder_id_for(u: dict) -> str:
    return u["id"] if u["role"] == "elder" else u.get("elder_id")


async def user_from_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        u = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0})
    except Exception:
        raise HTTPException(401, "Invalid token")
    if not u:
        raise HTTPException(401, "User not found")
    return u


def _parse_time(t: str) -> int:
    """'8:00 AM' -> minutes since midnight. Returns 24*60 if unparseable."""
    m = re.match(r"\s*(\d{1,2}):(\d{2})\s*([AaPp][Mm])?", t or "")
    if not m:
        return 24 * 60
    hh, mm = int(m.group(1)), int(m.group(2))
    ap = (m.group(3) or "").upper()
    if ap == "PM" and hh != 12:
        hh += 12
    if ap == "AM" and hh == 12:
        hh = 0
    return hh * 60 + mm


def plural(n: int, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


# ============================ ELDER-LOCAL TIME ============================
def elder_zone(elder: Optional[dict]) -> ZoneInfo:
    try:
        return ZoneInfo((elder or {}).get("timezone") or DEFAULT_TZ)
    except Exception:
        return ZoneInfo(DEFAULT_TZ)


def elder_now(elder: Optional[dict]) -> datetime:
    """Wall-clock time where the elder actually lives."""
    return datetime.now(timezone.utc).astimezone(elder_zone(elder))


def elder_day(elder: Optional[dict]) -> str:
    return elder_now(elder).strftime("%Y-%m-%d")


# ============================ DOSE LEDGER ============================
# Adherence lives in `intakes`, one row per medicine per local day. "Taken today"
# is derived from it, never stored — so it resets itself at the elder's midnight
# without a job, and confirming twice is a no-op instead of an undo.
async def _taken_ids(elder_id: str, day: str) -> set:
    rows = await db.intakes.find({"elder_id": elder_id, "day": day}, {"_id": 0, "medicine_id": 1}).to_list(500)
    return {r["medicine_id"] for r in rows}


async def _ever_taken_ids(elder_id: str) -> set:
    rows = await db.intakes.find({"elder_id": elder_id}, {"_id": 0, "medicine_id": 1}).to_list(2000)
    return {r["medicine_id"] for r in rows}


async def _set_intake(elder: dict, med: dict, taken: bool) -> dict:
    """Idempotently record or withdraw today's dose. Stock moves at most once a day."""
    eid = med["elder_id"]
    day = elder_day(elder)
    existing = await db.intakes.find_one({"elder_id": eid, "medicine_id": med["id"], "day": day})
    per_day = max(med.get("per_day", 1), 1)

    if taken and not existing:
        await db.intakes.insert_one({
            "id": str(uuid.uuid4()), "elder_id": eid, "medicine_id": med["id"], "day": day,
            "scheduled": med.get("time"), "taken_at": datetime.now(timezone.utc).isoformat(),
        })
        await db.medicines.update_one({"id": med["id"]}, {"$set": {"stock": max(med["stock"] - per_day, 0)}})
    elif not taken and existing:
        await db.intakes.delete_one({"elder_id": eid, "medicine_id": med["id"], "day": day})
        await db.medicines.update_one({"id": med["id"]}, {"$set": {"stock": med["stock"] + per_day}})

    return await db.medicines.find_one({"id": med["id"]}, {"_id": 0})


async def _compute_missed(elder: dict) -> List[dict]:
    """Doses whose time has passed today in the elder's own zone and weren't confirmed.

    Read-only. A medicine only becomes alertable once it has been confirmed at
    least once, so a newly added medicine never fires a false alarm at the family.
    """
    eid = elder["id"]
    now = elder_now(elder)
    now_min = now.hour * 60 + now.minute
    meds = await db.medicines.find({"elder_id": eid}, {"_id": 0}).to_list(100)
    taken = await _taken_ids(eid, elder_day(elder))
    established = await _ever_taken_ids(eid)
    missed = []
    for m in meds:
        if m["id"] in taken or m["id"] not in established:
            continue
        # 30-minute grace after the scheduled time
        if now_min > _parse_time(m["time"]) + 30:
            missed.append({"id": m["id"], "name": m["name"], "dose": m["dose"], "time": m["time"], "image": m["image"]})
    return missed


async def _record_missed_notifications(elder: dict) -> int:
    """Persist one family notification per missed medicine per local day.

    Called by the background sweep, never by a read handler.
    """
    day = elder_day(elder)
    written = 0
    for m in await _compute_missed(elder):
        existing = await db.notifications.find_one(
            {"elder_id": elder["id"], "kind": "missed_dose", "med_id": m["id"], "day": day}
        )
        if existing:
            continue
        contacts = await _family_contacts(elder["id"])
        body = f"{m['name']} ({m['time']}) was not marked as taken."
        now = datetime.now(timezone.utc).isoformat()
        rows = [{
            "id": str(uuid.uuid4()), "elder_id": elder["id"], "to_user_id": c["id"],
            "kind": "missed_dose", "med_id": m["id"], "day": day,
            "title": "A dose was missed", "message": body, "data": {"med_id": m["id"]},
            "at": now, "read": False,
        } for c in contacts]
        if rows:
            await db.notifications.insert_many(rows)
        else:
            # Nobody to tell yet, but keep the daily record so we don't re-check.
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()), "elder_id": elder["id"], "to_user_id": None,
                "kind": "missed_dose", "med_id": m["id"], "day": day,
                "title": "A dose was missed", "message": body,
                "at": now, "read": False,
            })
        written += 1
    return written


async def _missed_dose_sweep(interval_seconds: int = 900):
    """Background loop so alerts fire on time instead of when someone opens a screen."""
    while True:
        try:
            elders = await db.users.find({"role": "elder"}, {"_id": 0}).to_list(5000)
            for elder in elders:
                try:
                    await _record_missed_notifications(elder)
                except Exception:
                    logger.exception("missed-dose sweep failed for %s", elder.get("id"))
        except Exception:
            logger.exception("missed-dose sweep failed")
        await asyncio.sleep(interval_seconds)


# ============================ FAMILY GRAPH ============================
async def _family_contacts(elder_id: str) -> List[dict]:
    """The people actually registered to this elder. Never a placeholder."""
    kids = await db.users.find({"role": "child", "elder_id": elder_id}, {"_id": 0}).to_list(50)
    return [{
        "id": c["id"], "name": c["name"], "relation": c.get("relation") or "Family",
        "email": c.get("email"), "photo_url": c.get("photo_url"),
    } for c in kids]


async def _pin_gate(phone: str) -> None:
    """Block further PIN attempts once a phone number has failed too many times."""
    row = await db.pin_attempts.find_one({"phone": phone})
    if not row:
        return
    until = row.get("locked_until")
    if until and datetime.fromisoformat(until) > datetime.now(timezone.utc):
        mins = max(int((datetime.fromisoformat(until) - datetime.now(timezone.utc)).total_seconds() // 60) + 1, 1)
        raise HTTPException(429, f"Too many wrong PINs. Please try again in {plural(mins, 'minute')}.")


async def _pin_failed(phone: str) -> None:
    row = await db.pin_attempts.find_one({"phone": phone})
    fails = (row or {}).get("fails", 0) + 1
    update = {"phone": phone, "fails": fails, "last_at": datetime.now(timezone.utc).isoformat()}
    if fails >= PIN_MAX_ATTEMPTS:
        update["locked_until"] = (datetime.now(timezone.utc) + timedelta(minutes=PIN_LOCKOUT_MINUTES)).isoformat()
        update["fails"] = 0
    await db.pin_attempts.update_one({"phone": phone}, {"$set": update}, upsert=True)


async def _pin_ok(phone: str) -> None:
    await db.pin_attempts.delete_one({"phone": phone})


@api.post("/auth/elder/signup")
async def elder_signup(b: ElderSignup):
    phone = norm_phone(b.phone)
    if not re.fullmatch(r"\d{4}", b.pin):
        raise HTTPException(422, "PIN must be exactly 4 digits")
    if await db.users.find_one({"role": "elder", "phone": phone}):
        raise HTTPException(409, "This phone number is already registered")
    u = {
        "id": str(uuid.uuid4()), "role": "elder", "name": b.name.strip(),
        "phone": phone, "secret_hash": pwd.hash(b.pin),
        "family_code": new_family_code(),
        "location": (b.location or "").strip() or None,
        "timezone": (b.timezone or "").strip() or DEFAULT_TZ,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(u.copy())
    if DEMO_MODE:
        try:
            await _seed_demo(u)
        except Exception:
            logger.exception("demo seeding failed for %s", u["id"])
    return {"access_token": make_token(u["id"], "elder"), "user": public_user(u), "demo": DEMO_MODE}


@api.post("/auth/elder/login")
async def elder_login(b: ElderLogin):
    phone = norm_phone(b.phone)
    await _pin_gate(phone)
    u = await db.users.find_one({"role": "elder", "phone": phone})
    if not u or not pwd.verify(b.pin, u["secret_hash"]):
        await _pin_failed(phone)
        raise HTTPException(401, "Wrong phone number or PIN")
    await _pin_ok(phone)
    return {"access_token": make_token(u["id"], "elder"), "user": public_user(u)}


@api.post("/auth/child/signup")
async def child_signup(b: ChildSignup):
    elder = await db.users.find_one({"role": "elder", "family_code": b.family_code.upper().strip()})
    if not elder:
        raise HTTPException(400, "Invalid family code. Please check with your parent.")
    if await db.users.find_one({"role": "child", "email": b.email.lower().strip()}):
        raise HTTPException(409, "This email is already registered")
    u = {
        "id": str(uuid.uuid4()), "role": "child", "name": b.name.strip(),
        "email": b.email.lower().strip(), "secret_hash": pwd.hash(b.password),
        "elder_id": elder["id"], "relation": (b.relation or "").strip() or "Family",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(u.copy())
    # Let the elder see that someone joined, rather than discovering it silently.
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()), "elder_id": elder["id"], "to_user_id": elder["id"],
        "kind": "family_joined", "title": "Someone joined",
        "message": f"{u['name']} is now connected to your Sunshine account.",
        "data": {}, "at": datetime.now(timezone.utc).isoformat(), "read": False,
    })
    if DEMO_MODE:
        try:
            # Re-run so sample photos are attributed to the person who just
            # joined, and so they get a week of steps to compare against.
            await db.photos.delete_many({"elder_id": elder["id"], "demo": True})
            await db.steps.delete_many({"elder_id": elder["id"], "demo": True})
            await _seed_demo(await db.users.find_one({"id": elder["id"]}, {"_id": 0}))
        except Exception:
            logger.exception("demo seeding failed for child %s", u["id"])
    return {"access_token": make_token(u["id"], "child"), "user": public_user(u), "demo": DEMO_MODE}


@api.post("/auth/child/login")
async def child_login(b: ChildLogin):
    u = await db.users.find_one({"role": "child", "email": b.email.lower().strip()})
    if not u or not pwd.verify(b.password, u["secret_hash"]):
        raise HTTPException(401, "Wrong email or password")
    return {"access_token": make_token(u["id"], "child"), "user": public_user(u)}


@api.get("/auth/me")
async def me(u: dict = Depends(current_user)):
    extra = {}
    if u["role"] == "child":
        elder = await db.users.find_one({"id": u.get("elder_id")}, {"_id": 0})
        extra["elder_name"] = elder["name"] if elder else None
    return {**public_user(u), **extra}


# ============================ CONTENT DATA ============================
NEWS_BASE = [
    {"title": "Monsoon Update for Rajasthan", "summary": "Light showers expected across Jaipur and Jodhpur through the weekend. Cooler evenings ahead.", "source": "India Weather", "image": "https://images.unsplash.com/photo-1519692933481-e162a57d6721?w=900&q=80"},
    {"title": "New Community Health Initiative Launched", "summary": "Free monthly check-ups for senior citizens at neighbourhood clinics begin next Monday.", "source": "Community Times", "image": "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=900&q=80"},
    {"title": "Today's Weather in Your City", "summary": "Sunny with a gentle breeze. Highs of 29°C. A good day for a morning walk.", "source": "Sunshine Weather", "image": "https://images.unsplash.com/photo-1504608524841-42fe6f032b4b?w=900&q=80"},
    {"title": "India News — Top Stories of the Day", "summary": "Metro expansion approved in three more cities. Read the highlights in simple language.", "source": "India Today", "image": "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=900&q=80"},
    {"title": "Kerala Backwaters Reopen for Winter Tourism", "summary": "Fresh routes announced for gentle houseboat cruises through Alleppey and Kumarakom.", "source": "Travel India", "image": "https://images.unsplash.com/photo-1609828913552-f9138ed9e42d?w=900&q=80"},
    {"title": "Simple Walks Add Years to Life, Study Finds", "summary": "A short daily walk keeps the heart happy and the mind calm, doctors say.", "source": "World Health", "image": "https://images.unsplash.com/photo-1526779259212-939e64788e3c?w=900&q=80"},
    {"title": "Local Temple Announces Morning Bhajan Sessions", "summary": "Community bhajans every morning at 7 AM. All are warmly welcome to join.", "source": "Community Times", "image": "https://images.unsplash.com/photo-1617904472808-7e038208077a?w=900&q=80"},
    {"title": "Healthy Recipe: Vegetable Poha in 10 Minutes", "summary": "A light, nourishing breakfast that is gentle on digestion and full of flavour.", "source": "Home Kitchen", "image": "https://images.unsplash.com/photo-1542367592-8849eb950fd8?w=900&q=80"},
    {"title": "Pension Scheme Deadline Extended", "summary": "Senior citizens now have extra time to submit their annual documents. No rush needed.", "source": "India Today", "image": "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=900&q=80"},
    {"title": "Gentle Yoga Camp for Seniors This Weekend", "summary": "Free beginner-friendly yoga in the community park. Bring a mat and a smile.", "source": "Wellness Daily", "image": "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=900&q=80"},
]

CONTENT = [
    {"id": "c1", "creator": "Wellness with Meena", "creator_avatar": "https://images.unsplash.com/photo-1564356533237-46945af0eb1e?w=200&q=80", "title": "5-Minute Morning Stretch", "description": "Start your day with these gentle stretches. Good for joints and energy.", "category": "Exercise", "video_url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4", "thumbnail_url": "https://images.unsplash.com/photo-1508050919630-b135583b29ab?w=800&q=80", "likes": 1234},
    {"id": "c2", "creator": "Bhakti Sangeet", "creator_avatar": "https://images.unsplash.com/photo-1617904472808-7e038208077a?w=200&q=80", "title": "Morning Bhajan — Om Jai Jagdish", "description": "A peaceful bhajan to begin your day with devotion and calm.", "category": "Bhajans", "video_url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4", "thumbnail_url": "https://images.unsplash.com/photo-1604608672516-f1b9b1d37076?w=800&q=80", "likes": 4210},
    {"id": "c3", "creator": "Shanti Temple", "creator_avatar": "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=200&q=80", "title": "Evening Aarti at the Ganges", "description": "Feel the peace of the evening aarti. Close your eyes and breathe.", "category": "Spiritual", "video_url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4", "thumbnail_url": "https://images.unsplash.com/photo-1561361513-2d000a50f0dc?w=800&q=80", "likes": 3820},
    {"id": "c4", "creator": "Chef Radha", "creator_avatar": "https://images.unsplash.com/photo-1607346256330-dee7af15f7c5?w=200&q=80", "title": "Easy Vegetable Poha Recipe", "description": "A light, healthy breakfast ready in 10 minutes.", "category": "Recipes", "video_url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4", "thumbnail_url": "https://images.unsplash.com/photo-1542367592-8849eb950fd8?w=800&q=80", "likes": 2841},
    {"id": "c5", "creator": "Songs of Joy", "creator_avatar": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&q=80", "title": "Old Melodies on the Sitar", "description": "Soothing sitar melodies from a bygone era.", "category": "Songs", "video_url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4", "thumbnail_url": "https://images.unsplash.com/photo-1519683109079-d5f539e1542f?w=800&q=80", "likes": 1876},
    {"id": "c6", "creator": "Gentle Yoga", "creator_avatar": "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=200&q=80", "title": "Gentle Yoga for Beginners", "description": "Soft breathing and slow movements. No mat needed.", "category": "Yoga", "video_url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4", "thumbnail_url": "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80", "likes": 1290},
    {"id": "c7", "creator": "Travel Kerala", "creator_avatar": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&q=80", "title": "Beautiful Places in Kerala", "description": "Calm backwaters, green hills and warm food.", "category": "Travel", "video_url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4", "thumbnail_url": "https://images.unsplash.com/photo-1609828913552-f9138ed9e42d?w=800&q=80", "likes": 5620},
    {"id": "c8", "creator": "Devotional Path", "creator_avatar": "https://images.unsplash.com/photo-1533000971552-6a962ff0b9f9?w=200&q=80", "title": "Hanuman Chalisa — Full", "description": "Recite along for strength, courage and peace of mind.", "category": "Devotional", "video_url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4", "thumbnail_url": "https://images.unsplash.com/photo-1580137189272-c9379f8864fd?w=800&q=80", "likes": 6120},
]

MED_IMAGES = {
    "tablet": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=200&q=80",
    "capsule": "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=200&q=80",
    "syrup": "https://images.unsplash.com/photo-1635166304271-04931640a450?w=200&q=80",
    "drops": "https://images.unsplash.com/photo-1550572017-edd951aa8f7f?w=200&q=80",
}



# ============================ DEMO / PROTOTYPE DATA ============================
# Everything below writes records tagged demo=True so a presentation account is
# fully populated. It is additive only: it never overwrites real records, and
# clearing it leaves anything the user actually created in place.
DEMO_PHOTOS = [
    ("https://images.unsplash.com/photo-1503919545889-aef636e10ad4?w=900&q=80", "First day of school!"),
    ("https://images.unsplash.com/photo-1609220136736-443140cffec6?w=900&q=80", "Sunday lunch together"),
    ("https://images.unsplash.com/photo-1519457431-44ccd64a579b?w=900&q=80", "She drew this for you"),
    ("https://images.unsplash.com/photo-1444210971048-6130cf0c46cf?w=900&q=80", "The garden is blooming"),
]

# A household rather than a single contact: the daughter who signs up is joined
# by a son and a grandchild, so every screen that lists family has more than one
# name in it. These are real user rows with no credentials — they cannot sign in,
# and they disappear with the rest of the demo data.
DEMO_MEMBERS = [
    {"name": "Rahul Sharma", "relation": "Son",
     "photo_url": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80"},
    {"name": "Aarohi Sharma", "relation": "Granddaughter",
     "photo_url": "https://images.unsplash.com/photo-1595152772835-219674b2a8a6?w=400&q=80"},
]

# A face for anyone who joined for real but has not uploaded a picture yet, so
# the family row never mixes photographs with grey silhouettes.
DEMO_AVATARS = [
    "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&q=80",
    "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&q=80",
    "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=400&q=80",
    "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=400&q=80",
]


# The parent's own face, since the family app opens with it.
ELDER_AVATAR = "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=400&q=80"


def _demo_avatar(user_id: str) -> str:
    """Stable per person, so a face does not change between refreshes."""
    return DEMO_AVATARS[hash(user_id) % len(DEMO_AVATARS)]

DEMO_MEDICINES = [
    {"name": "Amlodipine", "dose": "5 mg", "time": "8:00 AM", "type": "tablet", "per_day": 1, "stock": 24},
    {"name": "Metformin", "dose": "500 mg", "time": "1:00 PM", "type": "tablet", "per_day": 2, "stock": 5},
    {"name": "Vitamin D3", "dose": "1 capsule", "time": "8:00 PM", "type": "capsule", "per_day": 1, "stock": 30},
]

DEMO_STEPS = [4200, 3100, 5400, 2800, 6100, 3600, 2450]


async def _seed_demo(elder: dict) -> dict:
    """Populate one elder account with believable sample records."""
    eid = elder["id"]
    now = datetime.now(timezone.utc)
    today = elder_now(elder).date()
    created = {"medicines": 0, "appointments": 0, "steps": 0, "photos": 0, "tasks": 0,
               "invoices": 0, "members": 0, "messages": 0}

    # A household, so "Your family" is never a single face. Anyone who really
    # signed up keeps their own row; these only fill the gaps around them.
    existing = await _family_contacts(eid)
    if len(existing) < len(DEMO_MEMBERS) + 1:
        have = {c["name"] for c in existing}
        for spec in DEMO_MEMBERS:
            if spec["name"] in have:
                continue
            await db.users.insert_one({
                "id": str(uuid.uuid4()), "role": "child", "elder_id": eid,
                "name": spec["name"], "relation": spec["relation"],
                "photo_url": spec["photo_url"],
                # No email and no password hash: these accounts cannot be signed into.
                "email": None, "created_at": now.isoformat(), "demo": True,
            })
            created["members"] += 1

    # Anyone who joined for real gets a face too — including someone who signed
    # up after the household was seeded, which is the usual order of events.
    for c in await _family_contacts(eid):
        if not c.get("photo_url"):
            await db.users.update_one(
                {"id": c["id"]},
                {"$set": {"photo_url": _demo_avatar(c["id"]), "demo_photo": True}},
            )
    # And the parent herself, since the family app now leads with her face.
    if not elder.get("photo_url"):
        await db.users.update_one({"id": eid}, {"$set": {"photo_url": ELDER_AVATAR, "demo_photo": True}})

    # Medicines, with a week of dose history so adherence looks lived-in and the
    # missed-dose gate (which needs a prior confirmed intake) behaves normally.
    if not await db.medicines.count_documents({"elder_id": eid}):
        for spec in DEMO_MEDICINES:
            mid = str(uuid.uuid4())
            await db.medicines.insert_one({
                "id": mid, "elder_id": eid, **spec,
                "image": MED_IMAGES.get(spec["type"], MED_IMAGES["tablet"]),
                "created_at": now.isoformat(), "demo": True,
            })
            created["medicines"] += 1
            for back in range(1, 7):
                if back == 3:
                    continue  # one missed day, so the family view isn't uniformly perfect
                d = (today - timedelta(days=back)).strftime("%Y-%m-%d")
                await db.intakes.insert_one({
                    "id": str(uuid.uuid4()), "elder_id": eid, "medicine_id": mid, "day": d,
                    "scheduled": spec["time"], "taken_at": (now - timedelta(days=back)).isoformat(),
                    "demo": True,
                })
        # Today: the first is already taken, the rest still due.
        first = await db.medicines.find_one({"elder_id": eid}, {"_id": 0})
        if first:
            await db.intakes.insert_one({
                "id": str(uuid.uuid4()), "elder_id": eid, "medicine_id": first["id"],
                "day": elder_day(elder), "scheduled": first["time"],
                "taken_at": now.isoformat(), "demo": True,
            })

    if not await db.appointments.count_documents({"elder_id": eid}):
        for a in [
            {"doctor": "Dr. Anita Rao", "specialty": "General Physician", "date": "Tomorrow",
             "time": "10:30 AM", "place": "Sunshine Clinic, Jayanagar"},
            {"doctor": "Dr. Vikram Menon", "specialty": "Cardiologist", "date": "Next Friday",
             "time": "4:00 PM", "place": "Apollo Hospital"},
        ]:
            await db.appointments.insert_one({
                "id": str(uuid.uuid4()), "elder_id": eid, **a, "status": "confirmed", "demo": True,
            })
            created["appointments"] += 1

    if not await db.steps.count_documents({"elder_id": eid}):
        # The elder, plus a livelier week for each family member so the
        # side-by-side comparison has something in it.
        walkers = [(eid, DEMO_STEPS)] + [
            (c["id"], [int(n * 1.6) + (i * 130) for i, n in enumerate(DEMO_STEPS)])
            for c in await _family_contacts(eid)
        ]
        for uid, counts in walkers:
            for i, n in enumerate(counts):
                d = (today - timedelta(days=len(counts) - 1 - i)).strftime("%Y-%m-%d")
                await db.steps.insert_one({
                    "user_id": uid, "elder_id": eid, "day": d, "steps": n, "source": "demo",
                    "updated_at": now.isoformat(), "demo": True,
                })
                created["steps"] += 1

    if not await db.photos.count_documents({"elder_id": eid}):
        contacts = await _family_contacts(eid)
        for i, (url, caption) in enumerate(DEMO_PHOTOS):
            sender = contacts[i % len(contacts)] if contacts else None
            await db.photos.insert_one({
                "id": str(uuid.uuid4()), "elder_id": eid,
                "from_user_id": sender["id"] if sender else eid,
                "from_name": sender["name"] if sender else elder.get("name"),
                "from_role": "child" if sender else "elder",
                "caption": caption, "external_url": url, "storage_path": None, "ext": "jpg",
                "created_at": (now - timedelta(days=i)).isoformat(),
                "deleted": False, "seen_by": [], "demo": True,
            })
            created["photos"] += 1

    if not await db.tasks.count_documents({"elder_id": eid}):
        # One finished and settled, one waiting on the family — so both halves of
        # the fulfilment flow are visible without anyone having to drive it.
        done = await _create_task(eid, "reorder", "Reorder Metformin",
                                  "Metformin is running low (2 days left). Please arrange a refill.",
                                  auto=True)
        await db.tasks.update_one({"id": done["id"]}, {"$set": {
            "assignee": "concierge", "status": "done", "fulfilment": "settled", "demo": True,
        }})
        inv_items = [{"label": "Metformin 500 mg (60 tablets)", "qty": 1, "amount": 340.0},
                     {"label": "Home delivery", "qty": 1, "amount": 40.0}]
        await db.invoices.insert_one({
            "id": str(uuid.uuid4()), "elder_id": eid, "task_id": done["id"],
            "title": done["title"], "items": inv_items, "total": 380.0, "currency": "INR",
            "vendor": "Apollo Pharmacy", "reference": "AP-20481",
            "status": "paid", "created_at": (now - timedelta(days=4)).isoformat(),
            "paid_at": (now - timedelta(days=4)).isoformat(), "demo": True,
        })
        created["invoices"] += 1

        pending = await _create_task(eid, "transport", "Arrange transport",
                                     "A taxi to the cardiology appointment on Friday afternoon.")
        await db.tasks.update_one({"id": pending["id"]}, {"$set": {
            "assignee": "concierge", "status": "awaiting_payment", "fulfilment": "ordered", "demo": True,
        }})
        taxi_items = [{"label": "Taxi to Apollo Hospital and back", "qty": 1, "amount": 420.0},
                      {"label": "Waiting charge", "qty": 1, "amount": 80.0}]
        taxi_inv = {
            "id": str(uuid.uuid4()), "elder_id": eid, "task_id": pending["id"],
            "title": pending["title"], "items": taxi_items, "total": 500.0, "currency": "INR",
            "vendor": "City Cabs", "reference": "CC-77120",
            "status": "unpaid", "created_at": now.isoformat(), "paid_at": None, "demo": True,
        }
        await db.invoices.insert_one(taxi_inv)
        await db.tasks.update_one({"id": pending["id"]}, {"$set": {"invoice_id": taxi_inv["id"], "order": taxi_items}})
        created["invoices"] += 1
        created["tasks"] = 2

        await notify_family(eid, "invoice", "A payment is needed",
                            f"Sunshine arranged \"{pending['title']}\" for {elder.get('name', 'your parent')}. "
                            f"The total is \u20b9500.", {"task_id": pending["id"], "invoice_id": taxi_inv["id"]})

    # A few exchanges already in the thread, so tapping a face opens a
    # conversation rather than an empty screen.
    if not await db.messages.count_documents({"elder_id": eid}):
        contacts = await _family_contacts(eid)
        openers = [
            ("child", "Have you eaten?", "ate"),
            ("elder", "I am doing well, do not worry", "im_good"),
            ("child", "I will call you tonight", "call_tonight"),
        ]
        for c in contacts:
            for i, (role, text, tpl) in enumerate(openers):
                mine = role == "elder"
                await db.messages.insert_one({
                    "id": str(uuid.uuid4()), "elder_id": eid,
                    "from_user_id": eid if mine else c["id"],
                    "from_name": elder.get("name") if mine else c["name"],
                    "from_role": "elder" if mine else "child",
                    "to_user_id": c["id"] if mine else eid,
                    "to_name": c["name"] if mine else elder.get("name"),
                    "text": text, "template_id": tpl,
                    "at": (now - timedelta(hours=(len(openers) - i) * 3)).isoformat(),
                    "read": True, "demo": True,
                })
                created["messages"] += 1

    await db.users.update_one({"id": eid}, {"$set": {"demo_seeded": True}})
    return created


@api.post("/demo/seed")
async def demo_seed(u: dict = Depends(current_user)):
    """Fill this account with sample records for a walkthrough."""
    if not DEMO_MODE:
        raise HTTPException(403, "Demo mode is switched off")
    eid = await elder_id_for(u)
    elder = await db.users.find_one({"id": eid}, {"_id": 0})
    if not elder:
        raise HTTPException(404, "Account not found")
    return {"ok": True, "created": await _seed_demo(elder), "demo_mode": True}


@api.delete("/demo/seed")
async def demo_clear(u: dict = Depends(current_user)):
    """Remove only the sample records, leaving anything real behind."""
    eid = await elder_id_for(u)
    removed = {}
    for name in ("medicines", "intakes", "appointments", "steps", "photos", "tasks",
                 "invoices", "voice_notes", "messages"):
        r = await db[name].delete_many({"elder_id": eid, "demo": True})
        removed[name] = r.deleted_count
    # Sample relatives go too — but never anyone who actually signed up.
    r = await db.users.delete_many({"elder_id": eid, "demo": True, "role": "child"})
    removed["members"] = r.deleted_count
    # A real account only borrowed its picture; hand it back.
    await db.users.update_many({"elder_id": eid, "demo_photo": True},
                               {"$unset": {"photo_url": "", "demo_photo": ""}})
    await db.users.update_one({"id": eid}, {"$set": {"demo_seeded": False}})
    return {"ok": True, "removed": removed}


@api.get("/demo/status")
async def demo_status(u: dict = Depends(current_user)):
    eid = await elder_id_for(u)
    elder = await db.users.find_one({"id": eid}, {"_id": 0})
    return {
        "demo_mode": DEMO_MODE,
        "seeded": bool((elder or {}).get("demo_seeded")),
        "sample_records": await db.medicines.count_documents({"elder_id": eid, "demo": True}),
    }


# ============================ ACTIVITY LOG ============================
class ActivityIn(BaseModel):
    feature: str

@api.post("/activity")
async def log_activity(b: ActivityIn, u: dict = Depends(require_role("elder"))):
    await db.activity.insert_one({
        "id": str(uuid.uuid4()), "elder_id": u["id"], "feature": b.feature,
        "at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True}


# ============================ NEWS (infinite) ============================
@api.get("/news")
async def get_news(page: int = 0, size: int = 6):
    """A finite daily digest. The feed ends instead of looping the same ten stories."""
    start = max(page, 0) * size
    window = NEWS_BASE[start:start + size]
    items = [
        {
            "id": f"n{start + i}",
            "title": base["title"],
            "summary": base["summary"],
            "source": base["source"],
            "image": base["image"],
        }
        for i, base in enumerate(window)
    ]
    has_more = start + size < len(NEWS_BASE)
    return {"items": items, "next_page": page + 1 if has_more else None, "has_more": has_more}


@api.get("/family")
async def family(u: dict = Depends(current_user)):
    """The people really connected to this elder. Empty until someone joins."""
    eid = await elder_id_for(u)
    elder = await db.users.find_one({"id": eid}, {"_id": 0})
    return {
        "members": await _family_contacts(eid),
        "family_code": (elder or {}).get("family_code") if u["role"] == "elder" else None,
    }


# ============================ CONTENT (reels) ============================
CONTENT_CATEGORIES = ["All", "Spiritual", "Bhajans", "Songs", "Devotional", "Exercise", "Yoga", "Recipes", "Travel"]


def _content_by_id(cid: str) -> Optional[dict]:
    return next((c for c in CONTENT if c["id"] == cid), None)


async def _content_view(item: dict, eid: str, u: dict) -> dict:
    """A catalogue entry plus this family's own likes, reactions and talk about
    it — the catalogue itself is shared demo data, but the response to it is not."""
    cid = item["id"]
    real_likes = await db.content_likes.count_documents({"content_id": cid, "elder_id": eid})
    liked = await db.content_likes.find_one({"content_id": cid, "elder_id": eid, "user_id": u["id"]}) is not None
    reactions = await db.content_reactions.find({"content_id": cid, "elder_id": eid}, {"_id": 0}).to_list(50)
    counts: dict = {}
    for r in reactions:
        counts[r["emoji"]] = counts.get(r["emoji"], 0) + 1
    mine = next((r["emoji"] for r in reactions if r["user_id"] == u["id"]), None)
    comment_count = await db.content_comments.count_documents({"content_id": cid, "elder_id": eid})
    return {
        **item, "likes": item["likes"] + real_likes, "liked": liked,
        "reactions": counts, "my_reaction": mine, "comment_count": comment_count,
    }


@api.get("/content")
async def get_content(category: Optional[str] = None, u: dict = Depends(current_user)):
    eid = await elder_id_for(u)
    items = CONTENT if not category or category.lower() == "all" else [c for c in CONTENT if c["category"].lower() == category.lower()]
    return [await _content_view(c, eid, u) for c in items]


@api.get("/content/categories")
async def content_categories():
    return CONTENT_CATEGORIES


@api.post("/content/{cid}/like")
async def toggle_content_like(cid: str, u: dict = Depends(current_user)):
    """Tapping again takes it back — the same undo a photo's heart gets."""
    item = _content_by_id(cid)
    if not item:
        raise HTTPException(404, "Video not found")
    eid = await elder_id_for(u)
    existing = await db.content_likes.find_one({"content_id": cid, "elder_id": eid, "user_id": u["id"]})
    if existing:
        await db.content_likes.delete_one({"_id": existing["_id"]})
    else:
        await db.content_likes.insert_one({
            "content_id": cid, "elder_id": eid, "user_id": u["id"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    return await _content_view(item, eid, u)


class ContentReactIn(BaseModel):
    emoji: str


@api.post("/content/{cid}/react")
async def react_to_content(cid: str, b: ContentReactIn, u: dict = Depends(current_user)):
    """One reaction per person, swap-or-remove on a repeat tap — the same rule
    photo reactions use, and the same five faces (see REACTIONS below)."""
    if b.emoji not in REACTIONS:
        raise HTTPException(422, "Not a reaction we know")
    item = _content_by_id(cid)
    if not item:
        raise HTTPException(404, "Video not found")
    eid = await elder_id_for(u)
    existing = await db.content_reactions.find_one({"content_id": cid, "elder_id": eid, "user_id": u["id"]})
    if existing and existing["emoji"] == b.emoji:
        await db.content_reactions.delete_one({"_id": existing["_id"]})
        return await _content_view(item, eid, u)
    if existing:
        await db.content_reactions.delete_one({"_id": existing["_id"]})
    await db.content_reactions.insert_one({
        "content_id": cid, "elder_id": eid, "user_id": u["id"], "name": u.get("name") or "",
        "emoji": b.emoji, "created_at": datetime.now(timezone.utc).isoformat(),
    })

    # Tell the other side at most once per person, ever — mirrors the photo
    # reaction throttle so switching from a heart to a smile isn't news twice.
    meta = await db.content_meta.find_one({"elder_id": eid, "content_id": cid}) or {}
    told = meta.get("reaction_notified") or []
    if u["id"] not in told:
        await db.content_meta.update_one(
            {"elder_id": eid, "content_id": cid}, {"$addToSet": {"reaction_notified": u["id"]}}, upsert=True,
        )
        who = (u.get("name") or "Someone").split(" ")[0]
        title = item.get("title", "a video")
        if u["role"] == "elder":
            await notify_family(eid, "reaction", f"{who} reacted to \"{title}\"",
                                 f"{who} reacted to a video you might enjoy too.", {"content_id": cid})
        else:
            await notify_elder(eid, "reaction", f"{who} reacted to \"{title}\"",
                                f"{who} reacted to \"{title}\".", {"content_id": cid})
    return await _content_view(item, eid, u)


@api.get("/content/{cid}/comments")
async def list_content_comments(cid: str, u: dict = Depends(current_user)):
    eid = await elder_id_for(u)
    return await db.content_comments.find({"content_id": cid, "elder_id": eid}, {"_id": 0}).sort("created_at", 1).to_list(200)


class CommentIn(BaseModel):
    text: str


@api.post("/content/{cid}/comments")
async def add_content_comment(cid: str, b: CommentIn, u: dict = Depends(current_user)):
    item = _content_by_id(cid)
    if not item:
        raise HTTPException(404, "Video not found")
    text = (b.text or "").strip()[:500]
    if not text:
        raise HTTPException(422, "Say something first")
    eid = await elder_id_for(u)
    doc = {
        "id": str(uuid.uuid4()), "content_id": cid, "elder_id": eid,
        "user_id": u["id"], "name": u.get("name") or "Someone", "role": u["role"],
        "text": text, "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.content_comments.insert_one(doc.copy())
    who = doc["name"].split(" ")[0]
    title = item.get("title", "a video")
    if u["role"] == "elder":
        await notify_family(eid, "comment", f"{who} commented on \"{title}\"", f"“{text}”", {"content_id": cid})
    else:
        await notify_elder(eid, "comment", f"{who} commented on \"{title}\"", f"“{text}”", {"content_id": cid})
    return doc


@api.post("/content/{cid}/share")
async def share_content(cid: str, u: dict = Depends(current_user)):
    """Only the parent browses the catalogue today, so sharing only flows her way
    out to family — but the like/react/comment endpoints above work for whoever
    ends up watching, on either side, once it lands in their Shared videos."""
    item = _content_by_id(cid)
    if not item:
        raise HTTPException(404, "Video not found")
    if u["role"] != "elder":
        raise HTTPException(403, "Only the parent can share a video from Watch")
    eid = await elder_id_for(u)
    doc = {
        "id": str(uuid.uuid4()), "content_id": cid, "elder_id": eid,
        "shared_by_user_id": u["id"], "shared_by_name": u.get("name") or "Your parent",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.content_shares.insert_one(doc.copy())
    who = doc["shared_by_name"].split(" ")[0]
    contacts = await notify_family(
        eid, "video_share", "A video to watch together",
        f"{who} shared \"{item['title']}\" with you.", {"content_id": cid},
    )
    return {"id": doc["id"], "shared_with": len(contacts)}


@api.get("/family/shared-videos")
async def shared_videos(u: dict = Depends(current_user)):
    """What the parent has sent this way — newest first, each hydrated with its
    catalogue details plus the same like/react/comment state as the Watch tab."""
    eid = await elder_id_for(u)
    shares = await db.content_shares.find({"elder_id": eid}, {"_id": 0}).sort("created_at", -1).to_list(100)
    out = []
    seen = set()
    for s in shares:
        if s["content_id"] in seen:
            continue
        seen.add(s["content_id"])
        item = _content_by_id(s["content_id"])
        if not item:
            continue
        view = await _content_view(item, eid, u)
        view["shared_by_name"] = s["shared_by_name"]
        view["shared_at"] = s["created_at"]
        out.append(view)
    return out


# ============================ HEALTH ============================
def _med_view(m: dict, taken_today: bool = False) -> dict:
    days_left = m["stock"] // max(m["per_day"], 1)
    return {
        "id": m["id"], "name": m["name"], "dose": m["dose"], "time": m["time"],
        "type": m["type"], "stock": m["stock"], "per_day": m["per_day"],
        "taken_today": taken_today, "image": m["image"],
        "days_left": days_left, "low": days_left <= 3,
    }


async def _med_views(elder: dict) -> List[dict]:
    eid = elder["id"]
    meds = await db.medicines.find({"elder_id": eid}, {"_id": 0}).to_list(100)
    taken = await _taken_ids(eid, elder_day(elder))
    return [_med_view(m, m["id"] in taken) for m in meds]


async def _maybe_reorder_task(elder_id: str, med: dict, view: dict) -> Optional[dict]:
    """One open reorder request per medicine, however it was triggered."""
    if not view["low"]:
        return None
    existing = await db.tasks.find_one(
        {"elder_id": elder_id, "kind": "reorder", "med_id": med["id"], "status": {"$nin": ["done", "declined"]}}
    )
    if existing:
        return None
    return await _create_task(
        elder_id, "reorder", f"Reorder {med['name']}",
        f"{med['name']} is running low ({plural(view['days_left'], 'day')} left). Please arrange a refill.",
        med_id=med["id"], auto=True,
    )


@api.get("/health/overview")
async def health_overview(u: dict = Depends(current_user)):
    eid = await elder_id_for(u)
    elder = await db.users.find_one({"id": eid}, {"_id": 0})
    if not elder:
        raise HTTPException(404, "Account not found")
    appts = await db.appointments.find({"elder_id": eid}, {"_id": 0}).to_list(100)
    hour = elder_now(elder).hour
    if hour < 12:
        greeting = "Good morning"
    elif hour < 17:
        greeting = "Good afternoon"
    elif hour < 21:
        greeting = "Good evening"
    else:
        greeting = "Good night"
    med_views = await _med_views(elder)
    return {
        "greeting": greeting,
        "name": (elder or {}).get("name", "there").split(" ")[0],
        "medicines": med_views,
        "appointments": appts,
        "medicines_due": sum(1 for m in med_views if not m["taken_today"]),
        "low_stock": [m for m in med_views if m["low"]],
        "missed": await _compute_missed(elder),
    }


class TakeIn(BaseModel):
    # Explicit intent, so a second tap confirms rather than silently undoing.
    taken: bool = True

@api.post("/health/medicines/{med_id}/take")
async def take_medicine(med_id: str, b: Optional[TakeIn] = None, u: dict = Depends(current_user)):
    eid = await elder_id_for(u)
    elder = await db.users.find_one({"id": eid}, {"_id": 0})
    m = await db.medicines.find_one({"id": med_id, "elder_id": eid})
    if not m or not elder:
        raise HTTPException(404, "Medicine not found")
    taken = (b or TakeIn()).taken
    m = await _set_intake(elder, m, taken)
    view = _med_view(m, taken)
    reorder = await _maybe_reorder_task(eid, m, view) if taken else None
    return {"ok": True, "medicine": view, "reorder_task": reorder}


class MedIn(BaseModel):
    name: str
    dose: str = ""
    time: str = "8:00 AM"
    type: str = "tablet"
    per_day: int = 1
    stock: int = 30

@api.post("/health/medicines")
async def add_medicine(b: MedIn, u: dict = Depends(current_user)):
    eid = await elder_id_for(u)
    name = b.name.strip()
    if not name:
        raise HTTPException(422, "Please give the medicine a name")
    m = {
        "id": str(uuid.uuid4()), "elder_id": eid, "name": name, "dose": b.dose,
        "time": b.time, "type": b.type if b.type in MED_IMAGES else "tablet",
        "per_day": max(b.per_day, 1), "stock": b.stock,
        "image": MED_IMAGES.get(b.type, MED_IMAGES["tablet"]),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.medicines.insert_one(m.copy())
    return _med_view(m, False)


@api.delete("/health/medicines/{med_id}")
async def delete_medicine(med_id: str, u: dict = Depends(current_user)):
    """Remove a medicine and everything that hangs off it.

    Its dose history goes too, so a deleted medicine can't keep generating
    missed-dose alerts, and any open reorder request is withdrawn rather than
    left for the family to action on something that no longer exists.
    """
    eid = await elder_id_for(u)
    m = await db.medicines.find_one({"id": med_id, "elder_id": eid}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Medicine not found")

    await db.medicines.delete_one({"id": med_id, "elder_id": eid})
    await db.intakes.delete_many({"elder_id": eid, "medicine_id": med_id})
    await db.notifications.delete_many({"elder_id": eid, "kind": "missed_dose", "med_id": med_id})
    withdrawn = await db.tasks.delete_many(
        {"elder_id": eid, "med_id": med_id, "auto": True, "status": {"$nin": ["done", "declined"]}}
    )
    return {
        "ok": True,
        "name": m["name"],
        "reorder_requests_withdrawn": withdrawn.deleted_count,
        "message": f"{m['name']} has been removed from your medicines.",
    }


# ============================ STEPS ============================
# The phone counts the steps; we keep the daily totals so a week of history
# survives a reinstall, works on Android (whose pedometer can't be queried
# retroactively), and can be shown to the family.
STEP_GOAL_DEFAULT = 3000


class StepsIn(BaseModel):
    day: Optional[str] = None          # YYYY-MM-DD in the elder's own zone
    steps: int = Field(ge=0, le=200000)
    source: Optional[str] = None       # "pedometer" | "health" | "manual"


@api.post("/health/steps")
async def record_steps(b: StepsIn, u: dict = Depends(current_user)):
    """Upsert a day's step count for whoever is calling.

    Both the elder and the family log their own steps, scoped to the same
    family, so everyone can see how the others are doing. Highest count for the
    day wins, since the phone reports a running total that only grows.
    """
    eid = await elder_id_for(u)
    if not eid:
        raise HTTPException(404, "No family account linked")
    day = (b.day or elder_day(u)).strip()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
        raise HTTPException(422, "Day must look like 2026-08-17")
    existing = await db.steps.find_one({"user_id": u["id"], "day": day})
    steps = max(b.steps, (existing or {}).get("steps", 0))
    await db.steps.update_one(
        {"user_id": u["id"], "day": day},
        {"$set": {"user_id": u["id"], "elder_id": eid, "day": day, "steps": steps,
                  "source": b.source or "pedometer",
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"day": day, "steps": steps}


async def _step_week(elder: dict, days: int = 7, user_id: Optional[str] = None) -> dict:
    """The last N days ending today, in the elder's own zone. Missing days are
    reported as zero rather than skipped, so the week always has seven bars."""
    today = elder_now(elder).date()
    wanted = [(today - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(days - 1, -1, -1)]
    who = user_id or elder["id"]
    # Rows written before steps were per-person carry no user_id; treat those as
    # the elder's so existing history isn't lost.
    q = {"day": {"$in": wanted}, "$or": [{"user_id": who}]}
    if who == elder["id"]:
        q["$or"].append({"elder_id": elder["id"], "user_id": {"$exists": False}})
    rows = await db.steps.find(q, {"_id": 0}).to_list(days * 2)
    by_day: dict = {}
    for r in rows:
        by_day[r["day"]] = max(by_day.get(r["day"], 0), r["steps"])
    series = [{"day": d, "steps": by_day.get(d, 0)} for d in wanted]
    counted = [s["steps"] for s in series if s["steps"] > 0]
    best = max(series, key=lambda s: s["steps"]) if counted else None
    goal = (elder or {}).get("step_goal") or STEP_GOAL_DEFAULT
    return {
        "today": by_day.get(wanted[-1], 0),
        "goal": goal,
        "series": series,
        "total": sum(s["steps"] for s in series),
        "average": round(sum(counted) / len(counted)) if counted else 0,
        "best_day": best if best and best["steps"] > 0 else None,
        "days_active": len(counted),
        "goal_days": sum(1 for s in series if s["steps"] >= goal),
    }


@api.get("/health/steps")
async def get_steps(days: int = 7, u: dict = Depends(current_user)):
    """The caller's own week."""
    eid = await elder_id_for(u)
    elder = await db.users.find_one({"id": eid}, {"_id": 0})
    if not elder:
        raise HTTPException(404, "Account not found")
    return await _step_week(elder, max(1, min(days, 31)), user_id=u["id"])


@api.get("/health/steps/family")
async def get_family_steps(days: int = 7, u: dict = Depends(current_user)):
    """Everyone in the family, side by side — today and the week so far.

    Ordered by today's count so it reads as a gentle nudge rather than a
    league table nobody wanted.
    """
    eid = await elder_id_for(u)
    elder = await db.users.find_one({"id": eid}, {"_id": 0})
    if not elder:
        raise HTTPException(404, "Account not found")
    span = max(1, min(days, 31))

    people = [{"id": elder["id"], "name": elder.get("name"), "relation": "You" if u["id"] == elder["id"] else "Parent"}]
    for c in await _family_contacts(eid):
        people.append({"id": c["id"], "name": c["name"],
                       "relation": "You" if c["id"] == u["id"] else c["relation"]})

    members = []
    for person in people:
        week = await _step_week(elder, span, user_id=person["id"])
        members.append({
            **person,
            "is_me": person["id"] == u["id"],
            "today": week["today"],
            "total": week["total"],
            "average": week["average"],
            "days_active": week["days_active"],
            "goal_days": week["goal_days"],
            "series": week["series"],
        })

    members.sort(key=lambda m: m["today"], reverse=True)
    walking = [m for m in members if m["today"] > 0]
    return {
        "goal": (elder or {}).get("step_goal") or STEP_GOAL_DEFAULT,
        "members": members,
        "family_total_today": sum(m["today"] for m in members),
        "family_total_week": sum(m["total"] for m in members),
        "leader": walking[0]["name"] if walking else None,
    }


class OCRIn(BaseModel):
    image_base64: str

async def _ocr_extract(img_b64: str) -> list:
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY, session_id=f"ocr-{uuid.uuid4()}",
        system_message=(
            "You read a photo of a medical prescription. Extract the medicines. "
            "Return ONLY a JSON array. Each item: {\"name\": str, \"dose\": str, "
            "\"time\": str (e.g. '8:00 AM'), \"type\": one of tablet|capsule|syrup|drops, "
            "\"per_day\": int}. If unreadable, return []."
        ),
    ).with_model(*GEMINI)
    msg = UserMessage(text="Extract the medicines from this prescription.", file_contents=[ImageContent(image_base64=img_b64)])
    raw = str(await chat.send_message(msg))
    mm = re.search(r"\[.*\]", raw, re.S)
    meds = json.loads(mm.group(0)) if mm else []
    clean = []
    for it in meds[:10]:
        if not str(it.get("name", "")).strip():
            continue
        clean.append({
            "name": str(it.get("name", "")).strip()[:60],
            "dose": str(it.get("dose", "")).strip()[:40],
            "time": str(it.get("time", "8:00 AM")).strip()[:20],
            "type": it.get("type") if it.get("type") in MED_IMAGES else "tablet",
            "per_day": int(it.get("per_day", 1) or 1),
        })
    return clean


@api.post("/health/prescriptions")
async def scan_and_store_prescription(b: OCRIn, u: dict = Depends(require_role("elder"))):
    """Store the prescription photo securely in object storage, run OCR, save record."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "AI not configured")
    img = b.image_base64
    if "," in img and img.strip().startswith("data:"):
        img = img.split(",", 1)[1]
    try:
        raw_bytes = base64.b64decode(img)
    except Exception:
        raise HTTPException(400, "Invalid image data")

    pid = str(uuid.uuid4())
    storage_path = f"{APP_NAME}/uploads/{u['id']}/{pid}.jpg"
    try:
        await run_in_threadpool(put_object, storage_path, raw_bytes, "image/jpeg")
    except Exception as e:
        logger.exception("prescription upload failed")
        raise HTTPException(502, f"Could not save the photo: {e}")

    try:
        meds = await _ocr_extract(img)
    except Exception:
        logger.exception("prescription ocr failed")
        meds = []

    doc = {
        "id": pid, "elder_id": u["id"], "storage_path": storage_path,
        "medicines": meds, "created_at": datetime.now(timezone.utc).isoformat(), "deleted": False,
    }
    await db.prescriptions.insert_one(doc.copy())
    return {"id": pid, "medicines": meds}


@api.get("/prescriptions")
async def list_prescriptions(u: dict = Depends(current_user)):
    eid = await elder_id_for(u)
    docs = await db.prescriptions.find({"elder_id": eid, "deleted": {"$ne": True}}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [{"id": d["id"], "medicines": d["medicines"], "created_at": d["created_at"]} for d in docs]


AUDIO_EXTS = {"mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm", "ogg"}
AUDIO_TYPES = {
    "m4a": "audio/m4a", "mp3": "audio/mpeg", "mpeg": "audio/mpeg", "mpga": "audio/mpeg",
    "mp4": "audio/mp4", "wav": "audio/wav", "webm": "audio/webm", "ogg": "audio/ogg",
}


def _audio_ext(filename: Optional[str], default: str = "m4a") -> str:
    if filename and "." in filename:
        e = filename.rsplit(".", 1)[-1].lower()
        if e in AUDIO_EXTS:
            return e
    return default


async def _user_for_media(
    token: Optional[str],
    creds: Optional[HTTPAuthorizationCredentials],
) -> dict:
    """Resolve the caller for a streamed media response.

    Prefers the Authorization header; falls back to a short-lived token scoped to
    media so a shared URL can never act as a session.
    """
    if creds:
        return await current_user(creds)
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except Exception:
        raise HTTPException(401, "Invalid token")
    if payload.get("scope") != MEDIA_SCOPE:
        raise HTTPException(403, "This token cannot be used for media")
    u = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0})
    if not u:
        raise HTTPException(401, "User not found")
    return u


def make_media_token(uid: str) -> str:
    """A narrow, short-lived token. A leaked media URL can't be replayed as a session."""
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": uid, "scope": MEDIA_SCOPE, "iat": now,
         "exp": now + timedelta(minutes=MEDIA_TOKEN_MINUTES)},
        JWT_SECRET, algorithm=JWT_ALG,
    )


@api.post("/media-token")
async def media_token(u: dict = Depends(current_user)):
    """One short-lived token for streamed prescription images and voice notes."""
    return {"token": make_media_token(u["id"]), "expires_in": MEDIA_TOKEN_MINUTES * 60}


# Kept so existing clients that ask for an image token keep working.
@api.post("/prescriptions/image-token")
async def prescription_image_token(u: dict = Depends(current_user)):
    return {"token": make_media_token(u["id"]), "expires_in": MEDIA_TOKEN_MINUTES * 60}


@api.get("/prescriptions/{pid}/image")
async def prescription_image(
    pid: str,
    token: Optional[str] = Query(None),
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
):
    """Prefer the Authorization header; fall back to a scoped media token for
    clients that can't set headers on an image request."""
    u = await _user_for_media(token, creds)
    eid = await elder_id_for(u)
    doc = await db.prescriptions.find_one({"id": pid, "elder_id": eid, "deleted": {"$ne": True}})
    if not doc:
        raise HTTPException(404, "Prescription not found")
    try:
        content, ctype = await run_in_threadpool(get_object, doc["storage_path"])
    except Exception:
        raise HTTPException(404, "Image not available")
    return Response(content=content, media_type=ctype, headers={"Cache-Control": "private, max-age=300"})


# ============================ CONCIERGE / TASKS ============================
async def _create_task(elder_id: str, kind: str, title: str, detail: str, med_id: str = None, auto: bool = False):
    task = {
        "id": str(uuid.uuid4()), "elder_id": elder_id, "kind": kind,
        "title": title, "detail": detail, "med_id": med_id,
        "status": "requested", "auto": auto,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "timeline": [{"status": "requested", "at": datetime.now(timezone.utc).isoformat(), "by": "elder" if not auto else "system"}],
    }
    await db.tasks.insert_one(task.copy())
    task.pop("_id", None)
    return task


class ConciergeIn(BaseModel):
    request: str

@api.post("/concierge/request")
async def concierge_request(b: ConciergeIn, u: dict = Depends(current_user)):
    """Raise a request. Either side can: the elder asks for herself, and a family
    member arranges something on her behalf without waiting to be asked."""
    b.request = b.request.strip()
    if not b.request:
        raise HTTPException(422, "Please tell us what you'd like us to arrange")
    detail = b.request
    if not EMERGENT_LLM_KEY:
        kind, title = "other", b.request[:60]
    else:
        try:
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY, session_id=f"concierge-{uuid.uuid4()}",
                system_message=(
                    "You are a warm concierge for an elderly person in India. "
                    "Turn their request into a task. Return ONLY JSON: "
                    "{\"kind\": one of reorder|doctor|transport|other, "
                    "\"title\": short title (max 6 words), "
                    "\"detail\": one friendly sentence describing what to arrange}."
                ),
            ).with_model(*OPENAI_MINI)
            raw = str(await chat.send_message(UserMessage(text=b.request)))
            mm = re.search(r"\{.*\}", raw, re.S)
            parsed = json.loads(mm.group(0)) if mm else {}
            kind = parsed.get("kind", "other")
            title = parsed.get("title", b.request[:60])
            detail = parsed.get("detail", b.request)
        except Exception:
            kind, title, detail = "other", b.request[:60], b.request
    eid = await elder_id_for(u)
    if not eid:
        raise HTTPException(404, "No family account linked")
    task = await _create_task(eid, kind if kind in {"reorder", "doctor", "transport", "other"} else "other", title, detail)
    # A request the family raised is theirs to see through, so say who asked.
    if u["role"] == "child":
        await db.tasks.update_one({"id": task["id"]}, {"$set": {"raised_by": u["id"], "raised_by_name": u.get("name")}})
        await notify_elder(eid, "task_update", "Your family is arranging something",
                           f"{(u.get('name') or 'Your family').split(' ')[0]} is arranging: {title}.",
                           {"task_id": task["id"]})
        task = await db.tasks.find_one({"id": task["id"]}, {"_id": 0})
    return task


@api.get("/concierge/tasks")
async def list_tasks(u: dict = Depends(current_user)):
    eid = await elder_id_for(u)
    tasks = await db.tasks.find({"elder_id": eid}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return tasks


# ============================ WHO DOES THE TASK ============================
# Every request can go one of two ways: the family arranges it, or the Sunshine
# concierge does. The concierge track is deliberately human-in-the-loop — the
# model drafts the order, a person places it, and only then is the family asked
# to pay. Nothing tells the elder an order exists until a human has placed it.
ORDER_SYS = (
    "You are preparing a shopping or booking order for an elderly person in India, "
    "for a human operator to check and place. Return ONLY JSON: "
    "{\"items\": [{\"label\": short item or service name, \"qty\": integer, "
    "\"amount\": estimated price in Indian rupees as a number}], "
    "\"note\": one short sentence for the operator}. "
    "Give realistic Indian retail prices. Two to five items at most. "
    "Never include anything the request did not ask for."
)

ASSIGNEES = {"family", "concierge"}


async def _draft_order(task: dict, elder: dict) -> dict:
    """Have the model turn a request into priced line items for a human to check."""
    low = [m for m in await _med_views(elder) if m["low"]]
    context = {
        "request": task.get("detail") or task.get("title"),
        "kind": task.get("kind"),
        "low_stock_medicines": [{"name": m["name"], "dose": m["dose"]} for m in low],
    }
    fallback = {"items": [{"label": task.get("title", "Requested item"), "qty": 1, "amount": 0}],
                "note": "Needs pricing by the operator."}
    if not EMERGENT_LLM_KEY:
        return fallback
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY, session_id=f"order-{uuid.uuid4()}",
            system_message=ORDER_SYS,
        ).with_model(*GEMINI)
        raw = str(await chat.send_message(UserMessage(text=json.dumps(context))))
        mm = re.search(r"\{.*\}", raw, re.S)
        parsed = json.loads(mm.group(0)) if mm else {}
        items = []
        for it in (parsed.get("items") or [])[:5]:
            label = str(it.get("label", "")).strip()[:80]
            if not label:
                continue
            items.append({
                "label": label,
                "qty": max(int(it.get("qty") or 1), 1),
                "amount": round(float(it.get("amount") or 0), 2),
            })
        if not items:
            return fallback
        return {"items": items, "note": str(parsed.get("note") or "").strip()[:200]}
    except Exception:
        logger.exception("order drafting failed")
        return fallback


async def _apply_assignment(elder: dict, task: dict, assignee: str) -> dict:
    """Route a request to the family or to Sunshine. One path, whether the choice
    came from a tap or from something she said out loud."""
    eid = elder["id"]
    now = datetime.now(timezone.utc).isoformat()
    entry = {"status": task["status"], "at": now, "by": "elder", "note": f"assigned to {assignee}"}
    update = {"assignee": assignee, "assigned_at": now}
    contacts = await _family_contacts(eid)

    if assignee == "family":
        if not contacts:
            return {
                "reply": "Nobody is connected to your account yet, so I'll take care of it myself.",
                "executed": None, "reassigned": "concierge",
            }
        update["status"] = "requested"
        await db.tasks.update_one({"id": task["id"]}, {"$set": update, "$push": {"timeline": entry}})
        await notify_family(
            eid, "task_assigned", "A request needs you",
            f"{elder.get('name', 'Your parent')} asked you to arrange: {task['title']}.",
            {"task_id": task["id"]},
        )
        names = ", ".join(c["name"].split(" ")[0] for c in contacts)
        return {"reply": f"I've asked {names} to arrange it.", "executed": f"Sent to {names}", "reassigned": None}

    draft = await _draft_order(task, elder)
    update.update({"status": "agent_arranging", "draft_order": draft, "fulfilment": "awaiting_operator"})
    await db.tasks.update_one({"id": task["id"]}, {"$set": update, "$push": {"timeline": entry}})
    await notify_family(
        eid, "task_assigned", "Sunshine is arranging this",
        f"{elder.get('name', 'Your parent')} asked Sunshine to arrange: {task['title']}. "
        f"You'll be asked to approve the cost before anything is paid for.",
        {"task_id": task["id"]},
    )
    return {
        "reply": "Leave it with me. I'll arrange it and your family will be asked to approve the cost.",
        "executed": "Sunshine is arranging it", "reassigned": None,
    }


class AssignIn(BaseModel):
    assignee: Literal["family", "concierge"]


@api.post("/concierge/tasks/{task_id}/assign")
async def assign_task(task_id: str, b: AssignIn, u: dict = Depends(current_user)):
    """The elder chooses who should handle it: their family, or Sunshine."""
    eid = await elder_id_for(u)
    elder = await db.users.find_one({"id": eid}, {"_id": 0})
    t = await db.tasks.find_one({"id": task_id, "elder_id": eid}, {"_id": 0})
    if not t or not elder:
        raise HTTPException(404, "Request not found")
    if t.get("status") in {"done", "declined"}:
        raise HTTPException(409, "That request is already finished")

    out = await _apply_assignment(elder, t, b.assignee)
    if out.get("reassigned"):
        out = await _apply_assignment(elder, t, out["reassigned"])
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    return {"task": task, "message": out["reply"]}


class PlaceOrderIn(BaseModel):
    """Filled in by the human operator who actually places the order."""
    items: Optional[List[dict]] = None
    vendor: Optional[str] = None
    reference: Optional[str] = None


@api.post("/concierge/tasks/{task_id}/place-order")
async def place_order(task_id: str, b: PlaceOrderIn, u: dict = Depends(current_user)):
    """Record that a human placed the order, and raise an invoice for the family.

    This is the human half of the loop. It is a separate call on purpose: the
    elder is never told an order exists until someone has actually placed it.
    """
    eid = await elder_id_for(u)
    elder = await db.users.find_one({"id": eid}, {"_id": 0})
    t = await db.tasks.find_one({"id": task_id, "elder_id": eid}, {"_id": 0})
    if not t or not elder:
        raise HTTPException(404, "Request not found")
    if t.get("assignee") != "concierge":
        raise HTTPException(409, "This request is being handled by the family")

    items = b.items if b.items is not None else (t.get("draft_order") or {}).get("items") or []
    clean = []
    for it in items[:10]:
        label = str(it.get("label", "")).strip()[:80]
        if not label:
            continue
        clean.append({"label": label, "qty": max(int(it.get("qty") or 1), 1),
                      "amount": round(float(it.get("amount") or 0), 2)})
    if not clean:
        raise HTTPException(422, "An order needs at least one item")
    total = round(sum(i["amount"] * i["qty"] for i in clean), 2)
    if total <= 0:
        # An unpriced order must not become a payment request to the family.
        raise HTTPException(422, "Price the order before placing it")

    invoice = {
        "id": str(uuid.uuid4()), "elder_id": eid, "task_id": task_id,
        "title": t["title"], "items": clean, "total": total, "currency": "INR",
        "vendor": (b.vendor or "Sunshine Concierge")[:80],
        "reference": (b.reference or "")[:60],
        "status": "unpaid", "created_at": datetime.now(timezone.utc).isoformat(), "paid_at": None,
    }
    await db.invoices.insert_one(invoice.copy())

    now = datetime.now(timezone.utc).isoformat()
    await db.tasks.update_one({"id": task_id}, {
        "$set": {"status": "awaiting_payment", "fulfilment": "ordered", "invoice_id": invoice["id"], "order": clean},
        "$push": {"timeline": {"status": "awaiting_payment", "at": now, "by": "concierge",
                               "note": f"order placed with {invoice['vendor']}"}},
    })

    await notify_family(
        eid, "invoice", "A payment is needed",
        f"Sunshine arranged \"{t['title']}\" for {elder.get('name', 'your parent')}. "
        f"The total is ₹{total:.0f}.",
        {"task_id": task_id, "invoice_id": invoice["id"], "total": total},
    )
    await notify_elder(
        eid, "task_update", "Sunshine has arranged it",
        f"\"{t['title']}\" has been arranged. Your family has been asked to settle the cost.",
        {"task_id": task_id},
    )
    invoice.pop("_id", None)
    return {"task": await db.tasks.find_one({"id": task_id}, {"_id": 0}), "invoice": invoice}


@api.get("/concierge/invoices")
async def list_invoices(u: dict = Depends(current_user)):
    eid = await elder_id_for(u)
    return await db.invoices.find({"elder_id": eid}, {"_id": 0}).sort("created_at", -1).to_list(100)


@api.post("/concierge/invoices/{invoice_id}/pay")
async def pay_invoice(invoice_id: str, u: dict = Depends(require_role("child"))):
    """Mark an invoice settled.

    This records the payment against the request; it does not itself move money.
    Wiring a payment provider is a separate integration.
    """
    eid = u.get("elder_id")
    inv = await db.invoices.find_one({"id": invoice_id, "elder_id": eid}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv["status"] == "paid":
        return inv

    now = datetime.now(timezone.utc).isoformat()
    await db.invoices.update_one({"id": invoice_id}, {"$set": {"status": "paid", "paid_at": now, "paid_by": u["id"]}})
    await db.tasks.update_one({"id": inv["task_id"]}, {
        "$set": {"status": "done", "fulfilment": "settled"},
        "$push": {"timeline": {"status": "done", "at": now, "by": "child", "note": "invoice settled"}},
    })
    await notify_elder(
        eid, "task_update", "All taken care of",
        f"\"{inv['title']}\" is done and your family has settled it.",
        {"task_id": inv["task_id"]},
    )
    return await db.invoices.find_one({"id": invoice_id}, {"_id": 0})


class TaskStatusIn(BaseModel):
    status: Literal["approved", "in_progress", "done", "declined"]

@api.post("/concierge/tasks/{task_id}/status")
async def update_task(task_id: str, b: TaskStatusIn, u: dict = Depends(require_role("child"))):
    t = await db.tasks.find_one({"id": task_id, "elder_id": u.get("elder_id")})
    if not t:
        raise HTTPException(404, "Task not found")
    entry = {"status": b.status, "at": datetime.now(timezone.utc).isoformat(), "by": "child"}
    await db.tasks.update_one({"id": task_id}, {"$set": {"status": b.status}, "$push": {"timeline": entry}})
    t = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    return t


# ============================ NOTIFICATIONS ============================
class NotifyIn(BaseModel):
    to: str  # daughter | son | doctor
    message: str

@api.post("/notify")
async def notify(b: NotifyIn, u: dict = Depends(current_user)):
    eid = await elder_id_for(u)
    n = {
        "id": str(uuid.uuid4()), "elder_id": eid, "to": b.to, "message": b.message,
        "from_role": u["role"], "at": datetime.now(timezone.utc).isoformat(),
    }
    await db.notifications.insert_one(n.copy())
    return {"ok": True, "message": f"Message sent to {b.to.title()}."}


# ============================ SOS / IM-OKAY ============================
# ============================ PUSH DELIVERY ============================
# The inbox only helps someone who has already opened the app. An SOS at 3am has
# to reach a phone that is face-down on a bedside table, so every notification is
# also delivered to that user's registered devices through Expo's push service.

EXPO_PUSH_URL = os.environ.get("EXPO_PUSH_URL", "https://exp.host/--/api/v2/push/send")
# Expo accepts unauthenticated sends; an access token is what stops anyone who
# learns a token from pushing to your users. Set it in production.
EXPO_ACCESS_TOKEN = os.environ.get("EXPO_ACCESS_TOKEN", "")
PUSH_ENABLED = os.environ.get("PUSH_ENABLED", "1") == "1"
# Sends are fire-and-forget so an emergency response is never held up by a slow
# third party. Tests set this to await them instead.
PUSH_SYNC = os.environ.get("PUSH_SYNC", "0") == "1"
EXPO_BATCH = 100  # Expo rejects larger batches.

# Which alerts are allowed to wake a phone that is on silent, and which channel
# Android should file them under. Everything else arrives quietly.
URGENT_KINDS = {"sos", "missed_dose"}


def _is_expo_token(token: str) -> bool:
    return isinstance(token, str) and token.startswith(("ExponentPushToken[", "ExpoPushToken["))


async def _devices_for(user_ids: List[str]) -> List[dict]:
    if not user_ids:
        return []
    return await db.devices.find(
        {"user_id": {"$in": user_ids}, "disabled": {"$ne": True}}, {"_id": 0}
    ).to_list(500)


async def _disable_token(token: str, reason: str) -> None:
    """A token Expo has rejected will never work again — stop sending to it."""
    await db.devices.update_one(
        {"token": token},
        {"$set": {"disabled": True, "disabled_reason": reason,
                  "disabled_at": datetime.now(timezone.utc).isoformat()}},
    )


async def _post_expo(messages: List[dict]) -> List[dict]:
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if EXPO_ACCESS_TOKEN:
        headers["Authorization"] = f"Bearer {EXPO_ACCESS_TOKEN}"
    async with httpx.AsyncClient(timeout=15) as http:
        r = await http.post(EXPO_PUSH_URL, json=messages, headers=headers)
        r.raise_for_status()
        return (r.json() or {}).get("data") or []


async def send_push(messages: List[dict]) -> dict:
    """Deliver a batch and retire any token Expo tells us is dead.

    Never raises: a push that fails must not take an SOS or an invoice down with
    it, because the inbox row has already been written either way.
    """
    sent = failed = retired = 0
    for i in range(0, len(messages), EXPO_BATCH):
        batch = messages[i:i + EXPO_BATCH]
        try:
            tickets = await _post_expo(batch)
        except Exception:
            logger.exception("expo push batch failed")
            failed += len(batch)
            continue
        for msg, ticket in zip(batch, tickets):
            if (ticket or {}).get("status") == "ok":
                sent += 1
                continue
            failed += 1
            detail = ((ticket or {}).get("details") or {}).get("error")
            if detail in {"DeviceNotRegistered", "InvalidCredentials"}:
                await _disable_token(msg["to"], detail)
                retired += 1
            else:
                logger.warning("push rejected: %s", ticket)
    return {"sent": sent, "failed": failed, "retired": retired}


async def push_to_users(user_ids: List[str], kind: str, title: str, body: str,
                        data: Optional[dict] = None) -> dict:
    """Build one message per registered device and hand the batch to Expo."""
    if not PUSH_ENABLED or not user_ids:
        return {"sent": 0, "failed": 0, "retired": 0}

    devices = await _devices_for(user_ids)
    if not devices:
        return {"sent": 0, "failed": 0, "retired": 0}

    urgent = kind in URGENT_KINDS
    # An unread badge is per person, so it has to be counted per person.
    badges = {
        uid: await db.notifications.count_documents({"to_user_id": uid, "read": False})
        for uid in {d["user_id"] for d in devices}
    }

    messages = []
    for d in devices:
        token = d.get("token", "")
        if not _is_expo_token(token):
            continue
        messages.append({
            "to": token,
            "title": title or "Sunshine",
            "body": body,
            "sound": "default",
            "badge": badges.get(d["user_id"], 0),
            "priority": "high" if urgent else "default",
            "channelId": "urgent" if urgent else "default",
            # iOS only shows a critical alert with an entitlement Apple grants
            # case by case; high priority is what we can promise today.
            "data": {"kind": kind, **(data or {})},
        })
    if not messages:
        return {"sent": 0, "failed": 0, "retired": 0}
    return await send_push(messages)


def _dispatch_push(user_ids: List[str], kind: str, title: str, body: str,
                   data: Optional[dict] = None) -> None:
    """Start the send without waiting for it, unless a test asked us to wait."""
    if not PUSH_ENABLED or not user_ids:
        return
    coro = push_to_users(list(user_ids), kind, title, body, data)
    if PUSH_SYNC:
        # Awaited by the caller in tests; see notify_users.
        _pending_pushes.append(coro)
        return
    task = asyncio.create_task(coro)
    _background.add(task)
    task.add_done_callback(_background.discard)


# Strong references, so a fire-and-forget task is not garbage collected mid-send.
_background: set = set()
# Only used when PUSH_SYNC is on.
_pending_pushes: list = []


async def drain_pushes() -> List[dict]:
    """Await every queued send. Test-only; a no-op unless PUSH_SYNC is set."""
    results = []
    while _pending_pushes:
        results.append(await _pending_pushes.pop(0))
    return results


# ============================ NOTIFICATION BUS ============================
# One shape for everything either side needs to be told about, so both apps can
# render a single inbox instead of each screen inventing its own alert.
async def notify_users(
    elder_id: str,
    user_ids: List[str],
    kind: str,
    title: str,
    body: str,
    data: Optional[dict] = None,
) -> int:
    if not user_ids:
        return 0
    now = datetime.now(timezone.utc).isoformat()
    rows = [{
        "id": str(uuid.uuid4()), "elder_id": elder_id, "to_user_id": uid,
        "kind": kind, "title": title, "message": body, "data": data or {},
        "at": now, "read": False,
    } for uid in user_ids]
    await db.notifications.insert_many(rows)
    # The row is the record; the push is the doorbell. Written first so a push
    # failure can never lose the notification itself.
    _dispatch_push(user_ids, kind, title, body, data)
    return len(rows)


async def notify_family(elder_id: str, kind: str, title: str, body: str, data: Optional[dict] = None) -> List[dict]:
    """Tell every connected family member. Returns who was told."""
    contacts = await _family_contacts(elder_id)
    await notify_users(elder_id, [c["id"] for c in contacts], kind, title, body, data)
    return contacts


async def notify_elder(elder_id: str, kind: str, title: str, body: str, data: Optional[dict] = None) -> None:
    """Tell the elder. The child side finally has a way to reach them in-app."""
    await notify_users(elder_id, [elder_id], kind, title, body, data)


async def _alert_family(elder_id: str, kind: str, message: str) -> List[dict]:
    """Back-compat wrapper for the two safety alerts, now on the shared bus."""
    titles = {"sos": "Emergency alert", "im_okay": "They're doing well"}
    return await notify_family(elder_id, kind, titles.get(kind, "Sunshine"), message)


@api.post("/sos")
async def sos(u: dict = Depends(current_user)):
    """Raise an alert and report only what actually happened.

    Nothing here promises delivery we can't prove. If no family member has joined
    yet, the caller is told plainly so it can offer the emergency dialler instead.
    """
    eid = await elder_id_for(u)
    elder = await db.users.find_one({"id": eid}, {"_id": 0})
    name = (elder or {}).get("name", "Your parent")
    await db.events.insert_one({
        "id": str(uuid.uuid4()), "elder_id": eid, "type": "sos",
        "at": datetime.now(timezone.utc).isoformat(),
    })
    contacts = await _alert_family(eid, "sos", f"{name} pressed the SOS button and needs help now.")
    if contacts:
        message = (
            f"We've alerted {plural(len(contacts), 'family member')}. "
            f"They will see this as soon as they open Sunshine. "
            f"If this is urgent, call {EMERGENCY_NUMBER} as well."
        )
    else:
        message = (
            "No family member is connected to your account yet, so nobody could be alerted. "
            f"Please call {EMERGENCY_NUMBER} for emergency help."
        )
    return {
        "ok": True,
        "delivered": bool(contacts),
        "message": message,
        "contacts_notified": [c["name"] for c in contacts],
        "emergency_number": EMERGENCY_NUMBER,
    }


@api.post("/im-okay")
async def im_okay(u: dict = Depends(require_role("elder"))):
    await db.events.insert_one({
        "id": str(uuid.uuid4()), "elder_id": u["id"], "type": "im_okay",
        "at": datetime.now(timezone.utc).isoformat(),
    })
    contacts = await _alert_family(u["id"], "im_okay", f"{u.get('name', 'Your parent')} let you know they are doing well.")
    if contacts:
        message = f"We've let {plural(len(contacts), 'family member')} know you're doing well."
    else:
        message = "No family member is connected yet. Share your family code so they can see this."
    return {"ok": True, "delivered": bool(contacts), "message": message, "contacts_notified": [c["name"] for c in contacts]}


# ============================ CHILD ANALYTICS ============================
@api.get("/child/analytics")
async def child_analytics(u: dict = Depends(require_role("child"))):
    eid = u.get("elder_id")
    elder = await db.users.find_one({"id": eid}, {"_id": 0})
    if not elder:
        raise HTTPException(404, "Parent account not found")
    acts = await db.activity.find({"elder_id": eid}).sort("at", -1).to_list(200)
    last_active = acts[0]["at"] if acts else None
    counts: dict = {}
    for a in acts:
        counts[a["feature"]] = counts.get(a["feature"], 0) + 1
    most_used = max(counts, key=counts.get) if counts else None
    med_views = await _med_views(elder)
    appts = await db.appointments.find({"elder_id": eid}, {"_id": 0}).to_list(100)
    pending = await db.tasks.count_documents({"elder_id": eid, "status": {"$in": ["requested"]}})
    missed = await _compute_missed(elder)
    alerts = await db.notifications.find(
        {"elder_id": eid, "kind": {"$in": ["missed_dose", "sos", "im_okay"]}}, {"_id": 0}
    ).sort("at", -1).to_list(20)
    return {
        "elder_name": elder["name"],
        "elder_photo": elder.get("photo_url"),
        "location": elder.get("location") or "Not set",
        "last_active": last_active,
        "most_used_feature": most_used,
        "feature_counts": counts,
        "medicines": med_views,
        "low_stock_count": sum(1 for m in med_views if m["low"]),
        "appointments": appts,
        "pending_tasks": pending,
        "missed_doses": missed,
        "alerts": [{"kind": a.get("kind"), "message": a["message"], "at": a["at"], "day": a.get("day")} for a in alerts],
    }


# ============================ VOICE / ASSISTANT ============================
class VoiceAsk(BaseModel):
    reel_title: str
    reel_description: str
    question: str

@api.post("/voice/ask")
async def voice_ask(b: VoiceAsk, u: dict = Depends(current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "AI not configured")
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY, session_id=f"ask-{uuid.uuid4()}",
        system_message="You are Sunshine, warm and simple, for older adults in India. Reply in 2-4 short kind sentences. No jargon, no emojis.",
    ).with_model(*OPENAI_MINI)
    prompt = f"The video '{b.reel_title}' ({b.reel_description}). The viewer asks: '{b.question}'. Answer simply and warmly."
    return {"answer": str(await chat.send_message(UserMessage(text=prompt))).strip()}


ASSISTANT_SYS = (
    "You are Sunshine, a warm, patient assistant for older adults aged 60-80 in India. "
    "Reply in very simple, clear English, short sentences, kind and reassuring, like a caring grandchild. "
    "Keep answers brief (2-5 sentences). Help with everyday questions, health/wellbeing, recipes, "
    "technology help, scam safety, and staying in touch with family. "
    "If it sounds like an emergency, gently say to use the red SOS button. No jargon, no emojis."
)

class AssistantChatIn(BaseModel):
    session_id: Optional[str] = None
    message: str

@api.post("/assistant/chat")
async def assistant_chat(b: AssistantChatIn, u: dict = Depends(current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "AI not configured")
    msg = b.message.strip()
    if not msg:
        raise HTTPException(400, "Message cannot be empty")
    sid = b.session_id or str(uuid.uuid4())
    # A session belongs to whoever opened it. Health questions aren't readable
    # by anyone who happens to guess the id.
    owned = await db.assistant_messages.find_one({"session_id": sid})
    if owned and owned.get("user_id") != u["id"]:
        raise HTTPException(403, "This conversation belongs to another account")

    hist = await db.assistant_messages.find({"session_id": sid, "user_id": u["id"]}).sort("created_at", 1).to_list(40)
    first_name = (u.get("name") or "They").split(" ")[0]
    ctx = "\n".join([(first_name if m["role"] == "user" else "Sunshine") + ": " + m["text"] for m in hist[-10:]])
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=sid, system_message=ASSISTANT_SYS).with_model(*GEMINI)
    prompt = f"Our chat so far:\n{ctx}\n\nThey now say: {msg}\n\nReply warmly as Sunshine." if ctx else msg
    answer = str(await chat.send_message(UserMessage(text=prompt))).strip()
    action = await _detect_action(await elder_id_for(u), msg)
    now = datetime.now(timezone.utc).isoformat()
    await db.assistant_messages.insert_many([
        {"id": str(uuid.uuid4()), "session_id": sid, "user_id": u["id"], "role": "user", "text": msg, "created_at": now},
        {"id": str(uuid.uuid4()), "session_id": sid, "user_id": u["id"], "role": "assistant", "text": answer, "created_at": now},
    ])
    return {"session_id": sid, "answer": answer, "action": action}


async def _detect_action(elder_id: str, message: str) -> Optional[dict]:
    """Detect a call/message intent, resolved against really-connected people."""
    if not EMERGENT_LLM_KEY:
        return None
    contacts = await _family_contacts(elder_id)
    if not contacts:
        return None
    roster = ", ".join(f"{c['name']} ({c['relation']})" for c in contacts)
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY, session_id=f"act-{uuid.uuid4()}",
            system_message=(
                "Decide if the user wants to CALL someone or SEND A MESSAGE to someone. "
                f"The only people available are: {roster}. "
                "Return ONLY JSON: {\"type\": one of none|call|message, "
                "\"name\": the exact name of the person from the list, or null, "
                "\"message\": the message text if type is message else null}. "
                "If they mean somebody who is not on the list, return type none. "
                "If it is just a question or chit-chat, return {\"type\":\"none\",\"name\":null,\"message\":null}."
            ),
        ).with_model(*OPENAI_MINI)
        raw = str(await chat.send_message(UserMessage(text=message)))
        mm = re.search(r"\{.*\}", raw, re.S)
        if not mm:
            return None
        parsed = json.loads(mm.group(0))
        if parsed.get("type") not in {"call", "message"}:
            return None
        wanted = (parsed.get("name") or "").strip().lower()
        match = next((c for c in contacts if c["name"].lower() == wanted), None)
        if not match:
            return None
        return {
            "type": parsed["type"], "target": match["id"], "target_name": match["name"],
            "relation": match["relation"], "message": parsed.get("message"),
        }
    except Exception:
        logger.exception("_detect_action failed")
    return None

@api.get("/assistant/history")
async def assistant_history(session_id: str, u: dict = Depends(current_user)):
    docs = await db.assistant_messages.find(
        {"session_id": session_id, "user_id": u["id"]}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    return [{"role": d["role"], "text": d["text"]} for d in docs]


# ============================ VOICE AGENT (talk to Sunshine) ============================
AGENT_SYS = (
    "You are Sunshine, a warm voice assistant for an older adult in India. "
    "You can DO things in her app. Read her request and choose ONE intent, then reply in ONE short warm spoken sentence. "
    "Return ONLY JSON with these keys: "
    "reply (string, one short kind sentence spoken back to her), "
    "intent (one of: call, notify, mark_medicine, add_medicine, voice_note, order_medicine, book_doctor, arrange_transport, im_okay, sos, answer), "
    "name (the exact name of the person from the contact list you are given, or null), "
    "medicine (the medicine name, or null), "
    "dose (e.g. '500 mg' or '1 tablet', or null), "
    "time (e.g. '9:00 PM', or null), "
    "med_type (one of tablet, capsule, syrup, drops, or null), "
    "per_day (integer number of times per day, or null), "
    "message (text to send if intent is notify, else null), "
    "details (any extra detail for a request, or null). "
    "Meaning of intents: call=start a call to target; notify=send a text message to target; "
    "mark_medicine=mark an existing medicine as taken; add_medicine=add a NEW medicine to her list (she says its name, dose and time); "
    "voice_note=record and send a voice note to target; order_medicine=arrange a medicine refill; book_doctor=arrange a doctor consultation; "
    "arrange_transport=arrange a taxi; im_okay=reassure family; sos=emergency alert; answer=just answer her question. "
    "For order_medicine, book_doctor and arrange_transport also return "
    "\"who\": \"family\" if she said her family or a relative should do it, "
    "\"concierge\" if she said Sunshine or you should do it, or null if she did not say. "
    "If it is a general question, use intent 'answer'. No emojis, no jargon."
)


async def _transcribe_audio(audio: bytes, ext: str) -> str:
    bio = io.BytesIO(audio)
    bio.name = f"speech.{ext}"
    stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
    result = await stt.transcribe(file=bio, model="whisper-1", response_format="json")
    return (getattr(result, "text", "") or "").strip()


async def _run_agent(elder: dict, message: str) -> dict:
    """LLM picks an intent; the backend executes it and reports only what it did."""
    eid = elder["id"]
    contacts = await _family_contacts(eid)
    roster = ", ".join(f"{c['name']} ({c['relation']})" for c in contacts) or "nobody yet"
    parsed = {"reply": "", "intent": "answer", "name": None, "medicine": None, "dose": None,
              "time": None, "med_type": None, "per_day": None, "message": None, "details": None,
              "who": None}
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY, session_id=f"agent-{uuid.uuid4()}",
            system_message=AGENT_SYS + f" Her connected contacts are: {roster}.",
        ).with_model(*AGENT_MODEL)
        raw = str(await chat.send_message(UserMessage(text=message)))
        mm = re.search(r"\{.*\}", raw, re.S)
        if mm:
            got = json.loads(mm.group(0))
            parsed.update({k: got.get(k, parsed[k]) for k in parsed})
    except Exception:
        logger.exception("agent llm failed")

    intent = parsed.get("intent") or "answer"
    reply = (parsed.get("reply") or "").strip()
    wanted = (parsed.get("name") or "").strip().lower()
    contact = next((c for c in contacts if c["name"].lower() == wanted), None)
    action = None
    executed = None

    # Anything addressed to a person needs a real person to address.
    if intent in {"call", "notify", "voice_note"} and not contact:
        if not contacts:
            return {
                "reply": "Nobody is connected to your account yet. Share your family code from your Profile and they can join.",
                "action": {"type": "invite"}, "executed": None, "intent": "answer",
            }
        return {
            "reply": f"I'm not sure who you mean. You can reach {roster}.",
            "action": None, "executed": None, "intent": "answer",
        }

    if intent == "call":
        action = {"type": "call", "target": contact["id"], "target_name": contact["name"], "confirm": True}
        if not reply:
            reply = f"Shall I call {contact['name']}? Tap Yes to confirm."
    elif intent == "sos":
        action = {"type": "sos", "confirm": True}
        if not reply:
            reply = "Do you need emergency help? Tap Yes and I'll alert your family."
    elif intent == "notify":
        msg = parsed.get("message") or f"Hello from {elder.get('name', 'your parent')}!"
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()), "elder_id": eid, "to": "family", "to_user_id": contact["id"],
            "message": msg, "from_role": "elder", "kind": "message",
            "at": datetime.now(timezone.utc).isoformat(), "read": False,
        })
        executed = f"Message sent to {contact['name']}"
        if not reply:
            reply = f"I've sent your message to {contact['name']}."
    elif intent == "voice_note":
        action = {"type": "voice_note", "target": contact["id"], "target_name": contact["name"]}
        if not reply:
            reply = f"Sure. Record your voice note for {contact['name']} now."
    elif intent == "add_medicine":
        name = (parsed.get("medicine") or "").strip()
        if name:
            mtype = parsed.get("med_type") if parsed.get("med_type") in MED_IMAGES else "tablet"
            try:
                per_day = int(parsed.get("per_day") or 1)
            except Exception:
                per_day = 1
            m = {
                "id": str(uuid.uuid4()), "elder_id": eid, "name": name[:60],
                "dose": (parsed.get("dose") or "").strip()[:40],
                "time": (parsed.get("time") or "8:00 AM").strip()[:20],
                "type": mtype, "per_day": max(per_day, 1), "stock": 30,
                "image": MED_IMAGES.get(mtype, MED_IMAGES["tablet"]),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.medicines.insert_one(m.copy())
            executed = f"Added {name} to your medicines"
            if not reply:
                reply = f"I've added {name} to your medicines at {m['time']}."
        else:
            reply = reply or "What is the name of the medicine you'd like to add?"
    elif intent == "mark_medicine":
        wanted_med = (parsed.get("medicine") or "").lower().strip()
        meds = await db.medicines.find({"elder_id": eid}, {"_id": 0}).to_list(100)
        taken = await _taken_ids(eid, elder_day(elder))
        target_med = None
        if wanted_med:
            target_med = next((m for m in meds if wanted_med in m["name"].lower() or m["name"].lower() in wanted_med), None)
        if not target_med:
            target_med = next((m for m in meds if m["id"] not in taken), None)
        if not meds:
            reply = reply or "You haven't added any medicines yet. Scan a prescription and I'll keep track for you."
        elif target_med and target_med["id"] in taken:
            reply = reply or f"Your {target_med['name']} is already marked as taken today."
        elif target_med:
            updated = await _set_intake(elder, target_med, True)
            await _maybe_reorder_task(eid, updated, _med_view(updated, True))
            executed = f"Marked {target_med['name']} as taken"
            if not reply:
                reply = f"Well done. I've marked your {target_med['name']} as taken."
        else:
            reply = reply or "All your medicines are already marked as taken. Great job!"
    elif intent in {"order_medicine", "book_doctor", "arrange_transport"}:
        kind, title, fallback_detail = {
            "order_medicine": ("reorder", "Reorder medicine", "Please arrange a medicine refill."),
            "book_doctor": ("doctor", "Book a doctor", "Please book a doctor consultation."),
            "arrange_transport": ("transport", "Arrange transport", "Please arrange transport."),
        }[intent]
        task = await _create_task(eid, kind, title, parsed.get("details") or fallback_detail)
        who = parsed.get("who") if parsed.get("who") in ASSIGNEES else None

        if who:
            # She already said who should do it, so don't ask again.
            out = await _apply_assignment(elder, task, who)
            executed = out["executed"]
            if not reply or who:
                reply = out["reply"]
        else:
            action = {"type": "choose_assignee", "task_id": task["id"], "title": title,
                      "has_family": bool(contacts)}
            reply = reply or (
                f"I can arrange {title.lower()}. Would you like your family to do it, or shall I?"
                if contacts else
                f"I can arrange {title.lower()} for you. Shall I go ahead?"
            )
    elif intent == "im_okay":
        await db.events.insert_one({
            "id": str(uuid.uuid4()), "elder_id": eid, "type": "im_okay",
            "at": datetime.now(timezone.utc).isoformat(),
        })
        reached = await _alert_family(eid, "im_okay", f"{elder.get('name', 'Your parent')} let you know they are doing well.")
        executed = f"Told {plural(len(reached), 'family member')} you're well" if reached else None
        if not reply:
            reply = (
                "I've let your family know you are doing well." if reached
                else "Nobody is connected to your account yet, so I couldn't tell anyone. Share your family code from your Profile."
            )
    else:
        if not reply:
            reply = "I'm here to help. You can ask me to mark medicines, arrange a refill, or reach your family."

    return {"reply": reply, "action": action, "executed": executed, "intent": intent}


class AgentTextIn(BaseModel):
    message: str

@api.post("/agent/text")
async def agent_text(b: AgentTextIn, u: dict = Depends(require_role("elder"))):
    msg = b.message.strip()
    if not msg:
        raise HTTPException(400, "Message cannot be empty")
    out = await _run_agent(u, msg)
    return {"transcript": msg, **out}


@api.post("/agent/voice")
async def agent_voice(file: UploadFile = File(...), u: dict = Depends(require_role("elder"))):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "AI not configured")
    audio = await file.read()
    if not audio:
        raise HTTPException(400, "Empty audio")
    ext = _audio_ext(file.filename)
    try:
        transcript = await _transcribe_audio(audio, ext)
    except Exception as e:
        logger.exception("agent transcription failed")
        raise HTTPException(502, f"Could not understand audio: {e}")
    if not transcript:
        raise HTTPException(422, "No speech detected. Please try again.")
    out = await _run_agent(u, transcript)
    return {"transcript": transcript, **out}


# ============================ MEDICINE EXPLAINER ============================
# Elders routinely take medicines nobody has explained to them. This answers
# "what is this for?" in plain language — and is careful to stay a general
# explanation, never advice about their own dose.
EXPLAIN_SYS = (
    "You explain a medicine to an adult in India aged 60-80 who is not medically trained. "
    "Return ONLY JSON: {"
    "\"what_for\": one plain sentence on what this kind of medicine is generally used for, "
    "\"how_to_take\": one plain sentence of general good practice (with food, with water, same time daily), "
    "\"watch_for\": one plain sentence on common, mild side effects to mention to a doctor, "
    "\"unknown\": true only if you do not recognise the medicine}. "
    "Use short, warm, everyday words. No medical jargon, no emojis, no lists. "
    "Never tell them to change, stop or adjust a dose. Never diagnose."
)


@api.post("/health/medicines/{med_id}/explain")
async def explain_medicine(med_id: str, u: dict = Depends(current_user)):
    """A plain-language explanation of one of the elder's own medicines."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "AI not configured")
    eid = await elder_id_for(u)
    m = await db.medicines.find_one({"id": med_id, "elder_id": eid}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Medicine not found")

    cached = await db.medicine_explainers.find_one({"key": m["name"].strip().lower()}, {"_id": 0})
    if cached:
        return {**cached["explainer"], "name": m["name"], "cached": True}

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY, session_id=f"explain-{uuid.uuid4()}",
            system_message=EXPLAIN_SYS,
        ).with_model(*GEMINI)
        raw = str(await chat.send_message(UserMessage(
            text=f"Medicine: {m['name']}. Dose written on it: {m.get('dose') or 'not stated'}. Form: {m.get('type')}."
        )))
        mm = re.search(r"\{.*\}", raw, re.S)
        parsed = json.loads(mm.group(0)) if mm else {}
    except Exception as e:
        logger.exception("medicine explainer failed")
        raise HTTPException(502, f"Could not look that up right now: {e}")

    what_for = str(parsed.get("what_for") or "").strip()
    explainer = {
        "what_for": what_for,
        "how_to_take": str(parsed.get("how_to_take") or "").strip(),
        "watch_for": str(parsed.get("watch_for") or "").strip(),
        # An unparseable or empty answer is "we don't know", never a blank card.
        "unknown": bool(parsed.get("unknown")) or not what_for,
        # Shown verbatim in the app. The explanation is general, not personal advice.
        "disclaimer": "This is general information, not medical advice. Always follow what your doctor told you.",
    }
    if not explainer["unknown"] and explainer["what_for"]:
        await db.medicine_explainers.insert_one({
            "key": m["name"].strip().lower(), "explainer": explainer,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    return {**explainer, "name": m["name"], "cached": False}


# ============================ WEEKLY FAMILY SUMMARY ============================
# The family dashboard is a wall of numbers. This turns the week into two or
# three warm sentences an adult child can read in five seconds.
SUMMARY_SYS = (
    "You write a short weekly note for an adult child about how their elderly parent in India is doing. "
    "You are given real figures. Use ONLY those figures — never invent an event, a symptom or a mood. "
    "Return ONLY JSON: {"
    "\"headline\": four to seven words summing up the week, "
    "\"body\": two or three warm, plain sentences about what the figures show, "
    "\"suggestion\": one kind, practical suggestion for the child, or null if nothing is needed}. "
    "Be reassuring when things are going well and matter-of-fact when they are not. "
    "Do not give medical advice. No emojis."
)


@api.get("/child/weekly-summary")
async def weekly_summary(u: dict = Depends(require_role("child"))):
    """A plain-language read on the parent's week, grounded in real figures."""
    eid = u.get("elder_id")
    elder = await db.users.find_one({"id": eid}, {"_id": 0})
    if not elder:
        raise HTTPException(404, "Parent account not found")

    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    med_views = await _med_views(elder)
    steps = await _step_week(elder, 7)
    intakes = await db.intakes.count_documents({"elder_id": eid, "taken_at": {"$gte": since}})
    missed = await db.notifications.count_documents(
        {"elder_id": eid, "kind": "missed_dose", "at": {"$gte": since}}
    )
    acts = await db.activity.count_documents({"elder_id": eid, "at": {"$gte": since}})
    tasks_done = await db.tasks.count_documents({"elder_id": eid, "status": "done"})

    facts = {
        "parent_first_name": (elder.get("name") or "Your parent").split(" ")[0],
        "medicines_tracked": len(med_views),
        "doses_confirmed_this_week": intakes,
        "doses_missed_this_week": missed,
        "medicines_running_low": [m["name"] for m in med_views if m["low"]],
        "steps_this_week": steps["total"],
        "average_steps_per_active_day": steps["average"],
        "days_they_walked": steps["days_active"],
        "days_they_met_their_step_goal": steps["goal_days"],
        "step_goal": steps["goal"],
        "times_they_opened_the_app": acts,
        "requests_completed": tasks_done,
    }

    fallback = {
        "headline": f"{facts['parent_first_name']}'s week",
        "body": (
            f"{facts['doses_confirmed_this_week']} doses confirmed and "
            f"{facts['doses_missed_this_week']} missed. "
            f"{plural(facts['steps_this_week'], 'step')} walked across {plural(facts['days_they_walked'], 'day')}."
        ),
        "suggestion": None,
    }
    if not EMERGENT_LLM_KEY:
        return {**fallback, "facts": facts, "generated": False}

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY, session_id=f"summary-{uuid.uuid4()}",
            system_message=SUMMARY_SYS,
        ).with_model(*GEMINI)
        raw = str(await chat.send_message(UserMessage(text=json.dumps(facts))))
        mm = re.search(r"\{.*\}", raw, re.S)
        parsed = json.loads(mm.group(0)) if mm else {}
        return {
            "headline": str(parsed.get("headline") or fallback["headline"]).strip(),
            "body": str(parsed.get("body") or fallback["body"]).strip(),
            "suggestion": (str(parsed["suggestion"]).strip() if parsed.get("suggestion") else None),
            "facts": facts,
            "generated": True,
        }
    except Exception:
        logger.exception("weekly summary failed")
        return {**fallback, "facts": facts, "generated": False}


# ============================ SPOKEN CONFIRMATION ============================
YES_WORDS = {"yes", "yeah", "yep", "yes please", "ok", "okay", "sure", "do it", "go ahead",
             "please do", "correct", "right", "haan", "ha", "ji", "haan ji", "theek hai", "kar do"}
NO_WORDS = {"no", "nope", "not now", "cancel", "stop", "don't", "do not", "nahi", "nahin",
            "mat karo", "rehne do", "wait"}


def _classify_yes_no(text: str) -> Optional[bool]:
    """True for yes, False for no, None when it isn't a clear answer.

    Deliberately conservative: an ambiguous reply must not be read as consent
    for something as consequential as an emergency alert.
    """
    t = re.sub(r"[^a-z\s]", "", (text or "").lower()).strip()
    if not t:
        return None
    if t in YES_WORDS:
        return True
    if t in NO_WORDS:
        return False
    words = set(t.split())
    hit_yes = bool(words & {w for w in YES_WORDS if " " not in w}) or any(p in t for p in YES_WORDS if " " in p)
    hit_no = bool(words & {w for w in NO_WORDS if " " not in w}) or any(p in t for p in NO_WORDS if " " in p)
    if hit_yes and not hit_no:
        return True
    if hit_no and not hit_yes:
        return False
    return None


@api.post("/agent/confirm")
async def agent_confirm(file: UploadFile = File(...), u: dict = Depends(require_role("elder"))):
    """Transcribe a short spoken reply and say whether it was a clear yes or no."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "AI not configured")
    audio = await file.read()
    if not audio:
        raise HTTPException(400, "Empty audio")
    ext = _audio_ext(file.filename)
    try:
        transcript = await _transcribe_audio(audio, ext)
    except Exception as e:
        logger.exception("confirm transcription failed")
        raise HTTPException(502, f"Could not understand audio: {e}")
    answer = _classify_yes_no(transcript)
    return {"transcript": transcript, "answer": answer}


# ============================ SUNSHINE SPEAKS BACK ============================
async def _synthesize(text: str) -> bytes:
    """Render a reply as speech.

    The Emergent TTS client's exact method name isn't pinned by this repo, so we
    try the plausible ones in turn and use whichever the installed wheel exposes.
    """
    tts = OpenAITextToSpeech(api_key=EMERGENT_LLM_KEY)
    last_error = None
    for name in ("generate_speech", "synthesize", "speak", "create", "generate", "text_to_speech"):
        fn = getattr(tts, name, None)
        if not callable(fn):
            continue
        try:
            out = fn(text=text, model=TTS_MODEL, voice=TTS_VOICE)
            if hasattr(out, "__await__"):
                out = await out
            if isinstance(out, (bytes, bytearray)):
                return bytes(out)
            for attr in ("content", "audio", "data", "audio_content"):
                blob = getattr(out, attr, None)
                if isinstance(blob, (bytes, bytearray)):
                    return bytes(blob)
            if isinstance(out, str):
                return base64.b64decode(out)
        except Exception as e:  # try the next candidate name
            last_error = e
            logger.warning("TTS via %s() failed: %s", name, e)
    raise RuntimeError(f"No usable text-to-speech method on the client ({last_error})")


class SpeakIn(BaseModel):
    text: str


@api.post("/agent/speak")
async def agent_speak(b: SpeakIn, u: dict = Depends(current_user)):
    """Synthesize a reply and hand back a URL the audio player can stream.

    Returning an id rather than raw bytes lets the client play it directly with
    a short-lived media token, instead of buffering audio through JavaScript.
    """
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "AI not configured")
    text = b.text.strip()[:800]
    if not text:
        raise HTTPException(400, "Nothing to say")
    try:
        audio = await _synthesize(text)
    except Exception as e:
        logger.exception("speech synthesis failed")
        raise HTTPException(502, f"Could not generate speech: {e}")

    sid = str(uuid.uuid4())
    await db.speech_cache.insert_one({
        "id": sid, "user_id": u["id"], "audio": audio,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {
        "id": sid,
        "url": f"/api/agent/speech/{sid}",
        "token": make_media_token(u["id"]),
        "bytes": len(audio),
    }


@api.get("/agent/speech/{sid}")
async def agent_speech_audio(
    sid: str,
    token: Optional[str] = Query(None),
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
):
    u = await _user_for_media(token, creds)
    doc = await db.speech_cache.find_one({"id": sid, "user_id": u["id"]})
    if not doc:
        raise HTTPException(404, "That reply is no longer available")
    return Response(content=doc["audio"], media_type="audio/mpeg",
                    headers={"Cache-Control": "private, max-age=600"})


async def _speech_cache_sweep(interval_seconds: int = 1800, keep_minutes: int = 30):
    """Spoken replies are throwaway; don't let them accumulate."""
    while True:
        try:
            cutoff = (datetime.now(timezone.utc) - timedelta(minutes=keep_minutes)).isoformat()
            await db.speech_cache.delete_many({"created_at": {"$lt": cutoff}})
        except Exception:
            logger.exception("speech cache sweep failed")
        await asyncio.sleep(interval_seconds)


# ============================ FAMILY VOICE NOTES ============================
@api.post("/family/voice-notes")
async def send_voice_note(
    file: UploadFile = File(...),
    to_user_id: Optional[str] = Form(None),
    u: dict = Depends(current_user),
):
    """Record a note for someone in the family. Works in both directions:
    the elder picks a family member, a family member's note goes to the elder."""
    eid = await elder_id_for(u)
    if not eid:
        raise HTTPException(404, "No family account linked")
    elder = await db.users.find_one({"id": eid}, {"_id": 0})

    if u["role"] == "elder":
        contacts = await _family_contacts(eid)
        recipient = next((c for c in contacts if c["id"] == to_user_id), None)
        if not recipient:
            raise HTTPException(404, "That family member is not connected to your account")
    else:
        # A child's note always goes to the parent.
        recipient = {"id": eid, "name": (elder or {}).get("name") or "Your parent"}

    audio = await file.read()
    if not audio:
        raise HTTPException(400, "Empty recording")
    if len(audio) > 10 * 1024 * 1024:
        raise HTTPException(413, "That recording is too long. Please keep it under a minute.")

    ext = _audio_ext(file.filename)
    nid = str(uuid.uuid4())
    storage_path = f"{APP_NAME}/voice-notes/{u['id']}/{nid}.{ext}"
    try:
        await run_in_threadpool(put_object, storage_path, audio, AUDIO_TYPES.get(ext, "audio/m4a"))
    except Exception as e:
        logger.exception("voice note upload failed")
        raise HTTPException(502, f"Could not save your voice note: {e}")

    doc = {
        "id": nid, "elder_id": eid, "from_user_id": u["id"], "from_name": u.get("name"),
        "from_role": u["role"], "to_user_id": recipient["id"], "to_name": recipient["name"],
        "storage_path": storage_path, "ext": ext, "bytes": len(audio),
        "created_at": datetime.now(timezone.utc).isoformat(), "played_at": None, "deleted": False,
    }
    await db.voice_notes.insert_one(doc.copy())

    who = u.get("name") or "Someone in your family"
    await notify_users(
        eid, [recipient["id"]], "voice_note", "A new voice note",
        f"{who} sent you a voice note.", {"voice_note_id": nid},
    )
    return {"id": nid, "to_name": recipient["name"], "delivered": True}


# ============================ NOTIFICATION INBOX ============================
@api.get("/notifications")
async def list_notifications(unread_only: bool = False, u: dict = Depends(current_user)):
    """Everything addressed to this user, newest first."""
    eid = await elder_id_for(u)
    q: dict = {"elder_id": eid, "to_user_id": u["id"]}
    if unread_only:
        q["read"] = False
    rows = await db.notifications.find(q, {"_id": 0}).sort("at", -1).to_list(100)
    unread = await db.notifications.count_documents({"elder_id": eid, "to_user_id": u["id"], "read": False})
    return {"items": rows, "unread": unread}


@api.post("/notifications/{nid}/read")
async def mark_notification_read(nid: str, u: dict = Depends(current_user)):
    r = await db.notifications.update_one({"id": nid, "to_user_id": u["id"]}, {"$set": {"read": True}})
    if not r.matched_count:
        raise HTTPException(404, "Notification not found")
    return {"ok": True}


@api.post("/notifications/read-all")
async def mark_all_read(u: dict = Depends(current_user)):
    r = await db.notifications.update_many({"to_user_id": u["id"], "read": False}, {"$set": {"read": True}})
    return {"ok": True, "marked": r.modified_count}


# ============================ QUICK MESSAGES ============================
# Typing is the hardest thing we ask of an 71-year-old, and most of what families
# send each other is the same handful of sentences. So the keyboard is optional:
# one tap sends a whole message. The wording differs by who is speaking — a
# parent asks "when will you visit", a daughter asks "did you take your medicine".

QUICK_MESSAGES = {
    "elder": [
        {"id": "free", "text": "Are you free?", "icon": "time", "group": "asking"},
        {"id": "call_me", "text": "Please call me", "icon": "call", "group": "asking"},
        {"id": "text_later", "text": "Text me when you are free", "icon": "chatbubble", "group": "asking"},
        {"id": "ate", "text": "Have you eaten?", "icon": "restaurant", "group": "caring"},
        {"id": "sleeping", "text": "Are you sleeping?", "icon": "moon", "group": "caring"},
        {"id": "reached", "text": "Did you reach safely?", "icon": "location", "group": "caring"},
        {"id": "missing", "text": "Missing you", "icon": "heart", "group": "warmth"},
        {"id": "im_good", "text": "I am doing well, do not worry", "icon": "sunny", "group": "warmth"},
        {"id": "visit", "text": "Come and see me when you can", "icon": "home", "group": "warmth"},
        {"id": "blessings", "text": "God bless you", "icon": "flower", "group": "warmth"},
        {"id": "photo_please", "text": "Send me a photo", "icon": "image", "group": "asking"},
    ],
    "child": [
        {"id": "free", "text": "Are you free?", "icon": "time", "group": "asking"},
        {"id": "call_me", "text": "Call me when you can", "icon": "call", "group": "asking"},
        {"id": "text_later", "text": "Text me when you are free", "icon": "chatbubble", "group": "asking"},
        {"id": "ate", "text": "Have you eaten?", "icon": "restaurant", "group": "caring"},
        {"id": "medicine", "text": "Did you take your medicine?", "icon": "medkit", "group": "caring"},
        {"id": "sleeping", "text": "Are you sleeping?", "icon": "moon", "group": "caring"},
        {"id": "walk", "text": "Did you go for your walk?", "icon": "walk", "group": "caring"},
        {"id": "missing", "text": "Missing you", "icon": "heart", "group": "warmth"},
        {"id": "im_good", "text": "I am doing well, do not worry", "icon": "sunny", "group": "warmth"},
        {"id": "call_tonight", "text": "I will call you tonight", "icon": "moon", "group": "warmth"},
        {"id": "photo_please", "text": "Send me a photo", "icon": "image", "group": "asking"},
    ],
}

MESSAGE_GROUPS = [
    {"id": "asking", "label": "Quick asks"},
    {"id": "caring", "label": "Checking in"},
    {"id": "warmth", "label": "Just because"},
]


async def _member_or_404(u: dict, member_id: str) -> dict:
    """Resolve the other side of a conversation, in either direction."""
    eid = await elder_id_for(u)
    if not eid:
        raise HTTPException(404, "No family account linked")
    if u["role"] == "elder":
        other = next((c for c in await _family_contacts(eid) if c["id"] == member_id), None)
        if not other:
            raise HTTPException(404, "That family member is not connected to your account")
        return other
    # A family member only ever talks to the parent they are connected to.
    elder = await db.users.find_one({"id": eid}, {"_id": 0})
    if not elder or member_id not in {eid, ""}:
        raise HTTPException(404, "That family member is not connected to your account")
    return {"id": elder["id"], "name": elder.get("name") or "Your parent",
            "relation": "Parent", "photo_url": elder.get("photo_url")}


@api.get("/family/quick-messages")
async def quick_messages(u: dict = Depends(current_user)):
    """The one-tap phrases this person would plausibly send."""
    return {"groups": MESSAGE_GROUPS, "messages": QUICK_MESSAGES.get(u["role"], [])}


class MessageIn(BaseModel):
    to_user_id: str
    template_id: Optional[str] = None
    text: Optional[str] = None


@api.post("/family/messages")
async def send_message(b: MessageIn, u: dict = Depends(current_user)):
    """Send a quick message. A template id is resolved server-side so both apps
    always agree on the wording; free text is accepted for anything else."""
    eid = await elder_id_for(u)
    other = await _member_or_404(u, b.to_user_id)

    text = (b.text or "").strip()
    if b.template_id:
        tpl = next((t for t in QUICK_MESSAGES.get(u["role"], []) if t["id"] == b.template_id), None)
        if not tpl:
            raise HTTPException(422, "Unknown message")
        text = tpl["text"]
    if not text:
        raise HTTPException(422, "Please choose or write a message")
    text = text[:300]

    now = datetime.now(timezone.utc).isoformat()
    msg = {
        "id": str(uuid.uuid4()), "elder_id": eid,
        "from_user_id": u["id"], "from_name": u.get("name") or "",
        "from_role": u["role"],
        "to_user_id": other["id"], "to_name": other["name"],
        "text": text, "template_id": b.template_id, "at": now, "read": False,
    }
    await db.messages.insert_one(msg.copy())
    await notify_users(eid, [other["id"]], "message",
                       f"{(u.get('name') or 'Family').split(' ')[0]} says",
                       text, {"from_user_id": u["id"]})
    msg.pop("_id", None)
    return {**msg, "mine": True}


@api.get("/family/messages")
async def list_messages(member_id: str = Query(...), u: dict = Depends(current_user)):
    """The conversation with one person, oldest first — how a thread reads."""
    eid = await elder_id_for(u)
    other = await _member_or_404(u, member_id)
    rows = await db.messages.find({
        "elder_id": eid,
        "$or": [
            {"from_user_id": u["id"], "to_user_id": other["id"]},
            {"from_user_id": other["id"], "to_user_id": u["id"]},
        ],
    }, {"_id": 0}).sort("at", 1).to_list(200)
    unread = sum(1 for r in rows if r["to_user_id"] == u["id"] and not r.get("read"))
    return {
        "member": other,
        "messages": [{**r, "mine": r["from_user_id"] == u["id"]} for r in rows],
        "unread": unread,
    }


@api.post("/family/messages/read")
async def mark_messages_read(member_id: str = Query(...), u: dict = Depends(current_user)):
    other = await _member_or_404(u, member_id)
    r = await db.messages.update_many(
        {"from_user_id": other["id"], "to_user_id": u["id"], "read": False},
        {"$set": {"read": True}},
    )
    return {"ok": True, "marked": r.modified_count}


# ============================ DEVICES FOR PUSH ============================
class DeviceIn(BaseModel):
    token: str
    platform: str = "unknown"
    device_name: str = ""


@api.post("/devices/register")
async def register_device(b: DeviceIn, u: dict = Depends(current_user)):
    """Claim a phone for this account.

    Keyed on the token rather than the user, because a shared handset must stop
    pushing to whoever signed out of it — re-registering moves the device across
    and clears any earlier rejection.
    """
    token = (b.token or "").strip()
    if not _is_expo_token(token):
        raise HTTPException(422, "That is not an Expo push token")
    eid = await elder_id_for(u)
    now = datetime.now(timezone.utc).isoformat()
    await db.devices.update_one(
        {"token": token},
        {
            "$set": {
                "token": token, "user_id": u["id"], "elder_id": eid,
                "platform": b.platform[:20], "device_name": b.device_name[:80],
                "last_seen": now, "disabled": False,
            },
            "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now},
            "$unset": {"disabled_reason": "", "disabled_at": ""},
        },
        upsert=True,
    )
    count = await db.devices.count_documents({"user_id": u["id"], "disabled": {"$ne": True}})
    return {"ok": True, "devices": count}


@api.post("/devices/unregister")
async def unregister_device(b: DeviceIn, u: dict = Depends(current_user)):
    """Called on sign-out, so a handed-back phone stops receiving someone's alerts."""
    r = await db.devices.delete_one({"token": (b.token or "").strip(), "user_id": u["id"]})
    return {"ok": True, "removed": r.deleted_count}


@api.get("/devices")
async def list_devices(u: dict = Depends(current_user)):
    """What the profile screen shows: which phones will actually ring."""
    rows = await db.devices.find(
        {"user_id": u["id"], "disabled": {"$ne": True}},
        {"_id": 0, "token": 0},
    ).sort("last_seen", -1).to_list(20)
    return {"devices": rows, "push_configured": PUSH_ENABLED}


@api.post("/devices/test")
async def send_test_push(u: dict = Depends(current_user)):
    """Prove it works from the phone in your hand rather than by waiting for an
    emergency. Sends only to the caller's own devices."""
    devices = await _devices_for([u["id"]])
    if not devices:
        raise HTTPException(400, "No phone is registered for alerts yet")
    res = await push_to_users(
        [u["id"]], "test", "Sunshine alerts are on",
        "This is what an alert from Sunshine looks like.", {"test": True},
    )
    return {"ok": res["sent"] > 0, **res}


# ============================ SHARED PHOTOS ============================
IMAGE_EXTS = {"jpg", "jpeg", "png", "heic", "webp"}
IMAGE_TYPES = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
               "heic": "image/heic", "webp": "image/webp"}


def _image_ext(filename: Optional[str], default: str = "jpg") -> str:
    if filename and "." in filename:
        e = filename.rsplit(".", 1)[-1].lower()
        if e in IMAGE_EXTS:
            return e
    return default


@api.post("/family/photos")
async def share_photo(
    file: UploadFile = File(...),
    caption: Optional[str] = Form(None),
    u: dict = Depends(current_user),
):
    """Share a photo with the rest of the family. Works in both directions."""
    eid = await elder_id_for(u)
    if not eid:
        raise HTTPException(404, "No family account linked")
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty image")
    if len(data) > 12 * 1024 * 1024:
        raise HTTPException(413, "That photo is too large. Please choose a smaller one.")

    ext = _image_ext(file.filename)
    pid = str(uuid.uuid4())
    storage_path = f"{APP_NAME}/photos/{eid}/{pid}.{ext}"
    try:
        await run_in_threadpool(put_object, storage_path, data, IMAGE_TYPES.get(ext, "image/jpeg"))
    except Exception as e:
        logger.exception("photo upload failed")
        raise HTTPException(502, f"Could not save the photo: {e}")

    doc = {
        "id": pid, "elder_id": eid, "from_user_id": u["id"], "from_name": u.get("name"),
        "from_role": u["role"], "caption": (caption or "").strip()[:200],
        "storage_path": storage_path, "ext": ext,
        "created_at": datetime.now(timezone.utc).isoformat(), "deleted": False,
        "seen_by": [],
    }
    await db.photos.insert_one(doc.copy())

    who = u.get("name") or ("Your parent" if u["role"] == "elder" else "Your family")
    caption_line = f" — “{doc['caption']}”" if doc["caption"] else ""
    if u["role"] == "elder":
        await notify_family(eid, "photo", "A new photo", f"{who} shared a photo with you{caption_line}.", {"photo_id": pid})
    else:
        await notify_elder(eid, "photo", "A new photo", f"{who} shared a photo with you{caption_line}.", {"photo_id": pid})
        # Other family members see it too.
        others = [c["id"] for c in await _family_contacts(eid) if c["id"] != u["id"]]
        await notify_users(eid, others, "photo", "A new photo", f"{who} shared a photo{caption_line}.", {"photo_id": pid})

    return {"id": pid, "caption": doc["caption"], "created_at": doc["created_at"]}


@api.get("/family/photos")
async def list_photos(member_id: Optional[str] = None, u: dict = Depends(current_user)):
    """Every photo shared in this family, or just those from one person."""
    eid = await elder_id_for(u)
    q: dict = {"elder_id": eid, "deleted": {"$ne": True}}
    if member_id:
        q["from_user_id"] = member_id
    docs = await db.photos.find(q, {"_id": 0}).sort("created_at", -1).to_list(300)
    return [{**_photo_view(d, u)} for d in docs]


# The whole vocabulary. A short list on purpose: five large targets beat a
# keyboard of emoji for the hands this app is built for.
REACTIONS = ["heart", "thumbs-up", "happy", "pray", "laugh"]


def _reaction_counts(doc: dict) -> dict:
    counts: dict = {}
    for r in (doc.get("reactions") or []):
        counts[r["emoji"]] = counts.get(r["emoji"], 0) + 1
    return counts


def _photo_view(d: dict, u: dict) -> dict:
    reactions = d.get("reactions") or []
    mine = next((r["emoji"] for r in reactions if r["user_id"] == u["id"]), None)
    return {
        "id": d["id"], "from_user_id": d["from_user_id"], "from_name": d.get("from_name"),
        "from_role": d.get("from_role"), "caption": d.get("caption"),
        # Sample photos point at a hosted image; real uploads stream from storage.
        "external_url": d.get("external_url"), "demo": bool(d.get("demo")),
        "created_at": d["created_at"], "seen": u["id"] in (d.get("seen_by") or []),
        "reactions": _reaction_counts(d), "my_reaction": mine,
        "reacted_by": [r.get("name") for r in reactions if r["user_id"] != u["id"]],
    }


class ReactIn(BaseModel):
    emoji: str


@api.post("/family/photos/{pid}/react")
async def react_to_photo(pid: str, b: ReactIn, u: dict = Depends(current_user)):
    """Tapping the same reaction again takes it back, so a mis-tap is undoable.

    One reaction per person per photo: a row of counts stays readable, and it
    keeps the sharer from being notified over and over by the same tap.
    """
    if b.emoji not in REACTIONS:
        raise HTTPException(422, "Not a reaction we know")
    eid = await elder_id_for(u)
    doc = await db.photos.find_one({"id": pid, "elder_id": eid, "deleted": {"$ne": True}})
    if not doc:
        raise HTTPException(404, "Photo not found")

    existing = next((r for r in (doc.get("reactions") or []) if r["user_id"] == u["id"]), None)
    if existing and existing["emoji"] == b.emoji:
        await db.photos.update_one({"id": pid}, {"$pull": {"reactions": {"user_id": u["id"]}}})
        fresh = await db.photos.find_one({"id": pid}, {"_id": 0})
        return {**_photo_view(fresh, u), "removed": True}

    await db.photos.update_one({"id": pid}, {"$pull": {"reactions": {"user_id": u["id"]}}})
    await db.photos.update_one({"id": pid}, {"$push": {"reactions": {
        "user_id": u["id"], "name": u.get("name") or "", "emoji": b.emoji,
        "at": datetime.now(timezone.utc).isoformat(),
    }}})

    # Tell whoever shared it at most once per person, ever. Changing a heart to a
    # smile is not news, and neither is taking one back and putting it again —
    # without this an indecisive tap fills their inbox.
    told = doc.get("reaction_notified") or []
    if doc["from_user_id"] != u["id"] and u["id"] not in told:
        await db.photos.update_one({"id": pid}, {"$addToSet": {"reaction_notified": u["id"]}})
        who = (u.get("name") or "Someone").split(" ")[0]
        caption = doc.get("caption")
        await notify_users(
            eid, [doc["from_user_id"]], "reaction", f"{who} liked your photo",
            f"{who} reacted to \"{caption}\"." if caption else f"{who} reacted to your photo.",
            {"photo_id": pid, "emoji": b.emoji},
        )

    fresh = await db.photos.find_one({"id": pid}, {"_id": 0})
    return {**_photo_view(fresh, u), "removed": False}


@api.get("/family/photos/{pid}/image")
async def photo_image(
    pid: str,
    token: Optional[str] = Query(None),
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
):
    u = await _user_for_media(token, creds)
    eid = await elder_id_for(u)
    doc = await db.photos.find_one({"id": pid, "elder_id": eid, "deleted": {"$ne": True}})
    if not doc:
        raise HTTPException(404, "Photo not found")
    if doc.get("external_url") and not doc.get("storage_path"):
        # Sample content lives on a public URL rather than in our storage.
        return Response(status_code=307, headers={"Location": doc["external_url"]})
    try:
        content, ctype = await run_in_threadpool(get_object, doc["storage_path"])
    except Exception:
        raise HTTPException(404, "Photo not available")
    if u["id"] not in (doc.get("seen_by") or []):
        await db.photos.update_one({"id": pid}, {"$addToSet": {"seen_by": u["id"]}})
    return Response(content=content, media_type=ctype or IMAGE_TYPES.get(doc.get("ext", "jpg"), "image/jpeg"))


@api.delete("/family/photos/{pid}")
async def delete_photo(pid: str, u: dict = Depends(current_user)):
    """Only the person who shared it can take it down."""
    eid = await elder_id_for(u)
    doc = await db.photos.find_one({"id": pid, "elder_id": eid, "deleted": {"$ne": True}})
    if not doc:
        raise HTTPException(404, "Photo not found")
    if doc["from_user_id"] != u["id"]:
        raise HTTPException(403, "Only the person who shared this photo can remove it")
    await db.photos.update_one({"id": pid}, {"$set": {"deleted": True}})
    return {"ok": True}


@api.get("/family/voice-notes")
async def list_voice_notes(u: dict = Depends(current_user)):
    """Elders see what they sent; family members see what was sent to them."""
    eid = await elder_id_for(u)
    q = {
        "elder_id": eid, "deleted": {"$ne": True},
        "$or": [{"to_user_id": u["id"]}, {"from_user_id": u["id"]}],
    }
    docs = await db.voice_notes.find(q, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [
        {"id": d["id"], "from_user_id": d.get("from_user_id"), "from_name": d.get("from_name"),
         "to_name": d.get("to_name"), "mine": d.get("from_user_id") == u["id"],
         "created_at": d["created_at"], "played_at": d.get("played_at")}
        for d in docs
    ]


@api.get("/family/voice-notes/{nid}/audio")
async def voice_note_audio(
    nid: str,
    token: Optional[str] = Query(None),
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
):
    u = await _user_for_media(token, creds)
    eid = await elder_id_for(u)
    doc = await db.voice_notes.find_one({
        "id": nid, "elder_id": eid, "deleted": {"$ne": True},
        "$or": [{"to_user_id": u["id"]}, {"from_user_id": u["id"]}],
    })
    if not doc:
        raise HTTPException(404, "Voice note not found")
    try:
        content, ctype = await run_in_threadpool(get_object, doc["storage_path"])
    except Exception:
        raise HTTPException(404, "Recording not available")
    if doc.get("to_user_id") == u["id"] and not doc.get("played_at"):
        await db.voice_notes.update_one({"id": nid}, {"$set": {"played_at": datetime.now(timezone.utc).isoformat()}})
    return Response(content=content, media_type=ctype or AUDIO_TYPES.get(doc.get("ext", "m4a"), "audio/m4a"))


@api.get("/")
async def root():
    return {"message": "Sunshine API"}


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


_sweep_task: Optional[asyncio.Task] = None
_speech_task: Optional[asyncio.Task] = None
_background_tasks: List[asyncio.Task] = []


@app.on_event("startup")
async def startup():
    global _sweep_task, _speech_task
    try:
        await run_in_threadpool(init_storage)
        logger.info("Object storage initialized")
    except Exception:
        logger.exception("Object storage init failed (will retry on first upload)")
    if os.environ.get("DISABLE_SWEEP") != "1":
        _sweep_task = asyncio.create_task(_missed_dose_sweep())
        _speech_task = asyncio.create_task(_speech_cache_sweep())
        _background_tasks.extend([_sweep_task, _speech_task])
        logger.info("Background sweeps started")


@app.on_event("shutdown")
async def shutdown():
    for t in _background_tasks:
        t.cancel()
    client.close()
