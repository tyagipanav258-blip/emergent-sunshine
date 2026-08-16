"""Tests for THREE new features:
1. Prescription Storage (upload + list + image fetch by token + access control)
2. Missed-Dose Alerts (health/overview -> missed; child analytics -> alerts/missed_doses)
3. Assistant Actions (call daughter / message son / plain question)
"""
import os
import uuid
import base64
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
TIMEOUT = 30
AI_TIMEOUT = 120

ELDER_PHONE = "9876543210"
ELDER_PIN = "1234"
CHILD_EMAIL = "priya@test.com"
CHILD_PW = "secret123"

# 1x1 valid JPEG (base64)
TINY_JPEG_B64 = (
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a"
    "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIy"
    "MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIA"
    "AhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEB"
    "AAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+f/9k="
)


@pytest.fixture(scope="module")
def s():
    ses = requests.Session()
    ses.headers.update({"Content-Type": "application/json"})
    return ses


@pytest.fixture(scope="module")
def ctx(s):
    data = {}
    r = s.post(f"{API}/auth/elder/login", json={"phone": ELDER_PHONE, "pin": ELDER_PIN}, timeout=TIMEOUT)
    if r.status_code == 200:
        j = r.json()
        data["elder_token"] = j["access_token"]
        data["elder"] = j["user"]
        data["family_code"] = j["user"]["family_code"]
    else:
        phone = "9" + str(uuid.uuid4().int)[:9]
        j = s.post(f"{API}/auth/elder/signup", json={"name": "Kamala Test", "phone": phone, "pin": "1234"}, timeout=TIMEOUT).json()
        data["elder_token"] = j["access_token"]; data["elder"] = j["user"]; data["family_code"] = j["user"]["family_code"]

    r = s.post(f"{API}/auth/child/login", json={"email": CHILD_EMAIL, "password": CHILD_PW}, timeout=TIMEOUT)
    if r.status_code == 200 and r.json()["user"].get("elder_id") == data["elder"]["id"]:
        j = r.json(); data["child_token"] = j["access_token"]; data["child"] = j["user"]
    else:
        j = s.post(f"{API}/auth/child/signup", json={
            "name": "Priya", "email": f"c_{uuid.uuid4().hex[:8]}@t.com",
            "password": "secret123", "family_code": data["family_code"],
        }, timeout=TIMEOUT).json()
        data["child_token"] = j["access_token"]; data["child"] = j["user"]

    # A second, unrelated elder (for access control test)
    phone2 = "9" + str(uuid.uuid4().int)[:9]
    j2 = s.post(f"{API}/auth/elder/signup", json={"name": "Other Elder", "phone": phone2, "pin": "9999"}, timeout=TIMEOUT).json()
    data["other_token"] = j2["access_token"]
    return data


def eh(c): return {"Authorization": f"Bearer {c['elder_token']}"}
def ch(c): return {"Authorization": f"Bearer {c['child_token']}"}
def oh(c): return {"Authorization": f"Bearer {c['other_token']}"}


