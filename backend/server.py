from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone

from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ============ MODELS ============
class Reel(BaseModel):
    id: str
    creator: str
    creator_avatar: str
    title: str
    description: str
    category: str
    video_url: str
    thumbnail_url: str
    likes: int
    liked: bool = False
    saved: bool = False

class FamilyStory(BaseModel):
    id: str
    name: str
    relation: str
    avatar: str
    kind: str  # photo | voice | album
    preview: str
    time: str
    unseen: bool = True

class NewsItem(BaseModel):
    id: str
    title: str
    summary: str
    source: str
    category: str
    image: str
    time: str
    saved: bool = False

class Medicine(BaseModel):
    id: str
    name: str
    dose: str
    time: str
    taken: bool = False

class Appointment(BaseModel):
    id: str
    doctor: str
    specialty: str
    date: str
    time: str
    place: str

class VoiceAskRequest(BaseModel):
    reel_title: str
    reel_description: str
    question: str

class VoiceAskResponse(BaseModel):
    answer: str

class SOSResponse(BaseModel):
    ok: bool
    message: str
    contacts_notified: List[str]

# ============ SEED DATA ============
REELS: List[Reel] = [
    Reel(
        id="r1",
        creator="Wellness with Meena",
        creator_avatar="https://images.unsplash.com/photo-1564356533237-46945af0eb1e?w=200&q=80",
        title="5-Minute Morning Stretch",
        description="Start your day with these gentle stretches. Good for joints and energy.",
        category="Exercise",
        video_url="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
        thumbnail_url="https://images.unsplash.com/photo-1508050919630-b135583b29ab?w=800&q=80",
        likes=1234,
    ),
    Reel(
        id="r2",
        creator="Chef Radha",
        creator_avatar="https://images.unsplash.com/photo-1607346256330-dee7af15f7c5?w=200&q=80",
        title="Easy Vegetable Poha Recipe",
        description="A light, healthy breakfast ready in 10 minutes. Perfect for busy mornings.",
        category="Recipes",
        video_url="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
        thumbnail_url="https://images.unsplash.com/photo-1542367592-8849eb950fd8?w=800&q=80",
        likes=2841,
    ),
    Reel(
        id="r3",
        creator="Travel Kerala",
        creator_avatar="https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&q=80",
        title="Beautiful Places to Visit in Kerala",
        description="Calm backwaters, green hills and warm food. Kerala at its best.",
        category="Travel",
        video_url="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
        thumbnail_url="https://images.unsplash.com/photo-1609828913552-f9138ed9e42d?w=800&q=80",
        likes=5620,
    ),
    Reel(
        id="r4",
        creator="Safe Living",
        creator_avatar="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&q=80",
        title="3 Ways to Avoid Online Scams",
        description="Simple tips to keep your money and details safe from strangers.",
        category="Tips",
        video_url="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
        thumbnail_url="https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&q=80",
        likes=903,
    ),
    Reel(
        id="r5",
        creator="Gentle Yoga",
        creator_avatar="https://images.unsplash.com/photo-1518611012118-696072aa579a?w=200&q=80",
        title="Gentle Yoga for Beginners",
        description="Soft breathing and slow movements. No mat needed. Just breathe with me.",
        category="Yoga",
        video_url="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
        thumbnail_url="https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80",
        likes=1876,
    ),
    Reel(
        id="r6",
        creator="Songs of Joy",
        creator_avatar="https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&q=80",
        title="Old Melodies on the Sitar",
        description="Sit back and enjoy this soothing sitar performance from Rajasthan.",
        category="Music",
        video_url="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
        thumbnail_url="https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&q=80",
        likes=740,
    ),
]

