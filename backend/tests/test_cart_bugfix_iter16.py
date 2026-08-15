"""
Iter 16 regression tests focused on the cart bug fix:
- Cart CRUD for quick-user (add/patch/delete)
- Auth guard (missing/invalid tokens should return 401)
- Existing regression: health, categories, products, product-by-id,
  admin login, offers banners, coupon validate, geo reverse-geocode.
- End-to-end order flow with WELCOME10 coupon.
"""
import os
import time
import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")  # public URL
API = f"{BASE}/api"

CUSTOMER_PHONE = "+355695808480"
CUSTOMER_PASSWORD = "123456"
ADMIN_PHONE = "+355690000001"
ADMIN_PASSWORD = "admin123"


# ---- Fixtures ----
@pytest.fixture(scope="session")
def customer_token():
    r = requests.post(f"{API}/auth/login", json={"phone": CUSTOMER_PHONE, "password": CUSTOMER_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"customer login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/admin/auth/login", json={"phone": ADMIN_PHONE, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def sample_product():
    r = requests.get(f"{API}/products?limit=20", timeout=15)
    assert r.status_code == 200
    prods = r.json()
    assert isinstance(prods, list) and len(prods) > 0
    # pick one with stock > 0
    prod = next((p for p in prods if p.get("in_stock", True)), prods[0])
    return prod


# ---- Health / catalog ----
def test_health():
    r = requests.get(f"{API}/health", timeout=10)
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


def test_categories():
    r = requests.get(f"{API}/categories", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) > 0
    assert "slug" in data[0] and "name" in data[0]


def test_products_list():
    r = requests.get(f"{API}/products?limit=5", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) > 0
    assert "id" in data[0] and "price_lek" in data[0]


def test_product_by_id(sample_product):
    pid = sample_product["id"]
    r = requests.get(f"{API}/products/{pid}", timeout=10)
    assert r.status_code == 200
    assert r.json()["id"] == pid


# ---- Auth guard on cart ----
def test_cart_get_requires_auth():
    r = requests.get(f"{API}/cart", timeout=10)
    assert r.status_code == 401, f"expected 401, got {r.status_code}"


def test_cart_add_requires_auth(sample_product):
    r = requests.post(f"{API}/cart", json={"product_id": sample_product["id"], "qty": 1}, timeout=10)
    assert r.status_code == 401


def test_cart_add_invalid_token(sample_product):
    r = requests.post(
        f"{API}/cart",
        json={"product_id": sample_product["id"], "qty": 1},
        headers={"Authorization": "Bearer garbage.token.value"},
        timeout=10,
    )
    assert r.status_code in (401, 403), f"expected 401/403 for bad token, got {r.status_code} {r.text}"


# ---- Cart CRUD (happy path) ----
class TestCartCRUD:
    def test_full_cart_flow(self, customer_token, sample_product):
        h = {"Authorization": f"Bearer {customer_token}"}
        pid = sample_product["id"]

        # cleanup any pre-existing entry for this product
        requests.delete(f"{API}/cart/{pid}", headers=h, timeout=10)

        # ADD
        r = requests.post(f"{API}/cart", json={"product_id": pid, "qty": 1}, headers=h, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body and "count" in body
        item = next((it for it in body["items"] if it["product_id"] == pid), None)
        assert item is not None, "added item missing from response"
        assert item["qty"] >= 1
        assert body["count"] >= 1

        # GET (verify persistence)
        r = requests.get(f"{API}/cart", headers=h, timeout=10)
        assert r.status_code == 200
        got = r.json()
        assert any(it["product_id"] == pid for it in got["items"])

        # PATCH qty=3
        r = requests.patch(f"{API}/cart/{pid}", json={"qty": 3}, headers=h, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        item = next((it for it in body["items"] if it["product_id"] == pid), None)
        assert item is not None and item["qty"] == 3

        # DELETE
        r = requests.delete(f"{API}/cart/{pid}", headers=h, timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert not any(it["product_id"] == pid for it in body["items"])

    def test_patch_zero_qty_removes_item(self, customer_token, sample_product):
        h = {"Authorization": f"Bearer {customer_token}"}
        pid = sample_product["id"]
        requests.post(f"{API}/cart", json={"product_id": pid, "qty": 2}, headers=h, timeout=10)
        r = requests.patch(f"{API}/cart/{pid}", json={"qty": 0}, headers=h, timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert not any(it["product_id"] == pid for it in body["items"])


# ---- Offers ----
def test_offers_banners():
    r = requests.get(f"{API}/offers/banners", timeout=10)
    assert r.status_code == 200
    data = r.json()
    # banners can be dict{items:[]} or list
    items = data if isinstance(data, list) else data.get("banners") or data.get("items") or []
    assert isinstance(items, list) and len(items) > 0, f"expected banners, got {data!r}"


def test_validate_coupon_welcome10(customer_token):
    """WELCOME10 validate endpoint reachable. If quick-user already redeemed it,
    the endpoint still responds 200 with valid=False and a helpful message —
    that is correct behaviour (one-per-user coupon).
    """
    h = {"Authorization": f"Bearer {customer_token}"}
    r = requests.post(
        f"{API}/offers/validate-coupon",
        json={"code": "WELCOME10", "subtotal_lek": 1500},
        headers=h,
        timeout=10,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "valid" in body and "discount_lek" in body, f"malformed response: {body}"
    if body["valid"] is False:
        assert body.get("message"), "invalid coupon should include a message"
    else:
        assert body["discount_lek"] > 0


# ---- Geo ----
def test_reverse_geocode():
    r = requests.get(f"{API}/geo/reverse-geocode?lat=41.3275&lng=19.8189", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    for f in ("line1", "area", "city", "state", "postal_code"):
        assert f in body, f"missing field '{f}' in reverse-geocode response: {body}"


# ---- Admin ----
def test_admin_verify(admin_token):
    r = requests.get(f"{API}/admin/verify", headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
    assert r.status_code == 200
    assert r.json().get("user", {}).get("is_admin") is True


def test_admin_orders_list(admin_token):
    r = requests.get(f"{API}/admin/orders", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else data.get("orders") or data.get("items") or []
    assert isinstance(items, list)


def test_admin_offers_list(admin_token):
    r = requests.get(f"{API}/admin/offers", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else data.get("offers") or data.get("items") or []
    assert isinstance(items, list)


# ---- E2E order with coupon ----
def _pick_high_value_products():
    """Pick items so subtotal >= 1000 LEK."""
    r = requests.get(f"{API}/products?limit=40", timeout=10)
    assert r.status_code == 200
    prods = [p for p in r.json() if p.get("in_stock", True) and p.get("price_lek", 0) > 0]
    prods.sort(key=lambda p: -p["price_lek"])
    return prods[:3]


def test_place_order_with_welcome10(customer_token):
    """End-to-end order placement. Tries WELCOME10 first; if quick-user has
    already redeemed it (very likely in a shared test env), retries without
    the coupon so we still validate the /api/orders path itself.
    """
    h = {"Authorization": f"Bearer {customer_token}"}
    picks = _pick_high_value_products()
    assert len(picks) >= 1

    # Clean & seed cart
    r = requests.get(f"{API}/cart", headers=h, timeout=10)
    for it in (r.json().get("items") or []):
        requests.delete(f"{API}/cart/{it['product_id']}", headers=h, timeout=10)

    subtotal = 0
    for p in picks:
        qty = max(1, int(1200 // max(1, p["price_lek"])) + 1)
        rr = requests.post(f"{API}/cart", json={"product_id": p["id"], "qty": qty}, headers=h, timeout=10)
        assert rr.status_code == 200
        subtotal = rr.json().get("subtotal_lek", subtotal)
        if subtotal >= 1500:
            break
    assert subtotal >= 1000, f"failed to build cart >= 1000 LEK (got {subtotal})"

    base_payload = {
        "address": {
            "line1": "TEST Rruga e Kavajës 1",
            "area": "Njësia 5",
            "city": "Tiranë",
            "state": "Tirana County",
            "postal_code": "1001",
            "country": "Albania",
            "country_code": "AL",
            "lat": 41.3275,
            "lng": 19.8189,
            "phone": CUSTOMER_PHONE,
            "formatted_address": "Rruga e Kavajës 1, Tiranë",
        },
        "payment_method": "COD",
        "currency": "LEK",
    }
    payload = {**base_payload, "coupon_code": "WELCOME10"}
    r = requests.post(f"{API}/orders", json=payload, headers=h, timeout=20)
    if r.status_code == 400 and "already used" in r.text.lower():
        # Retry without coupon — validates the core order path
        r = requests.post(f"{API}/orders", json=base_payload, headers=h, timeout=20)
    assert r.status_code in (200, 201), f"place order failed: {r.status_code} {r.text}"
    order = r.json()
    assert "id" in order
    assert order.get("total_lek", 0) > 0


# ---- Forgot / register OTP smoke (roundtrip) ----
def test_forgot_password_otp_roundtrip():
    """/api/auth/forgot-password/send-otp (whitelisted phone gets dev_code back)."""
    r = requests.post(f"{API}/auth/forgot-password/send-otp", json={"phone": CUSTOMER_PHONE}, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True or "otp" in body or "sent" in body or "dev_code" in body, body