# ============================ PRESCRIPTION STORAGE ============================
class TestPrescriptionStorage:
    def test_create_and_persist(self, s, ctx):
        r = s.post(f"{API}/health/prescriptions", json={"image_base64": TINY_JPEG_B64},
                   headers=eh(ctx), timeout=AI_TIMEOUT)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "id" in d and "medicines" in d
        assert isinstance(d["medicines"], list)
        ctx["pid"] = d["id"]

    def test_list_for_elder(self, s, ctx):
        r = s.get(f"{API}/prescriptions", headers=eh(ctx), timeout=TIMEOUT)
        assert r.status_code == 200
        items = r.json()
        assert any(p["id"] == ctx["pid"] for p in items)

    def test_list_for_child(self, s, ctx):
        r = s.get(f"{API}/prescriptions", headers=ch(ctx), timeout=TIMEOUT)
        assert r.status_code == 200
        items = r.json()
        assert any(p["id"] == ctx["pid"] for p in items)

    def test_image_fetch_with_elder_token(self, s, ctx):
        r = s.get(f"{API}/prescriptions/{ctx['pid']}/image",
                  params={"token": ctx["elder_token"]}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("image/")
        assert len(r.content) > 0

    def test_image_fetch_with_child_token(self, s, ctx):
        r = s.get(f"{API}/prescriptions/{ctx['pid']}/image",
                  params={"token": ctx["child_token"]}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("image/")

    def test_image_fetch_denied_for_other_user(self, s, ctx):
        r = s.get(f"{API}/prescriptions/{ctx['pid']}/image",
                  params={"token": ctx["other_token"]}, timeout=TIMEOUT)
        assert r.status_code in (401, 404), r.text

    def test_image_fetch_no_token(self, s, ctx):
        r = s.get(f"{API}/prescriptions/{ctx['pid']}/image", timeout=TIMEOUT)
        # Query param is required
        assert r.status_code in (401, 422)


# ============================ MISSED DOSE ============================
class TestMissedDose:
    def test_overview_returns_missed_field(self, s, ctx):
        # Add a medicine well in the past so it is definitely missed
        add = s.post(f"{API}/health/medicines", json={
            "name": "TEST_MissedMed", "dose": "10mg", "time": "12:01 AM",
            "type": "tablet", "per_day": 1, "stock": 10,
        }, headers=eh(ctx), timeout=TIMEOUT).json()

        r = s.get(f"{API}/health/overview", headers=eh(ctx), timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert "missed" in d and isinstance(d["missed"], list)
        assert any(m["id"] == add["id"] for m in d["missed"]), \
            f"expected {add['id']} in missed, got {[m['id'] for m in d['missed']]}"
        ctx["missed_id"] = add["id"]

    def test_missed_dedup_notification(self, s, ctx):
        # Call overview twice; notification must be de-duplicated (one per med per day)
        s.get(f"{API}/health/overview", headers=eh(ctx), timeout=TIMEOUT)
        s.get(f"{API}/health/overview", headers=eh(ctx), timeout=TIMEOUT)

        # Child analytics should reflect it
        r = s.get(f"{API}/child/analytics", headers=ch(ctx), timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert "missed_doses" in d and isinstance(d["missed_doses"], list)
        assert "alerts" in d and isinstance(d["alerts"], list)
        # Should contain at least one alert for our missed med (name shows in message)
        assert any("TEST_MissedMed" in a.get("message", "") for a in d["alerts"])
        # Count occurrences of this med in alerts -- should be exactly 1 (dedup)
        occurrences = sum(1 for a in d["alerts"] if "TEST_MissedMed" in a.get("message", ""))
        assert occurrences == 1, f"expected 1 dedup'd alert, got {occurrences}"


# ============================ ASSISTANT ACTIONS ============================
class TestAssistantActions:
    def test_call_daughter(self, s):
        r = s.post(f"{API}/assistant/chat",
                   json={"message": "Please call my daughter"}, timeout=AI_TIMEOUT)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("action") is not None, f"action should not be null: {d}"
        assert d["action"]["type"] == "call"
        assert d["action"]["target"] == "daughter"
        assert d["action"]["target_name"] == "Priya"

    def test_message_son_lunch(self, s):
        r = s.post(f"{API}/assistant/chat",
                   json={"message": "Tell my son I had lunch"}, timeout=AI_TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert d.get("action") is not None, f"expected message action, got {d}"
        assert d["action"]["type"] == "message"
        assert d["action"]["target"] == "son"
        assert d["action"]["target_name"] == "Rahul"
        assert d["action"].get("message"), "message content should be present"
        assert "lunch" in d["action"]["message"].lower()

    def test_plain_question_no_action(self, s):
        r = s.post(f"{API}/assistant/chat",
                   json={"message": "What is a good breakfast?"}, timeout=AI_TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        # action should be null or type none
        action = d.get("action")
        assert action is None or action.get("type") == "none"
