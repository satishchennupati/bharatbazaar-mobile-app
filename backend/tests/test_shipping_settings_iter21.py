"""
Backend tests for Admin-configurable Shipping Settings (iteration 21).

Covers:
- GET  /api/admin/settings/shipping  (admin auth required)
- PUT  /api/admin/settings/shipping  (admin auth, partial updates, ge=0 validation)
- GET  /api/shipping-settings        (public read)
- POST /api/orders/shipping-quote    (zone-aware thresholds: Tirana vs Rest of Albania)
- POST /api/orders                   (no regression — quote_for_cart now async)
"""
from __future__ import annotations

import os
import pytest
import requests

BASE_URL = "https://bharat-app-8.preview.emergentagent.com"
API = BASE_URL.rstrip("/") + "/api"

ADMIN_PHONE = "+355690000001"
ADMIN_PASS = "admin123"
CUST_PHONE = "+355695808480"
CUST_PASS = "123456"

DEFAULTS = {
    "free_min_tirana_lek": 1000.0,
    "free_min_outside_lek": 2000.0,
    "base_tirana_lek": 200.0,
    "base_outside_lek": 300.0,
    "free_weight_kg": 2.0,
    "extra_per_kg_lek": 50.0,
}


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/admin/auth/login", json={"phone": ADMIN_PHONE, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def customer_token():
    r = requests.post(f"{API}/auth/login", json={"phone": CUST_PHONE, "password": CUST_PASS}, timeout=15)
    assert r.status_code == 200, f"customer login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture
def customer_headers(customer_token):
    return {"Authorization": f"Bearer {customer_token}", "Content-Type": "application/json"}


@pytest.fixture(autouse=True)
def reset_defaults_at_end(admin_token):
    """Guarantee defaults restored after every test, no matter what it does."""
    yield
    try:
        requests.put(
            f"{API}/admin/settings/shipping",
            json=DEFAULTS,
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            timeout=15,
        )
    except Exception:
        pass


# ---------- 1. Public GET ----------
class TestPublicShippingSettings:
    def test_public_get_returns_all_fields(self):
        r = requests.get(f"{API}/shipping-settings", timeout=15)
        assert r.status_code == 200
        data = r.json()
        for k, v in DEFAULTS.items():
            assert k in data, f"missing key {k}"
            assert float(data[k]) == float(v), f"{k} expected {v} got {data[k]}"