FAMILY_STORIES: List[FamilyStory] = [
    FamilyStory(id="f1", name="Priya", relation="Daughter", avatar="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300&q=80", kind="photo", preview="Shared a new photo from Bangalore", time="2h ago", unseen=True),
    FamilyStory(id="f2", name="Rahul", relation="Son", avatar="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&q=80", kind="voice", preview="Sent you a voice note", time="4h ago", unseen=True),
    FamilyStory(id="f3", name="Aarav", relation="Grandson", avatar="https://images.unsplash.com/photo-1503919545889-aef636e10ad4?w=300&q=80", kind="photo", preview="First day of school photo", time="Yesterday", unseen=False),
    FamilyStory(id="f4", name="Anaya", relation="Granddaughter", avatar="https://images.unsplash.com/photo-1519457431-44ccd64a579b?w=300&q=80", kind="photo", preview="Drew a picture for you!", time="Yesterday", unseen=True),
    FamilyStory(id="f5", name="Family", relation="All", avatar="https://images.unsplash.com/photo-1609220136736-443140cffec6?w=300&q=80", kind="album", preview="12 new photos in Family Album", time="2 days ago", unseen=True),
    FamilyStory(id="f6", name="Voice Note", relation="Priya", avatar="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300&q=80", kind="voice", preview="Good morning, Amma!", time="3 days ago", unseen=False),
]

NEWS: List[NewsItem] = [
    NewsItem(id="n1", title="Monsoon Update for Rajasthan", summary="Light showers expected across Jaipur and Jodhpur through the weekend. Cooler evenings ahead.", source="India Weather", category="Weather", image="https://images.unsplash.com/photo-1519692933481-e162a57d6721?w=900&q=80", time="1h ago"),
    NewsItem(id="n2", title="New Community Health Initiative Launched", summary="Free monthly check-ups for senior citizens at neighbourhood clinics begins next Monday.", source="Community Times", category="Community", image="https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=900&q=80", time="3h ago"),
    NewsItem(id="n3", title="Today's Weather in Your City", summary="Sunny with a gentle breeze. Highs of 29°C. A good day for a morning walk.", source="Sunshine Weather", category="Weather", image="https://images.unsplash.com/photo-1504608524841-42fe6f032b4b?w=900&q=80", time="Just now"),
    NewsItem(id="n4", title="India News — Top Stories of the Day", summary="Metro expansion approved in three more cities. Read the highlights in simple language.", source="India Today", category="India", image="https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=900&q=80", time="5h ago"),
    NewsItem(id="n5", title="Kerala Backwaters Reopen for Winter Tourism", summary="Fresh routes announced for gentle houseboat cruises through Alleppey and Kumarakom.", source="Travel India", category="Local", image="https://images.unsplash.com/photo-1609828913552-f9138ed9e42d?w=900&q=80", time="Yesterday"),
    NewsItem(id="n6", title="World Update: Global Health Report", summary="WHO shares a warm reminder — small daily walks add years to life. Simple, safe and free.", source="World News", category="World", image="https://images.unsplash.com/photo-1526779259212-939e64788e3c?w=900&q=80", time="Yesterday"),
]

MEDICINES: List[Medicine] = [
    Medicine(id="m1", name="Amlodipine", dose="5 mg", time="8:00 AM", taken=True),
    Medicine(id="m2", name="Metformin", dose="500 mg", time="1:00 PM", taken=False),
    Medicine(id="m3", name="Vitamin D3", dose="1 tablet", time="8:00 PM", taken=False),
]

APPOINTMENTS: List[Appointment] = [
    Appointment(id="a1", doctor="Dr. Sharma", specialty="General Physician", date="Tomorrow", time="10:30 AM", place="Sunshine Clinic"),
    Appointment(id="a2", doctor="Dr. Menon", specialty="Cardiologist", date="Friday, 24 May", time="4:00 PM", place="Apollo Hospital"),
]

# ============ ROUTES ============
@api_router.get("/")
async def root():
    return {"message": "Sunshine API"}

@api_router.get("/reels", response_model=List[Reel])
async def get_reels(category: Optional[str] = None):
    if category and category.lower() != "all":
        return [r for r in REELS if r.category.lower() == category.lower()]
    return REELS

