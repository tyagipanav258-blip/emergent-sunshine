"""Backend API tests for Sunshine app"""
import os
import pytest
import requests

BASE_URL = (os.environ.get('EXPO_PUBLIC_BACKEND_URL') or os.environ.get('EXPO_BACKEND_URL', 'https://sunshine-app-4.preview.emergentagent.com')).rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    ses = requests.Session()
    ses.headers.update({"Content-Type": "application/json"})
    return ses


# ---------- Reels ----------
class TestReels:
    def test_get_all_reels(self, s):
        r = s.get(f"{API}/reels", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 6
        for k in ["id", "creator", "title", "category", "video_url", "likes"]:
            assert k in data[0]

    def test_get_reels_filter_exercise(self, s):
        r = s.get(f"{API}/reels", params={"category": "Exercise"}, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        for item in data:
            assert item["category"].lower() == "exercise"

    def test_get_reels_all_returns_all(self, s):
        r = s.get(f"{API}/reels", params={"category": "All"}, timeout=20)
        assert r.status_code == 200
        assert len(r.json()) == 6

    def test_like_toggle(self, s):
        r1 = s.post(f"{API}/reels/r1/like", timeout=20)
        assert r1.status_code == 200
        d1 = r1.json()
        assert d1["ok"] is True
        first_liked = d1["liked"]
        first_likes = d1["likes"]

        r2 = s.post(f"{API}/reels/r1/like", timeout=20)
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["liked"] != first_liked
        # count moved by +/-1 relative to first response
        assert abs(d2["likes"] - first_likes) == 1

    def test_like_not_found(self, s):
        r = s.post(f"{API}/reels/nope/like", timeout=20)
        assert r.status_code == 404

    def test_save_toggle(self, s):
        r1 = s.post(f"{API}/reels/r2/save", timeout=20)
        assert r1.status_code == 200
        first = r1.json()["saved"]
        r2 = s.post(f"{API}/reels/r2/save", timeout=20)
        assert r2.json()["saved"] != first


# ---------- Family Stories ----------
class TestFamilyStories:
    def test_get_stories(self, s):
        r = s.get(f"{API}/family-stories", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 6
        assert "unseen" in data[0]


# ---------- News ----------
class TestNews:
    def test_get_all_news(self, s):
        r = s.get(f"{API}/news", timeout=20)
        assert r.status_code == 200
        assert len(r.json()) >= 6

    def test_get_news_weather(self, s):
        r = s.get(f"{API}/news", params={"category": "Weather"}, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        for n in data:
            assert n["category"].lower() == "weather"

    def test_news_save_toggle(self, s):
        r1 = s.post(f"{API}/news/n1/save", timeout=20)
        assert r1.status_code == 200
        first = r1.json()["saved"]
        r2 = s.post(f"{API}/news/n1/save", timeout=20)
        assert r2.json()["saved"] != first

    def test_news_save_not_found(self, s):
        r = s.post(f"{API}/news/xxx/save", timeout=20)
        assert r.status_code == 404


# ---------- Health ----------
class TestHealth:
    def test_health_overview(self, s):
        r = s.get(f"{API}/health/overview", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["name"] == "Kamala"
        assert d["greeting"].startswith("Good ")
        assert isinstance(d["medicines"], list) and len(d["medicines"]) >= 3
        assert isinstance(d["appointments"], list) and len(d["appointments"]) >= 1
        assert "medicines_due" in d

    def test_medicine_toggle(self, s):
        r0 = s.get(f"{API}/health/overview", timeout=20)
        before = next(m for m in r0.json()["medicines"] if m["id"] == "m2")["taken"]
        r1 = s.post(f"{API}/health/medicines/m2/taken", timeout=20)
        assert r1.status_code == 200
        assert r1.json()["taken"] != before
        # toggle back
        s.post(f"{API}/health/medicines/m2/taken", timeout=20)

    def test_medicine_not_found(self, s):
        r = s.post(f"{API}/health/medicines/none/taken", timeout=20)
        assert r.status_code == 404


# ---------- SOS + Im Okay ----------
class TestSOS:
    def test_sos(self, s):
        r = s.post(f"{API}/sos", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is True
        assert "message" in d
        assert "Priya (Daughter)" in d["contacts_notified"]
        assert "Rahul (Son)" in d["contacts_notified"]
        assert "Dr. Sharma" in d["contacts_notified"]

    def test_im_okay(self, s):
        r = s.post(f"{API}/im-okay", timeout=20)
        assert r.status_code == 200
        assert r.json()["ok"] is True


# ---------- Voice (LLM) ----------
class TestVoice:
    def test_voice_ask(self, s):
        payload = {
            "reel_title": "5-Minute Morning Stretch",
            "reel_description": "Gentle morning stretches.",
            "question": "Is this safe for my knees?",
        }
        r = s.post(f"{API}/voice/ask", json=payload, timeout=60)
        assert r.status_code == 200, r.text
        ans = r.json().get("answer", "")
        assert isinstance(ans, str) and len(ans) > 10
