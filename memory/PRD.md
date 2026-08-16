# Sunshine — PRD (v2: Two-sided family app)

## What it is
Sunshine is a warm, elder-friendly (60–80, India) social + wellbeing app, now TWO-SIDED:
- **Elder app** (phone + 4-digit PIN login)
- **Child/family companion app** (email + password login), linked to the elder via a **family code**.
Chosen by role at login. Full rebrand: **Deep Sage Green (#3A5A40) + Soft Marigold (#FFB703)** on warm cream. Creative vector logo (sun + leaf) + "Sunshine" wordmark. NO orange.

## Auth / RBAC (custom JWT, pwdlib argon2, pyjwt)
- Elder: `POST /api/auth/elder/signup|login` (phone + 4-digit PIN). Signup returns a `family_code` and seeds medicines + appointments.
- Child: `POST /api/auth/child/signup|login` (email + password + family_code). Linked via `elder_id`.
- `GET /api/auth/me`. Role-guarded endpoints (elder-only / child-only return 403 otherwise).
- Token stored via `@/src/utils/storage` (key `sunshine_token`). Root layout routes by role.

## Elder app (4 tabs: Home, Health, Watch, Profile)
- **Home = News** (never-ending infinite scroll, `GET /api/news?page=`), NO category chips. Family Updates stories row on top. Story modal.
- **Health**: greeting; "Did you take your medicine?" intake prompt (big Yes/Not yet); medicines with real pill/type images + stock + low-stock/reorder; taking a low med auto-creates a reorder concierge task. Prescription **OCR** (`POST /api/health/ocr`, Gemini vision) via camera/gallery → add meds. Appointments. Care & Concierge grid + free-text concierge request.
- **Watch = Content** reels (expo-video) with categories incl. Spiritual/Bhajans/Songs/Devotional + Exercise/Yoga/Recipes/Travel.
- **Profile**: family code display, "I'm Okay", quick video-call buttons (Daughter/Son/Doctor), **My Requests** (concierge task statuses), accessibility, logout.
- **Global overlays on all elder screens**: floating **SOS** (red, right) + floating **Voice Assistant** mic (left) → opens Ask Sunshine chat.

## Child app (3 tabs: Dashboard, Tasks, Profile)
- **Dashboard** (`GET /api/child/analytics`): parent last-active (from activity log), most-used feature, location, medicine stock (low highlighted), appointments, pending task count, video-call parent.
- **Tasks**: concierge inbox. Approve/Decline → In progress → Done, with progress stepper. Auto-detected reorder tasks flagged.
- **Profile**: linked-parent, settings, logout.

## AI Concierge (human-in-loop)
- Elder: `POST /api/concierge/request` (OpenAI classifies kind: reorder/doctor/transport/other → task).
- `GET /api/concierge/tasks` (elder=own, child=linked elder's).
- Child: `POST /api/concierge/tasks/{id}/status` (approved|in_progress|done|declined) with timeline.

## Calling
- `/app/call.tsx` in-app video call UI (connecting→connected, mute/video/end) + "switch to phone call" via device dialer (`tel:`).

## Other
- `POST /api/activity` logs elder feature use (drives child analytics).
- `POST /api/sos` (all), `POST /api/im-okay` (elder), `POST /api/notify`.
- Ask Sunshine chat: `POST /api/assistant/chat` (Gemini 3.1 Pro, multi-turn, stored history), `GET /api/assistant/history`.
- Voice ask on reels: `POST /api/voice/ask` (gpt-5.4-mini).

## Integrations
- Custom JWT + RBAC (pyjwt + pwdlib argon2, motor).
- Emergent LLM key: Gemini 3.1 Pro (assistant, OCR vision), gpt-5.4-mini (voice ask, concierge classify).
- expo-video, expo-audio, expo-image-picker (OCR capture), react-native-keyboard-controller, expo-haptics.

## Test accounts
- Elder: phone `9876543210`, PIN `1234` (family code visible in Elder Profile).
- Child: `priya@test.com` / `secret123` (linked to the elder above).

## Prototype notes / backlog (phase 2)
- Calls are prototype UI + device dialer (real video needs native build + keys).
- OCR is real (Gemini vision). Reorder is auto-triggered on low stock.
- Sample reel videos are public Google samples; overlay carries the story.
- Backlog: assistant-driven actions (call/notify from chat), object storage for prescription images, push notifications, larger-text global scaling.
