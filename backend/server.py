import os
import io
import re
import json
import uuid
import base64
import secrets
import logging
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Literal

import jwt
from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from pwdlib import PasswordHash

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
JWT_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", "43200"))

GEMINI = ("gemini", "gemini-3.1-pro-preview")
OPENAI_MINI = ("openai", "gpt-5.4-mini")

pwd = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)

app = FastAPI()
api = APIRouter(prefix="/api")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sunshine")

# ============================ AUTH ============================
class ElderSignup(BaseModel):
    name: str
    phone: str
    pin: str = Field(min_length=4, max_length=4)

class ElderLogin(BaseModel):
    phone: str
    pin: str

class ChildSignup(BaseModel):
    name: str
    email: str
    password: str = Field(min_length=6)
    family_code: str

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
        "location": u.get("location"),
    }


async def current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> dict:
    if not creds:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
        u = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0})
    except Exception:
        raise HTTPException(401, "Invalid token")
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
        "family_code": new_family_code(), "location": "Bengaluru, Karnataka",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(u.copy())
    await _seed_elder_data(u["id"])
    return {"access_token": make_token(u["id"], "elder"), "user": public_user(u)}


@api.post("/auth/elder/login")
async def elder_login(b: ElderLogin):
    u = await db.users.find_one({"role": "elder", "phone": norm_phone(b.phone)})
    if not u or not pwd.verify(b.pin, u["secret_hash"]):
        raise HTTPException(401, "Wrong phone number or PIN")
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
        "elder_id": elder["id"], "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(u.copy())
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
FAMILY_STORIES = [
    {"id": "f1", "name": "Priya", "relation": "Daughter", "avatar": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300&q=80", "kind": "photo", "preview": "Shared a new photo from Bengaluru", "time": "2h ago", "unseen": True},
    {"id": "f2", "name": "Rahul", "relation": "Son", "avatar": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&q=80", "kind": "voice", "preview": "Sent you a voice note", "time": "4h ago", "unseen": True},
    {"id": "f3", "name": "Aarav", "relation": "Grandson", "avatar": "https://images.unsplash.com/photo-1503919545889-aef636e10ad4?w=300&q=80", "kind": "photo", "preview": "First day of school!", "time": "Yesterday", "unseen": False},
    {"id": "f4", "name": "Anaya", "relation": "Granddaughter", "avatar": "https://images.unsplash.com/photo-1519457431-44ccd64a579b?w=300&q=80", "kind": "photo", "preview": "Drew a picture for you!", "time": "Yesterday", "unseen": True},
    {"id": "f5", "name": "Family", "relation": "Album", "avatar": "https://images.unsplash.com/photo-1609220136736-443140cffec6?w=300&q=80", "kind": "album", "preview": "12 new photos in Family Album", "time": "2 days ago", "unseen": True},
]

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


async def _seed_elder_data(elder_id: str):
    meds = [
        {"id": str(uuid.uuid4()), "elder_id": elder_id, "name": "Amlodipine", "dose": "5 mg", "time": "8:00 AM", "type": "tablet", "stock": 6, "per_day": 1, "taken_today": True, "image": MED_IMAGES["tablet"]},
        {"id": str(uuid.uuid4()), "elder_id": elder_id, "name": "Metformin", "dose": "500 mg", "time": "1:00 PM", "type": "tablet", "stock": 4, "per_day": 2, "taken_today": False, "image": MED_IMAGES["tablet"]},
        {"id": str(uuid.uuid4()), "elder_id": elder_id, "name": "Vitamin D3", "dose": "1 capsule", "time": "8:00 PM", "type": "capsule", "stock": 20, "per_day": 1, "taken_today": False, "image": MED_IMAGES["capsule"]},
        {"id": str(uuid.uuid4()), "elder_id": elder_id, "name": "Cough Syrup", "dose": "10 ml", "time": "9:00 PM", "type": "syrup", "stock": 12, "per_day": 1, "taken_today": False, "image": MED_IMAGES["syrup"]},
    ]
    await db.medicines.insert_many([m.copy() for m in meds])
    appts = [
        {"id": str(uuid.uuid4()), "elder_id": elder_id, "doctor": "Dr. Sharma", "specialty": "General Physician", "date": "Tomorrow", "time": "10:30 AM", "place": "Sunshine Clinic", "status": "confirmed"},
        {"id": str(uuid.uuid4()), "elder_id": elder_id, "doctor": "Dr. Menon", "specialty": "Cardiologist", "date": "Fri, 24 May", "time": "4:00 PM", "place": "Apollo Hospital", "status": "confirmed"},
    ]
    await db.appointments.insert_many([a.copy() for a in appts])


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
    items = []
    for i in range(size):
        idx = (page * size + i)
        base = NEWS_BASE[idx % len(NEWS_BASE)]
        items.append({
            "id": f"n{idx}",
            "title": base["title"],
            "summary": base["summary"],
            "source": base["source"],
            "image": base["image"],
            "time": "Just now" if idx == 0 else f"{idx}h ago",
        })
    return {"items": items, "next_page": page + 1}


@api.get("/family-stories")
async def family_stories():
    return FAMILY_STORIES


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
def _med_view(m: dict) -> dict:
    days_left = m["stock"] // max(m["per_day"], 1)
    return {
        "id": m["id"], "name": m["name"], "dose": m["dose"], "time": m["time"],
        "type": m["type"], "stock": m["stock"], "per_day": m["per_day"],
        "taken_today": m.get("taken_today", False), "image": m["image"],
        "days_left": days_left, "low": days_left <= 3,
    }


@api.get("/health/overview")
async def health_overview(u: dict = Depends(current_user)):
    eid = await elder_id_for(u)
    meds = await db.medicines.find({"elder_id": eid}, {"_id": 0}).to_list(100)
    appts = await db.appointments.find({"elder_id": eid}, {"_id": 0}).to_list(100)
    hour = datetime.now().hour
    greeting = "Good morning" if hour < 12 else "Good afternoon" if hour < 17 else "Good evening"
    elder = await db.users.find_one({"id": eid}, {"_id": 0})
    med_views = [_med_view(m) for m in meds]
    return {
        "greeting": greeting,
        "name": (elder or {}).get("name", "there").split(" ")[0],
        "medicines": med_views,
        "appointments": appts,
        "medicines_due": sum(1 for m in med_views if not m["taken_today"]),
        "low_stock": [m for m in med_views if m["low"]],
    }


@api.post("/health/medicines/{med_id}/take")
async def take_medicine(med_id: str, u: dict = Depends(current_user)):
    eid = await elder_id_for(u)
    m = await db.medicines.find_one({"id": med_id, "elder_id": eid})
    if not m:
        raise HTTPException(404, "Medicine not found")
    taken = not m.get("taken_today", False)
    new_stock = m["stock"] - m["per_day"] if taken else m["stock"] + m["per_day"]
    new_stock = max(new_stock, 0)
    await db.medicines.update_one({"id": med_id}, {"$set": {"taken_today": taken, "stock": new_stock}})
    m = await db.medicines.find_one({"id": med_id}, {"_id": 0})
    view = _med_view(m)
    reorder = None
    if taken and view["low"]:
        existing = await db.tasks.find_one({"elder_id": eid, "kind": "reorder", "med_id": med_id, "status": {"$ne": "done"}})
        if not existing:
            reorder = await _create_task(eid, "reorder", f"Reorder {m['name']}", f"{m['name']} is running low ({view['days_left']} days left). Please arrange a refill.", med_id=med_id, auto=True)
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
    m = {
        "id": str(uuid.uuid4()), "elder_id": eid, "name": b.name, "dose": b.dose,
        "time": b.time, "type": b.type if b.type in MED_IMAGES else "tablet",
        "per_day": max(b.per_day, 1), "stock": b.stock, "taken_today": False,
        "image": MED_IMAGES.get(b.type, MED_IMAGES["tablet"]),
    }
    await db.medicines.insert_one(m.copy())
    return _med_view(m)


class OCRIn(BaseModel):
    image_base64: str

@api.post("/health/ocr")
async def prescription_ocr(b: OCRIn, u: dict = Depends(require_role("elder"))):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "AI not configured")
    img = b.image_base64
    if "," in img and img.strip().startswith("data:"):
        img = img.split(",", 1)[1]
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY, session_id=f"ocr-{uuid.uuid4()}",
            system_message=(
                "You read a photo of a medical prescription. Extract the medicines. "
                "Return ONLY a JSON array. Each item: {\"name\": str, \"dose\": str, "
                "\"time\": str (e.g. '8:00 AM'), \"type\": one of tablet|capsule|syrup|drops, "
                "\"per_day\": int}. If unreadable, return []."
            ),
        ).with_model(*GEMINI)
        msg = UserMessage(text="Extract the medicines from this prescription.", file_contents=[ImageContent(image_base64=img)])
        raw = str(await chat.send_message(msg))
        m = re.search(r"\[.*\]", raw, re.S)
        meds = json.loads(m.group(0)) if m else []
    except Exception as e:
        logger.exception("ocr failed")
        raise HTTPException(502, f"Could not read the prescription: {e}")
    clean = []
    for it in meds[:10]:
        clean.append({
            "name": str(it.get("name", "")).strip()[:60],
            "dose": str(it.get("dose", "")).strip()[:40],
            "time": str(it.get("time", "8:00 AM")).strip()[:20],
            "type": it.get("type") if it.get("type") in MED_IMAGES else "tablet",
            "per_day": int(it.get("per_day", 1) or 1),
        })
    return {"medicines": [c for c in clean if c["name"]]}


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
@api.post("/sos")
async def sos(u: dict = Depends(current_user)):
    eid = await elder_id_for(u)
    await db.events.insert_one({"id": str(uuid.uuid4()), "elder_id": eid, "type": "sos", "at": datetime.now(timezone.utc).isoformat()})
    return {"ok": True, "message": "Your family has been alerted. Help is on the way.", "contacts_notified": ["Priya (Daughter)", "Rahul (Son)", "Dr. Sharma"]}


