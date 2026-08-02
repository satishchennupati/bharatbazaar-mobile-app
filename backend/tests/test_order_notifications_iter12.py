"""Iteration 12 backend tests — order SMS notification flow + regression.

Focus:
- /api/orders places order, returns 200, populates notification_customer / notification_owner
- SMS failure (invalid customer phone) must NOT block order
- Helper build_customer_order_sms / build_owner_order_sms return expected content
- Config exposes STORE_OWNER_PHONE, STORE_NAME
- Regression: health, categories, products, offers/banners, admin/auth, /auth/login,
  forgot-password/send-otp (real phone → DB purpose=reset), register/send-otp
  (unknown phone → DB record no purpose), cart POST/GET, validate-coupon WELCOME10 2000.
"""
from __future__ import annotations

import os
import sys
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://bharat-app-8.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_PHONE = "+355690000001"
ADMIN_PASSWORD = "admin123"
QUICK_PHONE = "+355695808480"
QUICK_PASSWORD = "123456"

# Ensure backend package importable for helper-level tests
sys.path.insert(0, "/app/backend")


# --------------------------- fixtures ---------------------------
@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def quick_token(api):
    r = api.post(f"{API}/auth/login", json={"phone": QUICK_PHONE, "password": QUICK_PASSWORD})
    assert r.status_code == 200, f"quick-user login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def quick_auth(quick_token):
    return {"Authorization": f"Bearer {quick_token}"}