@api_router.post("/reels/{reel_id}/like")
async def like_reel(reel_id: str):
    for r in REELS:
        if r.id == reel_id:
            r.liked = not r.liked
            r.likes += 1 if r.liked else -1
            return {"ok": True, "liked": r.liked, "likes": r.likes}
    raise HTTPException(404, "Reel not found")

@api_router.post("/reels/{reel_id}/save")
async def save_reel(reel_id: str):
    for r in REELS:
        if r.id == reel_id:
            r.saved = not r.saved
            return {"ok": True, "saved": r.saved}
    raise HTTPException(404, "Reel not found")

@api_router.get("/family-stories", response_model=List[FamilyStory])
async def get_family_stories():
    return FAMILY_STORIES

@api_router.get("/news", response_model=List[NewsItem])
async def get_news(category: Optional[str] = None):
    if category and category.lower() != "all":
        return [n for n in NEWS if n.category.lower() == category.lower()]
    return NEWS

@api_router.post("/news/{news_id}/save")
async def save_news(news_id: str):
    for n in NEWS:
        if n.id == news_id:
            n.saved = not n.saved
            return {"ok": True, "saved": n.saved}
    raise HTTPException(404, "News not found")

@api_router.get("/health/overview")
async def health_overview():
    now = datetime.now()
    hour = now.hour
    if hour < 12:
        greeting = "Good morning"
    elif hour < 17:
        greeting = "Good afternoon"
    else:
        greeting = "Good evening"
    return {
        "greeting": greeting,
        "name": "Kamala",
        "message": "Here's what you need today.",
        "medicines": [m.dict() for m in MEDICINES],
        "appointments": [a.dict() for a in APPOINTMENTS],
        "medicines_due": sum(1 for m in MEDICINES if not m.taken),
    }

@api_router.post("/health/medicines/{med_id}/taken")
async def mark_medicine_taken(med_id: str):
    for m in MEDICINES:
        if m.id == med_id:
            m.taken = not m.taken
            return {"ok": True, "taken": m.taken}
    raise HTTPException(404, "Medicine not found")

@api_router.post("/sos", response_model=SOSResponse)
async def trigger_sos():
    event = {
        "id": str(uuid.uuid4()),
        "type": "sos",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.events.insert_one(event.copy())
    return SOSResponse(
        ok=True,
        message="Your family has been alerted. Help is on the way.",
        contacts_notified=["Priya (Daughter)", "Rahul (Son)", "Dr. Sharma"],
    )

@api_router.post("/im-okay")
async def im_okay():
    event = {
        "id": str(uuid.uuid4()),
        "type": "im_okay",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.events.insert_one(event.copy())
    return {"ok": True, "message": "Your family has been reassured. Have a lovely day!"}

@api_router.post("/voice/ask", response_model=VoiceAskResponse)
async def voice_ask(req: VoiceAskRequest):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "LLM key not configured")
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"sunshine-{uuid.uuid4()}",
            system_message=(
                "You are Sunshine, a warm and simple assistant for older adults aged 60 to 80 in India. "
                "You are helping a viewer understand a short video they are watching. "
                "Reply in very simple English, in 2 to 4 short sentences. "
                "Be reassuring, respectful, and kind. Never use technical jargon or emojis."
            ),
        ).with_model("openai", "gpt-5.4-mini")
        prompt = (
            f"The video is titled: '{req.reel_title}'. "
            f"Its description is: '{req.reel_description}'. "
            f"The viewer asks: '{req.question}'. "
            "Give a simple, warm answer."
        )
        response = await chat.send_message(UserMessage(text=prompt))
        return VoiceAskResponse(answer=str(response).strip())
    except Exception as e:
        logging.exception("voice_ask failed")
        raise HTTPException(502, f"Voice assistant failed: {e}")

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
