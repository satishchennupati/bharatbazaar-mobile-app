"""
Iteration 15 regression tests for two mobile-app bug fixes:
  BUG 1 — Orders tab must show what was ordered (items[] array with names/qty).
  BUG 2 — Address-picker must be able to reverse-geocode + expose 5 editable
          field values (line1, area, city, state, postal_code) from the
          `/api/geo/reverse-geocode` response.

These fixes are pure frontend, so backend regression only needs to verify the
underlying endpoints still return the payloads the UI depends on.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://bharat-app-8.preview.emergentagent.com").rstrip("/")
CUSTOMER_PHONE = "+355695808480"
CUSTOMER_PW = "123456"
ADMIN_PHONE = "+355690000001"
ADMIN_PW = "admin123"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def customer_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"phone": CUSTOMER_PHONE, "password": CUSTOMER_PW},
        timeout=15,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def customer_headers(customer_token):
    return {"Authorization": f"Bearer {customer_token}"}


# ---------- Basic health ----------
def test_health():
    r = requests.get(f"{BASE_URL}/api/health", timeout=10)
    assert r.status_code == 200


# ---------- Auth regression ----------
def test_customer_login():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"phone": CUSTOMER_PHONE, "password": CUSTOMER_PW},
        timeout=15,
    )
    assert r.status_code == 200
    data = r.json()
    assert "token" in data and "user" in data


def test_admin_login():
    r = requests.post(
        f"{BASE_URL}/api/admin/auth/login",
        json={"phone": ADMIN_PHONE, "password": ADMIN_PW},
        timeout=15,
    )
    assert r.status_code == 200
    assert r.json()["user"].get("is_admin") is True


# ---------- BUG 1 — Orders contract ----------
class TestOrdersItemsContract:
    """`/api/orders` (customer scope) must return items[] with name+qty for
    each order so the Orders tab can render the expanded item list."""

    def test_orders_endpoint_returns_list(self, customer_headers):
        r = requests.get(f"{BASE_URL}/api/orders", headers=customer_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list), f"expected list, got {type(data)}"

    def test_orders_have_items_array_with_required_fields(self, customer_headers):
        r = requests.get(f"{BASE_URL}/api/orders", headers=customer_headers, timeout=15)
        assert r.status_code == 200
        orders = r.json()
        if not orders:
            pytest.skip("customer has no orders in this env — cannot validate items contract")

        top = orders[0]
        # Header fields the UI card needs.
        for key in ("id", "status", "placed_at", "items", "total_lek", "payment_method"):
            assert key in top, f"missing top-level order key: {key}"

        assert isinstance(top["items"], list), "items must be a list"
        assert len(top["items"]) > 0, "top order has zero items — UI would show 'N items' with empty details"

        # Every item must have the fields the expanded card renders.
        for it in top["items"]:
            for key in ("product_id", "name", "qty", "line_lek"):
                assert key in it, f"item missing required key: {key}. Item: {it}"
            assert isinstance(it["qty"], int) and it["qty"] > 0

    def test_orders_have_address_block(self, customer_headers):
        r = requests.get(f"{BASE_URL}/api/orders", headers=customer_headers, timeout=15)
        orders = r.json()
        if not orders:
            pytest.skip("no orders")
        top = orders[0]
        assert "address" in top, "order missing address block for the expanded card"
        # At minimum a formatted_address or line1 should exist.
        addr = top["address"] or {}
        assert any(addr.get(k) for k in ("formatted_address", "line1", "city")), (
            f"address block is essentially empty: {addr}"
        )

    def test_orders_price_breakdown_fields(self, customer_headers):
        r = requests.get(f"{BASE_URL}/api/orders", headers=customer_headers, timeout=15)
        orders = r.json()
        if not orders:
            pytest.skip("no orders")
        top = orders[0]
        for key in ("subtotal_lek", "delivery_fee_lek", "total_lek"):
            assert key in top, f"missing price field: {key}"


# ---------- BUG 2 — Geo endpoints powering the picker ----------
class TestGeoEndpoints:
    ALBANIA_TIRANA = (41.3275, 19.8187)

    def test_reverse_geocode_returns_editable_fields(self):
        lat, lng = self.ALBANIA_TIRANA
        r = requests.get(
            f"{BASE_URL}/api/geo/reverse-geocode",
            params={"lat": lat, "lng": lng},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # The 5 fields the address-picker binds to its editable inputs.
        for key in ("line1", "area", "city", "state", "postal_code"):
            assert key in data, (
                f"reverse-geocode missing field '{key}' — address-picker edit "
                f"field cannot auto-populate. Payload: {data}"
            )
        # It must also flag serviceability so the CTA can enable.
        assert "serviceable" in data
        # And formatted_address for the summary line.
        assert "formatted_address" in data

    def test_reverse_geocode_albania_is_serviceable(self):
        lat, lng = self.ALBANIA_TIRANA
        r = requests.get(
            f"{BASE_URL}/api/geo/reverse-geocode",
            params={"lat": lat, "lng": lng},
            timeout=15,
        )
        assert r.status_code == 200
        data = r.json()
        assert data.get("serviceable") is True, f"Tirana should be serviceable. Got: {data}"
        assert (data.get("country_code") or "").upper() == "AL"

    def test_map_picker_html_has_locate_and_gesture_strings(self):
        r = requests.get(f"{BASE_URL}/api/geo/map-picker", timeout=15)
        assert r.status_code == 200
        html = r.text
        # Regression: the HTML must still expose the locate button and greedy
        # gesture handling per the map-picker contract.
        assert "locate-btn" in html, "map-picker HTML missing locate-btn"
        assert "gestureHandling" in html and "greedy" in html, "map-picker HTML missing greedy gestureHandling"

    def test_autocomplete_endpoint_works(self):
        r = requests.get(
            f"{BASE_URL}/api/geo/autocomplete",
            params={"input": "Tirana"},
            timeout=15,
        )
        assert r.status_code == 200
        data = r.json()
        assert "predictions" in data
        assert isinstance(data["predictions"], list)