@pytest.fixture(scope="module")
def admin_token(api):
    r = api.post(f"{API}/admin/auth/login", json={"phone": ADMIN_PHONE, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


# --------------------------- Config / helper tests ---------------------------
class TestConfigAndHelpers:
    def test_config_exposes_store_owner(self):
        import importlib
        import config as cfg
        importlib.reload(cfg)
        assert cfg.STORE_OWNER_PHONE == "+355695808480"
        assert cfg.STORE_NAME == "Bharat Bazaar"

    def test_customer_sms_content(self):
        from services.notifications import build_customer_order_sms
        order = {"id": "MBC1234ABCD", "total_lek": 2199.5, "eta_minutes": 45}
        body = build_customer_order_sms(order, customer_name="Test User")
        assert "Bharat Bazaar" in body
        assert "MBC1234ABCD" in body
        assert ("Cash on Delivery" in body) or ("COD" in body)
        assert " L" in body  # e.g. "2200 L"
        assert "45 min" in body or "min" in body

    def test_owner_sms_content(self):
        from services.notifications import build_owner_order_sms
        order = {
            "id": "MBCOWN0001",
            "total_lek": 1800,
            "eta_minutes": 40,
            "items": [{"qty": 2, "name": "Basmati Rice"}],
            "address": {"line1": "Rr. Kavajes 12", "area": "Njesia 5", "city": "Tirana", "state": "Tirana"},
        }
        body = build_owner_order_sms(order, customer_name="Test User", customer_phone="+355691112222")
        assert "NEW ORDER" in body
        assert "MBCOWN0001" in body
        assert "Test User" in body
        assert "+355691112222" in body
        assert " L" in body
        # address portion
        assert "Rr. Kavajes 12" in body or "Tirana" in body

    def test_send_sms_invalid_phone(self):
        from services.notifications import send_sms
        r = send_sms("355abc", "hi")
        assert r["sent"] is False
        assert r["channel"] == "invalid"


# --------------------------- Regression: public endpoints ---------------------------
class TestRegressionPublic:
    def test_health(self, api):
        r = api.get(f"{API}/health")
        assert r.status_code == 200
        j = r.json()
        assert j.get("status") in ("ok", "healthy") or j.get("ok") is True or "status" in j

    def test_categories(self, api):
        r = api.get(f"{API}/categories")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) > 0

    def test_products_snacks(self, api):
        r = api.get(f"{API}/products", params={"category": "snacks"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_offer_banners(self, api):
        r = api.get(f"{API}/offers/banners")
        assert r.status_code == 200
        body = r.json()
        # Endpoint returns {banners: [...], count: n}
        assert isinstance(body, dict) and "banners" in body
        assert isinstance(body["banners"], list)


class TestRegressionAuth:
    def test_admin_login(self, admin_token):
        assert admin_token and isinstance(admin_token, str)

    def test_customer_login(self, quick_token):
        assert quick_token and isinstance(quick_token, str)

    def test_forgot_password_send_otp_creates_reset_record(self, api):
        r = api.post(f"{API}/auth/forgot-password/send-otp", json={"phone": QUICK_PHONE})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["phone"] == QUICK_PHONE

        # Verify DB record with purpose=reset exists
        import asyncio
        from db import db

        async def _find():
            return await db.otp_sessions.find_one({"phone": QUICK_PHONE, "purpose": "reset"})

        rec = asyncio.get_event_loop().run_until_complete(_find())
        assert rec is not None, "reset OTP session not persisted"
        assert rec.get("purpose") == "reset"
        assert rec.get("code")

    def test_register_send_otp_unknown_phone(self, api):
        # Unknown phone → creates OTP session with purpose absent
        unknown = "+3556909999" + str(int(time.time()) % 100).zfill(2)
        r = api.post(f"{API}/auth/register/send-otp", json={"phone": unknown})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True

        import asyncio
        from db import db

        async def _find():
            return await db.otp_sessions.find_one({"phone": unknown})

        rec = asyncio.get_event_loop().run_until_complete(_find())
        assert rec is not None
        assert "purpose" not in rec or rec.get("purpose") in (None, "")

        # cleanup
        async def _clean():
            await db.otp_sessions.delete_many({"phone": unknown})

        asyncio.get_event_loop().run_until_complete(_clean())


# --------------------------- Cart + coupon ---------------------------
class TestCartAndCoupon:
    def test_cart_add_and_get(self, api, quick_auth):
        # Clear cart first
        api.delete(f"{API}/cart", headers=quick_auth)
        # Grab a product
        r = api.get(f"{API}/products", params={"limit": 3})
        assert r.status_code == 200
        products = r.json()
        assert products, "no products seeded"
        pid = products[0]["id"]

        add = api.post(f"{API}/cart", headers=quick_auth, json={"product_id": pid, "qty": 2})
        assert add.status_code == 200, add.text
        got = api.get(f"{API}/cart", headers=quick_auth)
        assert got.status_code == 200
        items = got.json().get("items", [])
        assert any(it["product_id"] == pid for it in items)

    def test_validate_coupon_welcome10_subtotal_2000(self, api, quick_auth):
        r = api.post(
            f"{API}/offers/validate-coupon",
            headers=quick_auth,
            json={"code": "WELCOME10", "subtotal_lek": 2000},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("valid") in (True, False)
        if body.get("valid"):
            assert body.get("discount_lek", 0) > 0


# --------------------------- Order placement + SMS notification ---------------------------
def _seed_cart_and_place(api, headers, phone_override=None):
    """Helper: clear cart, add 1 product, place order. Returns (place_response_json, order_id)."""
    api.delete(f"{API}/cart", headers=headers)
    r = api.get(f"{API}/products", params={"limit": 3})
    products = [p for p in r.json() if p.get("in_stock", True)]
    assert products
    pid = products[0]["id"]
    a = api.post(f"{API}/cart", headers=headers, json={"product_id": pid, "qty": 2})
    assert a.status_code == 200, a.text

    address = {
        "label": "Home",
        "line1": "Rr. Kavajes 12",
        "city": "Tirana",
        "state": "Tirana",
        "country": "Albania",
        "country_code": "AL",
        "phone": phone_override or QUICK_PHONE,
    }
    payload = {"address": address, "note": "test order iter12", "currency": "LEK"}
    resp = api.post(f"{API}/orders", headers=headers, json=payload)
    return resp


class TestOrderNotifications:
    def test_place_order_returns_200_and_persists_notification(self, api, quick_auth):
        resp = _seed_cart_and_place(api, quick_auth)
        assert resp.status_code == 200, f"expected 200, got {resp.status_code} {resp.text}"
        body = resp.json()
        assert "id" in body and body["id"].startswith("MBC")
        assert body.get("total_lek") is not None
        assert body.get("eta_minutes")

        order_id = body["id"]
        # Small pause to let update_one complete after SMS attempt
        time.sleep(1.5)

        r = api.get(f"{API}/orders/{order_id}", headers=quick_auth)
        assert r.status_code == 200
        persisted = r.json()
        assert "notification_sent_at" in persisted, "notification_sent_at missing"
        for who in ("notification_customer", "notification_owner"):
            n = persisted.get(who)
            assert n is not None, f"{who} missing"
            assert "channel" in n
            allowed = {"sms", "mock", "twilio_error", "invalid", "misconfigured",
                       "no_phone", "no_owner_phone", "error"}
            assert n["channel"] in allowed, f"unexpected channel: {n['channel']}"
            if n["channel"] == "sms":
                assert "sid" in n
            else:
                # sent must be False for non-sms channels
                assert n.get("sent") is False

    def test_order_survives_twilio_outage_simulation(self, api, quick_auth):
        """Simulate SMS failure by putting an invalid phone on the user profile."""
        # Fetch original phone
        me = api.get(f"{API}/me", headers=quick_auth)
        original_phone = None
        if me.status_code == 200:
            original_phone = me.json().get("phone")
        # Force customer_phone to be invalid via DB direct write (address phone still empty).
        # We'll patch db.users; safer than exposing an API to break phone.
        import asyncio
        from db import db

        async def _set(phone):
            await db.users.update_one({"id": "quick-user-001"}, {"$set": {"phone": phone}})

        try:
            asyncio.get_event_loop().run_until_complete(_set("bad-phone"))
            # Also set address phone to invalid so both channels fail
            api.delete(f"{API}/cart", headers=quick_auth)
            r = api.get(f"{API}/products", params={"limit": 3})
            products = [p for p in r.json() if p.get("in_stock", True)]
            pid = products[0]["id"]
            api.post(f"{API}/cart", headers=quick_auth, json={"product_id": pid, "qty": 1})
            address = {
                "label": "Home",
                "line1": "Rr. Test 99",
                "city": "Tirana",
                "state": "Tirana",
                "country": "Albania",
                "country_code": "AL",
                "phone": "not-e164",
            }
            resp = api.post(
                f"{API}/orders",
                headers=quick_auth,
                json={"address": address, "note": "outage test", "currency": "LEK"},
            )
            assert resp.status_code == 200, f"order must not fail on bad phone: {resp.status_code} {resp.text}"
            order_id = resp.json()["id"]
            time.sleep(1.5)

            got = api.get(f"{API}/orders/{order_id}", headers=quick_auth)
            assert got.status_code == 200
            persisted = got.json()
            nc = persisted.get("notification_customer") or {}
            assert nc.get("channel") == "invalid", f"expected invalid, got {nc}"
            assert nc.get("sent") is False
            # owner side should still attempt (valid E.164 owner phone)
            no = persisted.get("notification_owner") or {}
            assert "channel" in no
        finally:
            # restore phone
            if original_phone:
                asyncio.get_event_loop().run_until_complete(_set(original_phone))
            else:
                asyncio.get_event_loop().run_until_complete(_set(QUICK_PHONE))
