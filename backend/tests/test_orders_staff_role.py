"""Tests for orders-only staff role gating and admin role validation.

Verifies:
- Admin (+355690000001) login returns role='admin'; can hit all admin endpoints (200).
- Orders staff (+355690000002, +355690000003) login returns role='orders_staff';
  can hit orders endpoints (200) but blocked (403) on products/offers/shipping/dashboard.
- Order weight is present / computable; items include weight_grams.
- Google Maps URL helper equivalent is validated via order detail address fields.
"""
import os
from urllib.parse import quote_plus

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://bharat-app-8.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_PHONE = "+355690000001"
ADMIN_PW = "admin123"
STAFF_PHONES = ["+355690000002", "+355690000003"]
STAFF_PW = "admin#123"


def _login(phone: str, password: str):
    r = requests.post(f"{API}/admin/auth/login", json={"phone": phone, "password": password}, timeout=30)
    return r


@pytest.fixture(scope="module")
def admin_token():
    r = _login(ADMIN_PHONE, ADMIN_PW)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data.get("user", {}).get("role") == "admin", f"admin role mismatch: {data.get('user')}"
    assert data.get("user", {}).get("is_admin") is True
    return data["token"]


@pytest.fixture(scope="module", params=STAFF_PHONES)
def staff_token(request):
    phone = request.param
    r = _login(phone, STAFF_PW)
    assert r.status_code == 200, f"staff login failed for {phone}: {r.status_code} {r.text}"
    data = r.json()
    assert data.get("user", {}).get("role") == "orders_staff", f"staff role mismatch: {data.get('user')}"
    assert data.get("user", {}).get("is_admin") is True
    return data["token"]


def _h(tok: str):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- Admin: all 200 ----------
class TestFullAdmin:
    def test_admin_orders_list(self, admin_token):
        r = requests.get(f"{API}/admin/orders", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "orders" in body
        assert isinstance(body["orders"], list)

    def test_admin_products(self, admin_token):
        r = requests.get(f"{API}/admin/products", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200, r.text

    def test_admin_offers(self, admin_token):
        r = requests.get(f"{API}/admin/offers", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200, r.text

    def test_admin_shipping(self, admin_token):
        r = requests.get(f"{API}/admin/settings/shipping", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200, r.text

    def test_admin_dashboard(self, admin_token):
        r = requests.get(f"{API}/admin/dashboard/summary", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200, r.text


# ---------- Staff: orders OK, others 403 ----------
class TestOrdersStaff:
    def test_staff_orders_list(self, staff_token):
        r = requests.get(f"{API}/admin/orders", headers=_h(staff_token), timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "orders" in body

    def test_staff_order_detail_and_patch(self, staff_token):
        # Get list first
        r = requests.get(f"{API}/admin/orders?limit=5", headers=_h(staff_token), timeout=30)
        assert r.status_code == 200
        orders = r.json().get("orders", [])
        if not orders:
            pytest.skip("No existing orders to test detail/patch on")
        order_id = orders[0]["id"]
        # detail
        rd = requests.get(f"{API}/admin/orders/{order_id}", headers=_h(staff_token), timeout=30)
        assert rd.status_code == 200, rd.text
        detail = rd.json()
        assert detail["id"] == order_id
        # patch - set admin_note (safe, non-destructive)
        rp = requests.patch(
            f"{API}/admin/orders/{order_id}",
            headers=_h(staff_token),
            json={"admin_note": "TEST_staff_role_check"},
            timeout=30,
        )
        assert rp.status_code == 200, rp.text
        # verify persisted
        rv = requests.get(f"{API}/admin/orders/{order_id}", headers=_h(staff_token), timeout=30)
        assert rv.status_code == 200
        assert rv.json().get("admin_note") == "TEST_staff_role_check"

    def test_staff_products_forbidden(self, staff_token):
        r = requests.get(f"{API}/admin/products", headers=_h(staff_token), timeout=30)
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"

    def test_staff_offers_forbidden(self, staff_token):
        r = requests.get(f"{API}/admin/offers", headers=_h(staff_token), timeout=30)
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"

    def test_staff_shipping_forbidden(self, staff_token):
        r = requests.get(f"{API}/admin/settings/shipping", headers=_h(staff_token), timeout=30)
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"

    def test_staff_dashboard_forbidden(self, staff_token):
        r = requests.get(f"{API}/admin/dashboard/summary", headers=_h(staff_token), timeout=30)
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"


# ---------- Order weight + maps data ----------
class TestOrderWeightAndMaps:
    def test_order_weight_fields_present(self, admin_token):
        r = requests.get(f"{API}/admin/orders?limit=20", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200
        orders = r.json().get("orders", [])
        if not orders:
            pytest.skip("no orders present")
        # At least one order should allow computing weight (either shipping_weight_grams
        # or items[].weight_grams)
        computed_any = False
        for o in orders:
            total = o.get("shipping_weight_grams")
            if total and total > 0:
                computed_any = True
                break
            w = sum((it.get("weight_grams") or 0) * (it.get("qty") or 1) for it in (o.get("items") or []))
            if w > 0:
                computed_any = True
                break
        assert computed_any, "No order has shipping_weight_grams or item weight_grams"

    def test_order_detail_has_address_for_maps(self, admin_token):
        r = requests.get(f"{API}/admin/orders?limit=5", headers=_h(admin_token), timeout=30)
        orders = r.json().get("orders", [])
        if not orders:
            pytest.skip("no orders")
        rd = requests.get(f"{API}/admin/orders/{orders[0]['id']}", headers=_h(admin_token), timeout=30)
        assert rd.status_code == 200
        addr = rd.json().get("address") or {}
        # at minimum one of these should be present for a maps link to be meaningful
        has_coord = addr.get("lat") is not None and addr.get("lng") is not None
        has_text = any(addr.get(k) for k in ("line1", "city", "formatted_address"))
        assert has_coord or has_text, f"address lacks maps data: {addr}"
