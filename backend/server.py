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
import requests
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Query, Response, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.concurrency import run_in_threadpool
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from pwdlib import PasswordHash

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
from emergentintegrations.llm.openai.speech_to_text import OpenAISpeechToText

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
# 7 days. A stolen phone shouldn't hand over a health record for a month.
JWT_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", "10080"))
# Short-lived, purpose-scoped tokens for streamed prescription images.
IMAGE_TOKEN_MINUTES = 10

# Elders are in India unless they tell us otherwise. Every schedule, greeting and
# day boundary is computed in the elder's own zone, never the server's.
DEFAULT_TZ = "Asia/Kolkata"
EMERGENCY_NUMBER = "112"

# Failed-PIN throttling. A 4-digit PIN is right for this audience; unlimited
# attempts against a 10,000-key space is not.
PIN_MAX_ATTEMPTS = 5
PIN_LOCKOUT_MINUTES = 15

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
        "relation": u.get("relation"),
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
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()), "elder_id": elder["id"], "kind": "missed_dose", "med_id": m["id"],
            "day": day, "to": "family",
            "message": f"{m['name']} ({m['time']}) was not marked as taken.",
            "at": datetime.now(timezone.utc).isoformat(), "read": False,
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
    return [{"id": c["id"], "name": c["name"], "relation": c.get("relation") or "Family", "email": c.get("email")} for c in kids]


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
    return {"access_token": make_token(u["id"], "elder"), "user": public_user(u)}


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
        "id": str(uuid.uuid4()), "elder_id": elder["id"], "kind": "family_joined", "to": "elder",
        "message": f"{u['name']} is now connected to your Sunshine account.",
        "at": datetime.now(timezone.utc).isoformat(), "read": False,
    })
    return {"access_token": make_token(u["id"], "child"), "user": public_user(u)}


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

@api.get("/content")
async def get_content(category: Optional[str] = None):
    if category and category.lower() != "all":
        return [c for c in CONTENT if c["category"].lower() == category.lower()]
    return CONTENT

@api.get("/content/categories")
async def content_categories():
    return CONTENT_CATEGORIES


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


def make_image_token(uid: str) -> str:
    """A narrow, short-lived token. A leaked image URL can't be replayed as a session."""
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": uid, "scope": "prescription_image", "iat": now,
         "exp": now + timedelta(minutes=IMAGE_TOKEN_MINUTES)},
        JWT_SECRET, algorithm=JWT_ALG,
    )


@api.post("/prescriptions/image-token")
async def prescription_image_token(u: dict = Depends(current_user)):
    return {"token": make_image_token(u["id"]), "expires_in": IMAGE_TOKEN_MINUTES * 60}


@api.get("/prescriptions/{pid}/image")
async def prescription_image(
    pid: str,
    token: Optional[str] = Query(None),
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
):
    """Prefer the Authorization header; fall back to a scoped image token for
    clients that can't set headers on an image request."""
    if creds:
        u = await current_user(creds)
    elif token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        except Exception:
            raise HTTPException(401, "Invalid token")
        if payload.get("scope") != "prescription_image":
            raise HTTPException(403, "This token cannot be used for images")
        u = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0})
        if not u:
            raise HTTPException(401, "User not found")
    else:
        raise HTTPException(401, "Not authenticated")

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
async def concierge_request(b: ConciergeIn, u: dict = Depends(require_role("elder"))):
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
    task = await _create_task(u["id"], kind if kind in {"reorder", "doctor", "transport", "other"} else "other", title, detail)
    return task


@api.get("/concierge/tasks")
async def list_tasks(u: dict = Depends(current_user)):
    eid = await elder_id_for(u)
    tasks = await db.tasks.find({"elder_id": eid}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return tasks


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
async def _alert_family(elder_id: str, kind: str, message: str) -> List[dict]:
    """Write one notification per really-connected family member. Returns who got it."""
    contacts = await _family_contacts(elder_id)
    now = datetime.now(timezone.utc).isoformat()
    for c in contacts:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()), "elder_id": elder_id, "kind": kind,
            "to": "family", "to_user_id": c["id"], "message": message,
            "at": now, "read": False,
        })
    return contacts


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
              "time": None, "med_type": None, "per_day": None, "message": None, "details": None}
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
    elif intent == "order_medicine":
        await _create_task(eid, "reorder", "Reorder medicine", parsed.get("details") or "Please arrange a medicine refill.")
        executed = "Reorder request sent to your family"
        if not reply:
            reply = "I've asked your family to arrange a medicine refill."
    elif intent == "book_doctor":
        await _create_task(eid, "doctor", "Book a doctor", parsed.get("details") or "Please book a doctor consultation.")
        executed = "Doctor booking request sent to your family"
        if not reply:
            reply = "I've requested a doctor consultation for you."
    elif intent == "arrange_transport":
        await _create_task(eid, "transport", "Arrange transport", parsed.get("details") or "Please arrange transport.")
        executed = "Transport request sent to your family"
        if not reply:
            reply = "I've asked your family to arrange transport for you."
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
    ext = "m4a"
    if file.filename and "." in file.filename:
        e = file.filename.rsplit(".", 1)[-1].lower()
        if e in {"mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"}:
            ext = e
    try:
        transcript = await _transcribe_audio(audio, ext)
    except Exception as e:
        logger.exception("agent transcription failed")
        raise HTTPException(502, f"Could not understand audio: {e}")
    if not transcript:
        raise HTTPException(422, "No speech detected. Please try again.")
    out = await _run_agent(u, transcript)
    return {"transcript": transcript, **out}


@api.get("/")
async def root():
    return {"message": "Sunshine API"}


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


_sweep_task: Optional[asyncio.Task] = None


@app.on_event("startup")
async def startup():
    global _sweep_task
    try:
        await run_in_threadpool(init_storage)
        logger.info("Object storage initialized")
    except Exception:
        logger.exception("Object storage init failed (will retry on first upload)")
    if os.environ.get("DISABLE_SWEEP") != "1":
        _sweep_task = asyncio.create_task(_missed_dose_sweep())
        logger.info("Missed-dose sweep started")


@app.on_event("shutdown")
async def shutdown():
    if _sweep_task:
        _sweep_task.cancel()
    client.close()
