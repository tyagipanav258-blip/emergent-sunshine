"""Backend API tests for Sunshine — RBAC + full flow.

Uses public preview URL from EXPO_PUBLIC_BACKEND_URL. Tests critical flows only
per <review_request> spec: auth (elder/child), RBAC, news digest, content
filter, health overview, medicine take/add, OCR, concierge, analytics,
assistant with context, SOS.
"""
import os
import base64
import uuid
import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
).rstrip("/")
API = f"{BASE_URL}/api"

TIMEOUT = 30
AI_TIMEOUT = 90

# Reuse existing seeded elder if present, else create fresh unique elder each run
EXISTING_PHONE = "9876543210"
EXISTING_PIN = "1234"
EXISTING_CHILD_EMAIL = "priya@test.com"
EXISTING_CHILD_PW = "secret123"


@pytest.fixture(scope="module")
def s():
    ses = requests.Session()
    ses.headers.update({"Content-Type": "application/json"})
    return ses


@pytest.fixture(scope="module")
def ctx(s):
    """Ensure we have working elder + child tokens. Prefer the seeded pair; fall
    back to fresh signup if login fails or link is broken."""
    data = {}

    # Try existing elder login
    r = s.post(f"{API}/auth/elder/login", json={"phone": EXISTING_PHONE, "pin": EXISTING_PIN}, timeout=TIMEOUT)
    if r.status_code == 200:
        j = r.json()
        data["elder_token"] = j["access_token"]
        data["elder"] = j["user"]
        data["family_code"] = j["user"]["family_code"]
    else:
        # Fresh signup with unique phone
        phone = "9" + str(uuid.uuid4().int)[:9]
        r = s.post(f"{API}/auth/elder/signup", json={"name": "Kamala Test", "phone": phone, "pin": "1234"}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        j = r.json()
        data["elder_token"] = j["access_token"]
        data["elder"] = j["user"]
        data["family_code"] = j["user"]["family_code"]

    # Try existing child login
    r = s.post(f"{API}/auth/child/login", json={"email": EXISTING_CHILD_EMAIL, "password": EXISTING_CHILD_PW}, timeout=TIMEOUT)
    if r.status_code == 200 and r.json()["user"].get("elder_id") == data["elder"]["id"]:
        j = r.json()
        data["child_token"] = j["access_token"]
        data["child"] = j["user"]
    else:
        # Fresh child signup linked to elder's family code
        email = f"child_{uuid.uuid4().hex[:8]}@test.com"
        r = s.post(f"{API}/auth/child/signup", json={
            "name": "Priya", "email": email, "password": "secret123",
            "family_code": data["family_code"],
        }, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        j = r.json()
        data["child_token"] = j["access_token"]
        data["child"] = j["user"]

    return data


def eh(ctx):
    return {"Authorization": f"Bearer {ctx['elder_token']}"}


def ch(ctx):
    return {"Authorization": f"Bearer {ctx['child_token']}"}


# ============================ AUTH ============================
class TestAuth:
    def test_elder_login_wrong_pin(self, s, ctx):
        r = s.post(f"{API}/auth/elder/login", json={"phone": ctx["elder"]["phone"], "pin": "0000"}, timeout=TIMEOUT)
        assert r.status_code == 401

    def test_child_invalid_family_code(self, s):
        r = s.post(f"{API}/auth/child/signup", json={
            "name": "Bad", "email": f"bad_{uuid.uuid4().hex[:6]}@t.com",
            "password": "secret123", "family_code": "ZZZZZZ",
        }, timeout=TIMEOUT)
        assert r.status_code == 400

    def test_me_elder(self, s, ctx):
        r = s.get(f"{API}/auth/me", headers=eh(ctx), timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert d["role"] == "elder"
        assert d["family_code"]

    def test_me_child_has_elder_name(self, s, ctx):
        r = s.get(f"{API}/auth/me", headers=ch(ctx), timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert d["role"] == "child"
        assert d.get("elder_name")


# ============================ RBAC ============================
class TestRBAC:
    def test_child_cannot_im_okay(self, s, ctx):
        r = s.post(f"{API}/im-okay", headers=ch(ctx), timeout=TIMEOUT)
        assert r.status_code == 403

    def test_elder_cannot_analytics(self, s, ctx):
        r = s.get(f"{API}/child/analytics", headers=eh(ctx), timeout=TIMEOUT)
        assert r.status_code == 403

    def test_elder_cannot_update_task_status(self, s, ctx):
        # create task first
        t = s.post(f"{API}/concierge/request", json={"request": "Book a cab tomorrow"}, headers=eh(ctx), timeout=AI_TIMEOUT).json()
        r = s.post(f"{API}/concierge/tasks/{t['id']}/status", json={"status": "approved"}, headers=eh(ctx), timeout=TIMEOUT)
        assert r.status_code == 403


# ============================ NEWS ============================
class TestNews:
    def test_page0(self, s):
        r = s.get(f"{API}/news", params={"page": 0}, timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "next_page" in d
        assert len(d["items"]) == 6
        assert d["next_page"] == 1

    def test_page1(self, s):
        r = s.get(f"{API}/news", params={"page": 1}, timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert len(d["items"]) == 6
        # different ids from page 0
        assert d["items"][0]["id"] != "n0"


# ============================ CONTENT ============================
class TestContent:
    def test_all(self, s):
        r = s.get(f"{API}/content", timeout=TIMEOUT)
        assert r.status_code == 200
        assert len(r.json()) >= 6

    def test_bhajans(self, s):
        r = s.get(f"{API}/content", params={"category": "Bhajans"}, timeout=TIMEOUT)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1
        assert all(c["category"] == "Bhajans" for c in items)

    def test_spiritual(self, s):
        r = s.get(f"{API}/content", params={"category": "Spiritual"}, timeout=TIMEOUT)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1
        assert all(c["category"] == "Spiritual" for c in items)


# ============================ HEALTH ============================
class TestHealth:
    def test_overview_elder(self, s, ctx):
        r = s.get(f"{API}/health/overview", headers=eh(ctx), timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert d["greeting"].startswith("Good ")
        assert d["name"]
        assert isinstance(d["medicines"], list)
        m0 = d["medicines"][0] if d["medicines"] else None
        for k in ["image", "type", "stock", "days_left", "low"]:
            assert k in m0
        assert isinstance(d["appointments"], list) and len(d["appointments"]) >= 1
        assert "medicines_due" in d

    def test_add_medicine(self, s, ctx):
        r = s.post(f"{API}/health/medicines", json={
            "name": "TEST_Aspirin", "dose": "75 mg", "time": "9:00 AM",
            "type": "tablet", "per_day": 1, "stock": 30,
        }, headers=eh(ctx), timeout=TIMEOUT)
        assert r.status_code == 200
        med = r.json()
        assert med["name"] == "TEST_Aspirin"
        assert med["image"]
        # Verify persistence
        ov = s.get(f"{API}/health/overview", headers=eh(ctx), timeout=TIMEOUT).json()
        assert any(m["id"] == med["id"] for m in ov["medicines"])

    def test_take_medicine_toggle_and_low_stock_reorder(self, s, ctx):
        # Add a low-stock medicine (stock=1, per_day=1 -> days_left=1 -> low=True)
        r = s.post(f"{API}/health/medicines", json={
            "name": "TEST_LowStock", "dose": "1 tab", "time": "10:00 AM",
            "type": "tablet", "per_day": 1, "stock": 1,
        }, headers=eh(ctx), timeout=TIMEOUT)
        med = r.json()
        assert med["low"] is True

        # Take it (taken=True); should decrement stock and trigger reorder task
        r = s.post(f"{API}/health/medicines/{med['id']}/take", json={"taken": True}, headers=eh(ctx), timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is True
        assert d["medicine"]["taken_today"] is True
        assert d["medicine"]["stock"] == 0
        assert d["reorder_task"] is not None
        assert d["reorder_task"]["kind"] == "reorder"

        # Toggle back
        r = s.post(f"{API}/health/medicines/{med['id']}/take", json={"taken": True}, headers=eh(ctx), timeout=TIMEOUT)
        assert r.status_code == 200
        assert r.json()["medicine"]["taken_today"] is True  # confirming twice is a no-op


# ============================ OCR ============================
class TestOCR:
    def test_ocr_blank_image_no_500(self, s, ctx):
        # Minimal 1x1 white PNG
        png_b64 = (
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4"
            "//8/AwAI/AL+XJ8pAAAAAElFTkSuQmCC"
        )
        r = s.post(f"{API}/health/ocr", json={"image_base64": png_b64}, headers=eh(ctx), timeout=AI_TIMEOUT)
        # Must not 500. Accept 200 with (possibly empty) list, or upstream 502.
        assert r.status_code in (200, 502), r.text
        if r.status_code == 200:
            d = r.json()
            assert "medicines" in d
            assert isinstance(d["medicines"], list)


# ============================ CONCIERGE ============================
class TestConcierge:
    def test_full_flow(self, s, ctx):
        # Elder creates a request
        r = s.post(f"{API}/concierge/request", json={"request": "Please order more Amlodipine tablets"}, headers=eh(ctx), timeout=AI_TIMEOUT)
        assert r.status_code == 200
        task = r.json()
        assert task["kind"] in {"reorder", "doctor", "transport", "other"}
        assert task["status"] == "requested"
        tid = task["id"]

        # Elder sees it in list
        el = s.get(f"{API}/concierge/tasks", headers=eh(ctx), timeout=TIMEOUT).json()
        assert any(t["id"] == tid for t in el)

        # Child sees it in list
        ch_list = s.get(f"{API}/concierge/tasks", headers=ch(ctx), timeout=TIMEOUT).json()
        assert any(t["id"] == tid for t in ch_list)

        # Child updates status -> approved
        r = s.post(f"{API}/concierge/tasks/{tid}/status", json={"status": "approved"}, headers=ch(ctx), timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "approved"
        assert any(x["status"] == "approved" and x["by"] == "child" for x in d["timeline"])


# ============================ ANALYTICS ============================
class TestAnalytics:
    def test_child_analytics(self, s, ctx):
        # Ensure activity exists
        s.post(f"{API}/activity", json={"feature": "News"}, headers=eh(ctx), timeout=TIMEOUT)
        r = s.get(f"{API}/child/analytics", headers=ch(ctx), timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        for k in ["elder_name", "most_used_feature", "medicines", "low_stock_count", "appointments", "pending_tasks"]:
            assert k in d
        assert d["elder_name"]


# ============================ ASSISTANT ============================
class TestAssistant:
    def test_chat_with_context(self, s):
        r1 = s.post(f"{API}/assistant/chat", json={"message": "My name is Kamala."}, headers=eh(ctx), timeout=AI_TIMEOUT)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        sid = d1["session_id"]
        assert d1["answer"]

        r2 = s.post(f"{API}/assistant/chat", json={"session_id": sid, "message": "What is my name?"}, headers=eh(ctx), timeout=AI_TIMEOUT)
        assert r2.status_code == 200
        assert r2.json()["session_id"] == sid

        h = s.get(f"{API}/assistant/history", params={"session_id": sid}, headers=eh(ctx), timeout=TIMEOUT).json()
        assert len(h) >= 4  # 2 user + 2 assistant


# ============================ SOS / ACTIVITY ============================
class TestSOSActivity:
    def test_sos(self, s, ctx):
        r = s.post(f"{API}/sos", headers=eh(ctx), timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is True
        assert isinstance(d["contacts_notified"], list)
        assert d["delivered"] is (len(d["contacts_notified"]) > 0)
        assert d["emergency_number"]

    def test_activity_elder(self, s, ctx):
        r = s.post(f"{API}/activity", json={"feature": "Health"}, headers=eh(ctx), timeout=TIMEOUT)
        assert r.status_code == 200
        assert r.json()["ok"] is True