@api.post("/im-okay")
async def im_okay(u: dict = Depends(require_role("elder"))):
    await db.events.insert_one({"id": str(uuid.uuid4()), "elder_id": u["id"], "type": "im_okay", "at": datetime.now(timezone.utc).isoformat()})
    return {"ok": True, "message": "Your family has been reassured. Have a lovely day!"}


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
    most_used = max(counts, key=counts.get) if counts else "News"
    meds = await db.medicines.find({"elder_id": eid}, {"_id": 0}).to_list(100)
    med_views = [_med_view(m) for m in meds]
    appts = await db.appointments.find({"elder_id": eid}, {"_id": 0}).to_list(100)
    pending = await db.tasks.count_documents({"elder_id": eid, "status": {"$in": ["requested"]}})
    return {
        "elder_name": elder["name"],
        "location": elder.get("location", "Unknown"),
        "last_active": last_active,
        "most_used_feature": most_used,
        "feature_counts": counts,
        "medicines": med_views,
        "low_stock_count": sum(1 for m in med_views if m["low"]),
        "appointments": appts,
        "pending_tasks": pending,
    }


# ============================ VOICE / ASSISTANT ============================
class VoiceAsk(BaseModel):
    reel_title: str
    reel_description: str
    question: str

@api.post("/voice/ask")
async def voice_ask(b: VoiceAsk):
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
async def assistant_chat(b: AssistantChatIn):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "AI not configured")
    msg = b.message.strip()
    if not msg:
        raise HTTPException(400, "Message cannot be empty")
    sid = b.session_id or str(uuid.uuid4())
    hist = await db.assistant_messages.find({"session_id": sid}).sort("created_at", 1).to_list(40)
    ctx = "\n".join([("Kamala" if m["role"] == "user" else "Sunshine") + ": " + m["text"] for m in hist[-10:]])
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=sid, system_message=ASSISTANT_SYS).with_model(*GEMINI)
    prompt = f"Our chat so far:\n{ctx}\n\nThey now say: {msg}\n\nReply warmly as Sunshine." if ctx else msg
    answer = str(await chat.send_message(UserMessage(text=prompt))).strip()
    now = datetime.now(timezone.utc).isoformat()
    await db.assistant_messages.insert_many([
        {"id": str(uuid.uuid4()), "session_id": sid, "role": "user", "text": msg, "created_at": now},
        {"id": str(uuid.uuid4()), "session_id": sid, "role": "assistant", "text": answer, "created_at": now},
    ])
    return {"session_id": sid, "answer": answer}

@api.get("/assistant/history")
async def assistant_history(session_id: str):
    docs = await db.assistant_messages.find({"session_id": session_id}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return [{"role": d["role"], "text": d["text"]} for d in docs]


@api.get("/")
async def root():
    return {"message": "Sunshine API"}


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("shutdown")
async def shutdown():
    client.close()
