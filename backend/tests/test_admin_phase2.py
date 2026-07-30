"""Backend tests for Admin Phase 2: auth, verify, dashboard, orders CRUD/patch.

Covers:
- POST /api/admin/auth/login  (admin OK, non-admin 403)
- GET  /api/admin/verify      (no token 401, non-admin 403, admin 200)
- GET  /api/admin/dashboard/summary
- GET  /api/admin/orders (filters: status, q, limit)
- GET  /api/admin/orders/{id} (+ 404)
- PATCH /api/admin/orders/{id} (status transition + history, delivery person, admin_note,
  delivered_at, cancelled_at, invalid status 400)
- Non-admin bearer rejected with 403 on list / get / patch / dashboard
"""

import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://bharat-app-8.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_PHONE = "+355690000001"
ADMIN_PW = "admin123"
CUSTOMER_PHONE = "+355695808480"
CUSTOMER_PW = "123456"

ORDER_STATUSES = ["placed", "confirmed", "packed", "out_for_delivery", "delivered", "cancelled"]


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/admin/auth/login", json={"phone": ADMIN_PHONE, "password": ADMIN_PW}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    body = r.json()
    assert "token" in body and body["user"]["is_admin"] is True
    return body["token"]


@pytest.fixture(scope="module")
def customer_token():
    r = requests.post(f"{API}/auth/login", json={"phone": CUSTOMER_PHONE, "password": CUSTOMER_PW}, timeout=15)
    assert r.status_code == 200, f"customer login failed: {r.status_code} {r.text}"
    body = r.json()
    assert body["user"].get("is_admin") is not True
    return body["token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- /admin/auth/login ----------
class TestAdminLogin:
    def test_admin_login_success(self):
        r = requests.post(f"{API}/admin/auth/login", json={"phone": ADMIN_PHONE, "password": ADMIN_PW}, timeout=15)
        assert r.status_code == 200
        b = r.json()
        assert b["token"]
        assert b["user"]["is_admin"] is True

    def test_admin_login_rejects_non_admin(self):
        r = requests.post(
            f"{API}/admin/auth/login", json={"phone": CUSTOMER_PHONE, "password": CUSTOMER_PW}, timeout=15
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"


# ---------- /admin/verify ----------
class TestAdminVerify:
    def test_verify_no_token_401(self):
        r = requests.get(f"{API}/admin/verify", timeout=15)
        assert r.status_code == 401

    def test_verify_customer_403(self, customer_token):
        r = requests.get(f"{API}/admin/verify", headers=_h(customer_token), timeout=15)
        assert r.status_code == 403

    def test_verify_admin_200(self, admin_token):
        r = requests.get(f"{API}/admin/verify", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        b = r.json()
        assert b.get("ok") is True
        assert b["user"]["is_admin"] is True


# ---------- /admin/dashboard/summary ----------
class TestDashboardSummary:
    def test_summary_shape(self, admin_token):
        r = requests.get(f"{API}/admin/dashboard/summary", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        b = r.json()
        # numeric KPIs
        for k in ("today_orders", "today_revenue_lek", "pending_orders", "total_orders", "total_customers"):
            assert k in b, f"missing key {k}"
            assert isinstance(b[k], (int, float)), f"{k} not numeric"
        # status_breakdown contains all 6 canonical statuses
        assert isinstance(b["status_breakdown"], dict)
        for s in ORDER_STATUSES:
            assert s in b["status_breakdown"], f"status_breakdown missing {s}"
        # arrays
        assert isinstance(b["top_products"], list)
        assert isinstance(b["recent_orders"], list)
        assert len(b["recent_orders"]) <= 5
        # canonical statuses list
        assert b["order_statuses"] == ORDER_STATUSES

    def test_summary_requires_admin(self, customer_token):
        r = requests.get(f"{API}/admin/dashboard/summary", headers=_h(customer_token), timeout=15)
        assert r.status_code == 403


# ---------- /admin/orders ----------
class TestAdminOrdersList:
    def test_list_no_filter(self, admin_token):
        r = requests.get(f"{API}/admin/orders", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        b = r.json()
        assert "orders" in b and "count" in b
        assert isinstance(b["orders"], list)
        assert b["count"] == len(b["orders"])
        if b["orders"]:
            o = b["orders"][0]
            assert "customer_name" in o and "customer_phone" in o

    def test_list_filter_status_placed(self, admin_token):
        r = requests.get(f"{API}/admin/orders?status=placed", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        b = r.json()
        for o in b["orders"]:
            assert o.get("status") == "placed"

    def test_list_filter_phone_q(self, admin_token):
        # Search by a known customer phone digits (case-insensitive regex on address.phone/whatsapp/id)
        r = requests.get(f"{API}/admin/orders?q=695808480", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        b = r.json()
        assert b["count"] >= 0  # may be 0 if seeded orders don't have this phone in address
        for o in b["orders"]:
            hay = " ".join([
                str(o.get("id", "")),
                str(o.get("address", {}).get("phone", "")),
                str(o.get("address", {}).get("whatsapp", "")),
            ])
            assert "695808480" in hay

    def test_list_limit(self, admin_token):
        r = requests.get(f"{API}/admin/orders?limit=1", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        b = r.json()
        assert len(b["orders"]) <= 1

    def test_list_requires_admin(self, customer_token):
        r = requests.get(f"{API}/admin/orders", headers=_h(customer_token), timeout=15)
        assert r.status_code == 403


# ---------- /admin/orders/{id} ----------
class TestAdminOrderGet:
    def test_get_order_404(self, admin_token):
        r = requests.get(f"{API}/admin/orders/DOES_NOT_EXIST_XYZ", headers=_h(admin_token), timeout=15)
        assert r.status_code == 404

    def test_get_order_ok(self, admin_token):
        # find one order
        lst = requests.get(f"{API}/admin/orders?limit=1", headers=_h(admin_token)).json()
        if not lst["orders"]:
            pytest.skip("no orders in DB")
        oid = lst["orders"][0]["id"]
        r = requests.get(f"{API}/admin/orders/{oid}", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        o = r.json()
        assert o["id"] == oid
        # customer fields attached from users collection when user_id present
        if o.get("user_id"):
            assert "customer_name" in o
            assert "customer_phone" in o
            assert "customer_email" in o

    def test_get_order_requires_admin(self, customer_token, admin_token):
        lst = requests.get(f"{API}/admin/orders?limit=1", headers=_h(admin_token)).json()
        if not lst["orders"]:
            pytest.skip("no orders")
        oid = lst["orders"][0]["id"]
        r = requests.get(f"{API}/admin/orders/{oid}", headers=_h(customer_token), timeout=15)
        assert r.status_code == 403


# ---------- PATCH /admin/orders/{id} ----------
class TestAdminOrderPatch:
    @pytest.fixture(scope="class")
    def target_order_id(self, admin_token):
        # Prefer an order currently in 'placed' status for the transition test
        lst = requests.get(f"{API}/admin/orders?status=placed&limit=5", headers=_h(admin_token)).json()
        if lst["orders"]:
            return lst["orders"][0]["id"]
        # Fallback: any order (we'll reset it to placed first)
        lst = requests.get(f"{API}/admin/orders?limit=1", headers=_h(admin_token)).json()
        if not lst["orders"]:
            pytest.skip("no orders")
        oid = lst["orders"][0]["id"]
        requests.patch(f"{API}/admin/orders/{oid}", headers=_h(admin_token), json={"status": "placed"})
        return oid

    def test_invalid_status_400(self, admin_token, target_order_id):
        r = requests.patch(
            f"{API}/admin/orders/{target_order_id}",
            headers=_h(admin_token),
            json={"status": "foo"},
            timeout=15,
        )
        assert r.status_code == 400

    def test_status_transition_and_history(self, admin_token, target_order_id):
        # Snapshot history length before
        before = requests.get(f"{API}/admin/orders/{target_order_id}", headers=_h(admin_token)).json()
        prev_hist = before.get("status_history") or []
        prev_len = len(prev_hist)

        r = requests.patch(
            f"{API}/admin/orders/{target_order_id}",
            headers=_h(admin_token),
            json={"status": "confirmed"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "confirmed"
        hist = body.get("status_history") or []
        assert len(hist) == prev_len + 1
        last = hist[-1]
        assert last["status"] == "confirmed"
        assert last.get("by") == "admin-001"
        assert "at" in last

    def test_delivery_person_persist(self, admin_token, target_order_id):
        payload = {"delivery_person_name": "TEST_Rider", "delivery_person_phone": "+355700000000"}
        r = requests.patch(f"{API}/admin/orders/{target_order_id}", headers=_h(admin_token), json=payload, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["delivery_person_name"] == "TEST_Rider"
        assert body["delivery_person_phone"] == "+355700000000"
        # verify with GET
        got = requests.get(f"{API}/admin/orders/{target_order_id}", headers=_h(admin_token)).json()
        assert got["delivery_person_name"] == "TEST_Rider"
        assert got["delivery_person_phone"] == "+355700000000"

    def test_admin_note_persist(self, admin_token, target_order_id):
        r = requests.patch(
            f"{API}/admin/orders/{target_order_id}",
            headers=_h(admin_token),
            json={"admin_note": "TEST_internal_note_hello"},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["admin_note"] == "TEST_internal_note_hello"

    def test_delivered_sets_delivered_at(self, admin_token, target_order_id):
        r = requests.patch(
            f"{API}/admin/orders/{target_order_id}",
            headers=_h(admin_token),
            json={"status": "delivered"},
            timeout=15,
        )
        assert r.status_code == 200
        b = r.json()
        assert b["status"] == "delivered"
        assert b.get("delivered_at"), "delivered_at not set"

    def test_cancelled_sets_cancelled_at(self, admin_token, target_order_id):
        r = requests.patch(
            f"{API}/admin/orders/{target_order_id}",
            headers=_h(admin_token),
            json={"status": "cancelled"},
            timeout=15,
        )
        assert r.status_code == 200
        b = r.json()
        assert b["status"] == "cancelled"
        assert b.get("cancelled_at"), "cancelled_at not set"

    def test_patch_requires_admin(self, customer_token, admin_token, target_order_id):
        r = requests.patch(
            f"{API}/admin/orders/{target_order_id}",
            headers=_h(customer_token),
            json={"status": "placed"},
            timeout=15,
        )
        assert r.status_code == 403

    def test_reset_to_placed_cleanup(self, admin_token, target_order_id):
        # Restore the seed order so subsequent frontend tests still have a 'placed' order
        r = requests.patch(
            f"{API}/admin/orders/{target_order_id}",
            headers=_h(admin_token),
            json={"status": "placed"},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "placed"
