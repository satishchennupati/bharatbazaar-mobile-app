"""Phone-first auth flow tests for Bharat Bazaar.

Covers:
- POST /api/auth/check-phone
- POST /api/auth/login (phone+password)
- POST /api/auth/register/send-otp / verify-otp / set-password
- Old username-based login is rejected
"""
import os
import time
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

DEMO_PHONE = "+355690000000"
DEMO_PW = "demo1234"

# Direct DB access to retrieve OTP code when Twilio actually delivers (no debug_code).
# Backend & tests share the same Mongo instance in this container.
_mongo = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
_db = _mongo[os.environ.get("DB_NAME", "mybazaarcart")]


def _otp_code_for(phone: str) -> str:
    sess = _db.otp_sessions.find_one({"phone": phone})
    assert sess and sess.get("code"), f"No OTP session in DB for {phone}"
    return sess["code"]


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _fresh_phone() -> str:
    # 9-digit Albanian mobile-shaped number, unique per test run
    return f"+35569{int(time.time() * 1000) % 10_000_000:07d}"


def _cleanup_phone(phone: str):
    _db.users.delete_many({"phone": phone})
    _db.otp_sessions.delete_many({"phone": phone})


# ---------- check-phone ----------
class TestCheckPhone:
    def test_exists_demo(self, session):
        r = session.post(f"{API}/auth/check-phone", json={"phone": DEMO_PHONE})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("exists") is True
        assert body.get("phone") == DEMO_PHONE

    def test_not_exists_new(self, session):
        phone = _fresh_phone()
        r = session.post(f"{API}/auth/check-phone", json={"phone": phone})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("exists") is False
        assert body.get("phone") == phone

    def test_non_e164_400(self, session):
        r = session.post(f"{API}/auth/check-phone", json={"phone": "355690000000"})
        assert r.status_code == 400, r.text


# ---------- login (phone+password) ----------
class TestPhoneLogin:
    def test_demo_login_success(self, session):
        r = session.post(f"{API}/auth/login", json={"phone": DEMO_PHONE, "password": DEMO_PW})
        assert r.status_code == 200, r.text
        body = r.json()
        assert "token" in body and body["token"]
        assert "user" in body
        assert body["user"].get("phone") == DEMO_PHONE
        assert "password_hash" not in body["user"]
        assert "_id" not in body["user"]

    def test_wrong_password_401(self, session):
        r = session.post(f"{API}/auth/login", json={"phone": DEMO_PHONE, "password": "wrongwrong"})
        assert r.status_code == 401

    def test_old_username_schema_rejected(self, session):
        """Old {username, password} payload no longer has required 'phone' -> 422."""
        r = session.post(f"{API}/auth/login", json={"username": "demo", "password": DEMO_PW})
        # schema now requires 'phone' — FastAPI returns 422 for missing field
        assert r.status_code in (401, 422), r.text


# ---------- OTP + set-password full happy path ----------
class TestOtpSignup:
    _state: dict = {}

    def test_send_otp_new_phone(self, session):
        phone = _fresh_phone()
        _cleanup_phone(phone)
        r = session.post(f"{API}/auth/register/send-otp", json={"phone": phone})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("phone") == phone
        # debug_code exposed only when Twilio falls back to mock (rejection). With
        # real Twilio creds live in this env, fetch code directly from Mongo.
        code = body.get("debug_code") or _otp_code_for(phone)
        assert code and len(code) == 6, f"OTP code missing/invalid: {code!r}"
        TestOtpSignup._state["phone"] = phone
        TestOtpSignup._state["code"] = code

    def test_verify_otp_wrong_code_400(self, session):
        phone = TestOtpSignup._state["phone"]
        r = session.post(f"{API}/auth/register/verify-otp", json={"phone": phone, "code": "000000"})
        assert r.status_code == 400, r.text

    def test_verify_otp_correct_code(self, session):
        phone = TestOtpSignup._state["phone"]
        code = TestOtpSignup._state["code"]
        r = session.post(f"{API}/auth/register/verify-otp", json={"phone": phone, "code": code})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("signup_token")
        TestOtpSignup._state["signup_token"] = body["signup_token"]

    def test_set_password_creates_user(self, session):
        token = TestOtpSignup._state["signup_token"]
        phone = TestOtpSignup._state["phone"]
        new_pw = "NewPass123"
        r = session.post(
            f"{API}/auth/register/set-password",
            json={
                "signup_token": token,
                "password": new_pw,
                "full_name": "TEST Signup User",
                "language": "sq",
                "currency": "EUR",
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("token")
        u = body.get("user", {})
        assert u.get("phone") == phone
        assert u.get("full_name") == "TEST Signup User"
        assert u.get("language") == "sq"
        assert u.get("currency") == "EUR"
        assert "password_hash" not in u
        TestOtpSignup._state["new_pw"] = new_pw

    def test_login_after_signup(self, session):
        phone = TestOtpSignup._state["phone"]
        pw = TestOtpSignup._state["new_pw"]
        r = session.post(f"{API}/auth/login", json={"phone": phone, "password": pw})
        assert r.status_code == 200, r.text
        assert r.json()["user"]["phone"] == phone

    def test_set_password_reused_token_conflict(self, session):
        """Re-using the same signup_token after user is created must fail (409)."""
        token = TestOtpSignup._state.get("signup_token")
        if not token:
            pytest.skip("No signup_token from previous step")
        r = session.post(
            f"{API}/auth/register/set-password",
            json={"signup_token": token, "password": "another123"},
        )
        assert r.status_code == 409, r.text

    def test_set_password_invalid_token_400(self, session):
        r = session.post(
            f"{API}/auth/register/set-password",
            json={"signup_token": "not-a-real-jwt", "password": "another123"},
        )
        assert r.status_code == 400, r.text


# ---------- OTP wrong-code attempts / rate limit ----------
class TestOtpAttempts:
    def test_five_wrong_attempts_returns_429(self, session):
        phone = _fresh_phone()
        _cleanup_phone(phone)
        r = session.post(f"{API}/auth/register/send-otp", json={"phone": phone})
        assert r.status_code == 200, r.text
        # verify session was created in DB (regardless of Twilio delivery mode)
        _otp_code_for(phone)

        # 5 wrong attempts: first 4 → 400, 5th (attempts>=5 at check) → 429
        statuses = []
        for _ in range(5):
            rr = session.post(
                f"{API}/auth/register/verify-otp",
                json={"phone": phone, "code": "111111"},
            )
            statuses.append(rr.status_code)
        # First four are invalid (400); on the 5th call attempts==4 → check fails
        # and attempts increments to 5. On 6th call, session shows attempts>=5 → 429.
        # But the seeded session may already be gone if code guesses succeed.
        rr6 = session.post(
            f"{API}/auth/register/verify-otp",
            json={"phone": phone, "code": "111111"},
        )
        assert rr6.status_code in (429, 400), f"got {rr6.status_code} after {statuses}"
        # At least confirm the code path behaves: 5+ attempts eventually 429
        assert rr6.status_code == 429 or any(s == 429 for s in statuses), (
            f"Expected 429 on 5+ attempts, got sequence {statuses + [rr6.status_code]}"
        )


# ---------- Register on already-registered phone ----------
class TestRegisterExistingPhone:
    def test_send_otp_existing_phone_conflict(self, session):
        r = session.post(f"{API}/auth/register/send-otp", json={"phone": DEMO_PHONE})
        assert r.status_code == 409, r.text
