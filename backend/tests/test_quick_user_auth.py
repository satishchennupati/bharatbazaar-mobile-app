"""Tests for the whitelisted quick-access user (+355 695808480 / 123456).

Covers:
- check-phone returns exists=true (routes to password step, NOT OTP)
- login with correct password succeeds and returns valid JWT + user
- login with wrong password fails
- authenticated calls: /api/me, /api/cart (GET + POST), /api/orders (POST COD)
- seed idempotency across backend restart
"""
import os
import subprocess
import time

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

QUICK_PHONE = "+355695808480"
QUICK_PW = "123456"
QUICK_USER_ID = "quick-user-001"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def token(s):
    r = s.post(f"{API}/auth/login", json={"phone": QUICK_PHONE, "password": QUICK_PW})
    assert r.status_code == 200, r.text
    return r.json()["token"]


class TestQuickUserCheckPhone:
    def test_check_phone_exists(self, s):
        r = s.post(f"{API}/auth/check-phone", json={"phone": QUICK_PHONE})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("exists") is True, f"Expected exists=true so client goes to password step, got {body}"
        assert body.get("phone") == QUICK_PHONE


class TestQuickUserLogin:
    def test_login_success(self, s):
        r = s.post(f"{API}/auth/login", json={"phone": QUICK_PHONE, "password": QUICK_PW})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("token"), "Missing JWT token"
        u = body.get("user", {})
        assert u.get("id") == QUICK_USER_ID, f"Expected user id {QUICK_USER_ID}, got {u.get('id')}"
        assert u.get("phone") == QUICK_PHONE
        assert "password_hash" not in u
        assert "_id" not in u

    def test_login_wrong_password(self, s):
        r = s.post(f"{API}/auth/login", json={"phone": QUICK_PHONE, "password": "wrongpw"})
        assert r.status_code in (400, 401), r.text


class TestAuthenticatedCalls:
    def test_me(self, s, token):
        r = s.get(f"{API}/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, r.text
        u = r.json()
        assert u.get("id") == QUICK_USER_ID
        assert u.get("phone") == QUICK_PHONE
        assert "password_hash" not in u
        assert "_id" not in u

    def test_get_cart(self, s, token):
        r = s.get(f"{API}/cart", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body

    def test_add_to_cart(self, s, token):
        # Pick a real product id from /api/products
        r = s.get(f"{API}/products")
        assert r.status_code == 200, r.text
        products = r.json()
        assert len(products) > 0, "No products available to add to cart"
        pid = products[0]["id"]

        r = s.post(
            f"{API}/cart",
            headers={"Authorization": f"Bearer {token}"},
            json={"product_id": pid, "qty": 2},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert any(it["product_id"] == pid for it in body.get("items", [])), body

        # GET verifies persistence
        r2 = s.get(f"{API}/cart", headers={"Authorization": f"Bearer {token}"})
        assert r2.status_code == 200
        assert any(it["product_id"] == pid for it in r2.json().get("items", []))

    def test_place_cod_order(self, s, token):
        # Ensure at least one item in cart
        r = s.get(f"{API}/products")
        pid = r.json()[0]["id"]
        s.post(
            f"{API}/cart",
            headers={"Authorization": f"Bearer {token}"},
            json={"product_id": pid, "qty": 1},
        )

        payload = {
            "address": {
                "label": "Home",
                "line1": "Rruga Test 5",
                "city": "Tirana",
                "postal_code": "1001",
                "country": "Albania",
                "phone": QUICK_PHONE,
            },
            "note": "TEST order",
            "currency": "LEK",
        }
        r = s.post(f"{API}/orders", headers={"Authorization": f"Bearer {token}"}, json=payload)
        assert r.status_code == 200, r.text
        order = r.json()
        assert order.get("id", "").startswith("MBC"), order
        assert order.get("payment_method") == "COD"
        assert order.get("user_id") == QUICK_USER_ID
        assert order.get("total_lek") is not None
        assert "_id" not in order


class TestSeedIdempotency:
    def test_login_still_works_after_backend_restart(self, s):
        # Baseline
        r0 = s.post(f"{API}/auth/login", json={"phone": QUICK_PHONE, "password": QUICK_PW})
        assert r0.status_code == 200, r0.text

        # Restart backend
        subprocess.run(["sudo", "supervisorctl", "restart", "backend"], check=True, timeout=30)

        # Wait for backend to come back up
        deadline = time.time() + 30
        while time.time() < deadline:
            try:
                h = s.get(f"{API}/health", timeout=3)
                if h.status_code == 200:
                    break
            except Exception:
                pass
            time.sleep(1)
        else:
            pytest.fail("Backend did not come back up after restart")

        # Login should still work with same password (seed force-resets)
        r = s.post(f"{API}/auth/login", json={"phone": QUICK_PHONE, "password": QUICK_PW})
        assert r.status_code == 200, r.text
        assert r.json()["user"]["id"] == QUICK_USER_ID