# ---------- 2. Admin GET ----------
class TestAdminGetShipping:
    def test_admin_get_ok(self, admin_headers):
        r = requests.get(f"{API}/admin/settings/shipping", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        for k in DEFAULTS:
            assert k in data

    def test_unauthenticated_rejected(self):
        r = requests.get(f"{API}/admin/settings/shipping", timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_non_admin_rejected(self, customer_headers):
        r = requests.get(f"{API}/admin/settings/shipping", headers=customer_headers, timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"


# ---------- 3. Admin PUT ----------
class TestAdminUpdateShipping:
    def test_partial_update_persists(self, admin_headers):
        # change only Tirana free threshold
        r = requests.put(
            f"{API}/admin/settings/shipping",
            json={"free_min_tirana_lek": 1234},
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert float(data["free_min_tirana_lek"]) == 1234.0
        # Others preserved
        assert float(data["free_min_outside_lek"]) == DEFAULTS["free_min_outside_lek"]

        # Verify via public GET
        r2 = requests.get(f"{API}/shipping-settings", timeout=15)
        assert r2.status_code == 200
        assert float(r2.json()["free_min_tirana_lek"]) == 1234.0

    def test_full_update(self, admin_headers):
        payload = {
            "free_min_tirana_lek": 900,
            "free_min_outside_lek": 1900,
            "base_tirana_lek": 250,
            "base_outside_lek": 350,
            "free_weight_kg": 3,
            "extra_per_kg_lek": 60,
        }
        r = requests.put(f"{API}/admin/settings/shipping", json=payload, headers=admin_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        for k, v in payload.items():
            assert float(data[k]) == float(v)

    def test_negative_values_rejected(self, admin_headers):
        r = requests.put(
            f"{API}/admin/settings/shipping",
            json={"base_tirana_lek": -10},
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text}"

    def test_non_admin_cannot_update(self, customer_headers):
        r = requests.put(
            f"{API}/admin/settings/shipping",
            json={"base_tirana_lek": 999},
            headers=customer_headers,
            timeout=15,
        )
        assert r.status_code in (401, 403)

    def test_unauthenticated_cannot_update(self):
        r = requests.put(
            f"{API}/admin/settings/shipping",
            json={"base_tirana_lek": 999},
            timeout=15,
        )
        assert r.status_code in (401, 403)


# ---------- 4. Zone-aware shipping quote ----------
def _add_product_to_cart(customer_headers):
    """Find 'Haldiram Bhujia 400g' @ 480 L and set qty=3 in the cart (=1440 L subtotal)."""
    # search product
    r = requests.get(f"{API}/products?q=Haldiram Bhujia", timeout=15)
    assert r.status_code == 200, r.text
    products = r.json()
    target = None
    for p in products:
        if "haldiram" in p["name"].lower() and ("400" in p.get("weight", "") or abs(p["price_lek"] - 480) < 1):
            target = p
            break
    if not target and products:
        # fallback: pick one ~480L
        for p in products:
            if abs(p["price_lek"] - 480) < 1:
                target = p
                break
    assert target is not None, f"Haldiram Bhujia 400g not found; got: {[p['name'] for p in products]}"

    # clear cart first
    cart = requests.get(f"{API}/cart", headers=customer_headers, timeout=15).json()
    for item in cart.get("items", []):
        requests.delete(f"{API}/cart/{item['product_id']}", headers=customer_headers, timeout=15)

    # Add qty=3
    r = requests.post(
        f"{API}/cart",
        json={"product_id": target["id"], "qty": 3},
        headers=customer_headers,
        timeout=15,
    )
    assert r.status_code == 200, r.text
    cart = r.json()
    return cart, target


class TestZoneAwareShippingQuote:
    def test_tirana_free_at_1440_outside_paid(self, customer_headers, admin_headers):
        # ensure defaults
        requests.put(f"{API}/admin/settings/shipping", json=DEFAULTS, headers=admin_headers, timeout=15)

        cart, target = _add_product_to_cart(customer_headers)
        subtotal = cart.get("subtotal_lek", 0)
        assert 900 <= subtotal <= 2000, f"Expected subtotal between thresholds, got {subtotal}"

        # Tirana
        r = requests.post(
            f"{API}/orders/shipping-quote",
            json={"address": {"city": "Tirana", "state": "Tirane", "country": "Albania", "country_code": "AL"}},
            headers=customer_headers,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        q = r.json()
        assert q["free_shipping"] is True, q
        assert q["fee_lek"] == 0
        assert q["zone"] == "tirana"
        assert float(q["free_threshold_lek"]) == 1000.0

        # Outside (Durres)
        r = requests.post(
            f"{API}/orders/shipping-quote",
            json={"address": {"city": "Durres", "state": "Durres", "country": "Albania", "country_code": "AL"}},
            headers=customer_headers,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        q = r.json()
        assert q["free_shipping"] is False, q
        assert q["zone"] == "outside"
        assert float(q["free_threshold_lek"]) == 2000.0
        assert q["fee_lek"] >= 300.0  # at least base

    def test_updating_settings_changes_quote(self, customer_headers, admin_headers):
        _add_product_to_cart(customer_headers)

        # Lower outside threshold to 100 → should become free in Durres
        r = requests.put(
            f"{API}/admin/settings/shipping",
            json={"free_min_outside_lek": 100},
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code == 200

        r = requests.post(
            f"{API}/orders/shipping-quote",
            json={"address": {"city": "Durres", "state": "Durres", "country": "Albania", "country_code": "AL"}},
            headers=customer_headers,
            timeout=15,
        )
        assert r.status_code == 200
        q = r.json()
        assert q["free_shipping"] is True, q
        assert float(q["free_threshold_lek"]) == 100.0
        assert q["fee_lek"] == 0

        # Raise Tirana threshold to 5000 → should NOT be free in Tirana
        r = requests.put(
            f"{API}/admin/settings/shipping",
            json={"free_min_tirana_lek": 5000},
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code == 200

        r = requests.post(
            f"{API}/orders/shipping-quote",
            json={"address": {"city": "Tirana", "state": "Tirane", "country": "Albania", "country_code": "AL"}},
            headers=customer_headers,
            timeout=15,
        )
        assert r.status_code == 200
        q = r.json()
        assert q["free_shipping"] is False
        assert float(q["free_threshold_lek"]) == 5000.0

    def test_base_fee_tirana_vs_outside_configurable(self, customer_headers, admin_headers):
        # Set thresholds very high so neither qualifies for free
        requests.put(
            f"{API}/admin/settings/shipping",
            json={"free_min_tirana_lek": 99999, "free_min_outside_lek": 99999,
                  "base_tirana_lek": 222, "base_outside_lek": 444},
            headers=admin_headers,
            timeout=15,
        )
        _add_product_to_cart(customer_headers)

        rt = requests.post(f"{API}/orders/shipping-quote",
                           json={"address": {"city": "Tirana", "country": "Albania", "country_code": "AL"}},
                           headers=customer_headers, timeout=15).json()
        ro = requests.post(f"{API}/orders/shipping-quote",
                           json={"address": {"city": "Durres", "country": "Albania", "country_code": "AL"}},
                           headers=customer_headers, timeout=15).json()
        assert float(rt["base_lek"]) == 222.0
        assert float(ro["base_lek"]) == 444.0


# ---------- 5. Place-order regression (async quote_for_cart) ----------
class TestPlaceOrderNoRegression:
    def test_place_order_with_tirana_address(self, customer_headers, admin_headers):
        # defaults
        requests.put(f"{API}/admin/settings/shipping", json=DEFAULTS, headers=admin_headers, timeout=15)
        _add_product_to_cart(customer_headers)

        payload = {
            "address": {
                "label": "Home",
                "line1": "Rr. Myslym Shyri 10",
                "city": "Tirana",
                "state": "Tirane",
                "area": "Lagjia 5",
                "country": "Albania",
                "country_code": "AL",
                "phone": "+355695808480",
            },
            "note": "TEST_order",
            "currency": "LEK",
        }
        r = requests.post(f"{API}/orders", json=payload, headers=customer_headers, timeout=20)
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["id"].startswith("MBC")
        assert o["shipping_zone"] == "tirana"
        assert o["delivery_fee_lek"] == 0  # 1440 L ≥ 1000 L → free in Tirana

    def test_place_order_outside_tirana_has_fee(self, customer_headers, admin_headers):
        requests.put(f"{API}/admin/settings/shipping", json=DEFAULTS, headers=admin_headers, timeout=15)
        _add_product_to_cart(customer_headers)

        payload = {
            "address": {
                "label": "Home",
                "line1": "Rr. Taulantia 5",
                "city": "Durres",
                "state": "Durres",
                "area": "Lagjia 1",
                "country": "Albania",
                "country_code": "AL",
                "phone": "+355695808480",
            },
            "note": "TEST_order_outside",
            "currency": "LEK",
        }
        r = requests.post(f"{API}/orders", json=payload, headers=customer_headers, timeout=20)
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["shipping_zone"] == "outside"
        assert o["delivery_fee_lek"] >= 300.0
