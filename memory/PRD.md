# Sunshine — PRD

## What it is
A warm, elderly-friendly (60–80) mobile social + wellbeing app built in React Native (Expo SDK 54) with a FastAPI + MongoDB backend. Feels like Instagram's familiarity + a family connection layer + a light health companion.

## Bottom Navigation (4 tabs)
1. **Home** — Vertical short-form Reels feed (auto-play). For You + category chips (All, Exercise, Yoga, Recipes, Travel, Music, Tips, Learning). Right-rail actions: Like, Save, Share, Voice (AI). Bottom overlay: creator, title, description, "Swipe for next".
2. **News** — Instagram-style horizontal "Family Updates" stories (Daughter, Son, Grandchildren, Voice Note, Family Album) + "Today's News" cards with category chips (All, Local, India, World, Community, Weather) and Save.
3. **Health** — "Good {time-of-day}, Kamala" greeting, prominent red SOS button (opens confirmation sheet + "Family Alerted" message), Today's Medicines (tap to mark taken), Upcoming appointment card, 2×2 action grid (Medicines, Appointments, Doctor, My Care).
4. **Profile** — Photo, name, prominent "I'm Okay" button (calls backend), Quick Accessibility toggles (larger text, higher contrast), settings list (Family connections, Saved videos, Saved news, Accessibility, Notifications, Family sharing, Help).

## Backend API (FastAPI, /api prefix)
- `GET /api/reels?category=...`
- `POST /api/reels/{id}/like`, `POST /api/reels/{id}/save`
- `GET /api/family-stories`
- `GET /api/news?category=...`, `POST /api/news/{id}/save`
- `GET /api/health/overview` (dynamic greeting by time)
- `POST /api/health/medicines/{id}/taken`
- `POST /api/sos` (persists event to Mongo, returns notified contacts)
- `POST /api/im-okay` (persists event to Mongo)
- `POST /api/voice/ask` — AI voice-style Q&A using Emergent LLM key (gpt-5.4-mini). Returns 2–4 sentence warm simple answer about the current reel.

## Design tokens (design_guidelines.json)
- Warm cream surface (#FDFBF7), orange brand (#E65C2B), high contrast onSurface (#1F1A17).
- Base font 18pt, min touch target 56pt.
- Haptics on chip press, reel actions, SOS, I'm Okay, tab change.

## Integrations
- **Emergent LLM key** — gpt-5.4-mini (OpenAI) via emergentintegrations for reel Voice AI + voice-search category matching.
- **OpenAI Whisper** — speech-to-text for Voice Search Reels (`/api/reels/voice-search`).
- **Google Gemini (gemini-3.1-pro-preview)** — powers the "Ask Sunshine" conversational assistant (`/api/assistant/chat`, `/api/assistant/history`). Multi-turn context via MongoDB-stored history; warm, simple, elderly-friendly system prompt. Entry points: floating "Ask" button on Home + "Ask Sunshine" card in Profile. Route: `app/assistant.tsx` (modal). Session persisted locally via `@/src/utils/storage`.
- **react-native-keyboard-controller** — reliable chat keyboard experience (KeyboardProvider at root, KeyboardAvoidingView in assistant).
- **expo-video** for real short sample videos on Reels.
- **expo-audio** for voice recording (Voice Search).
- **expo-haptics** for tactile feedback.

## What's MOCKED / prototype
- Video URLs are Google's public sample videos (unrelated to titles) — the reel overlay (creator/title/description/category) sells the intent.
- Family Stories, News, Medicines, Appointments are in-memory seed data.
- SOS + I'm Okay only persist events to Mongo; no real SMS/call.

## Business angle
Sunshine is a low-friction social + wellbeing platform for older adults — a growing, underserved segment. Monetisation angles for later: premium family plan (unlimited family members + priority SOS routing), branded partner content (recipe/yoga creators), tele-consultation revenue share.
