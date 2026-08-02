"""Iteration 11 — Bug-fix backend tests.

Covers:
- BUG 2 map-picker HTML additions: locate-btn, requestLocation, greedy gesture,
  fly-to postMessage handler.
- Regression: reverse-geocode Albania -> serviceable=True, Paris -> False.
- Regression: /categories, /products, /offers/banners, /health.
- Quick-user auth login (needed for cart flow used by FloatingCartBar).
- Cart CRUD (needed by FloatingCartBar subtotal fetch).
"""
import os
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://bharat-app-8.preview.emergentagent.com",
).rstrip("/")

QUICK_PHONE = "+355695808480"
QUICK_PASS = "123456"


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Accept": "*/*", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def quick_user_token(api_client):
    r = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"phone": QUICK_PHONE, "password": QUICK_PASS},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    assert "token" in data and data["token"], data
    return data["token"]


# ============================================================================
# BUG 2 — Map picker HTML new features
# ============================================================================
class TestMapPickerLocateFeatures:
    def test_locate_btn_and_request_location_present(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/geo/map-picker", timeout=30)
        assert r.status_code == 200
        body = r.text
        # Required tokens from problem statement
        assert "locate-btn" in body, "locate-btn CSS/id must be present"
        assert "requestLocation" in body, "requestLocation js function must be present"
        assert "gestureHandling: 'greedy'" in body, "gestureHandling: 'greedy' must be present"
        assert "fly-to" in body, "fly-to postMessage handler must be present"

    def test_request_locate_message_handler_present(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/geo/map-picker", timeout=30)
        body = r.text
        assert "request-locate" in body, "host-driven 'request-locate' handler must be present"

    def test_auto_geolocation_on_load(self, api_client):
        """600ms delayed auto-request of current position should be present."""
        r = api_client.get(f"{BASE_URL}/api/geo/map-picker", timeout=30)
        body = r.text
        # Auto-request block: setTimeout(function(){ requestLocation(false); }, 600)
        assert "getCurrentPosition" in body
        # A setTimeout of 600 that calls requestLocation
        assert "600" in body

    def test_locate_button_svg_and_aria(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/geo/map-picker", timeout=30)
        body = r.text
        assert "aria-label='Use my location'" in body or 'aria-label="Use my location"' in body


# ============================================================================
# Regression — geo APIs
# ============================================================================
class TestGeoRegression:
    def test_reverse_geocode_albania_serviceable(self, api_client):
        r = api_client.get(
            f"{BASE_URL}/api/geo/reverse-geocode",
            params={"lat": 41.3275, "lng": 19.8187},
            timeout=30,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["serviceable"] is True
        assert data["country_code"] == "AL"

    def test_reverse_geocode_paris_unserviceable(self, api_client):
        r = api_client.get(
            f"{BASE_URL}/api/geo/reverse-geocode",
            params={"lat": 48.8566, "lng": 2.3522},
            timeout=30,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["serviceable"] is False

    def test_autocomplete_returns_predictions(self, api_client):
        r = api_client.get(
            f"{BASE_URL}/api/geo/autocomplete",
            params={"input": "Tirana", "country": "al"},
            timeout=30,
        )
        assert r.status_code == 200
        data = r.json()
        assert "predictions" in data
        assert isinstance(data["predictions"], list)


# ============================================================================
# Regression — core endpoints used by category screen + FloatingCartBar
# ============================================================================
class TestCoreEndpoints:
    def test_health(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/health", timeout=30)
        assert r.status_code == 200

    def test_categories_list(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/categories", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        # Expect at least one category with slug (used by /category/[slug])
        slugs = [c.get("slug") for c in data if isinstance(c, dict)]
        assert any(s for s in slugs), f"no category slugs found: {slugs[:5]}"

    def test_products_by_category(self, api_client):
        # Get first available category slug from the API
        r = api_client.get(f"{BASE_URL}/api/categories", timeout=30)
        cats = r.json()
        slug = next((c["slug"] for c in cats if c.get("slug")), None)
        assert slug, "no category slug available"
        r2 = api_client.get(f"{BASE_URL}/api/products", params={"category": slug}, timeout=30)
        assert r2.status_code == 200
        items = r2.json()
        assert isinstance(items, list)

    def test_offers_banners(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/offers/banners", timeout=30)
        assert r.status_code == 200


# ============================================================================
# Cart CRUD — required for FloatingCartBar to show subtotal
# ============================================================================
class TestCartFlowForFloatingBar:
    def test_cart_add_get_and_totals(self, api_client, quick_user_token):
        headers = {"Authorization": f"Bearer {quick_user_token}"}
        # Fetch a product
        products = api_client.get(f"{BASE_URL}/api/products", timeout=30).json()
        assert isinstance(products, list) and products, "no products"
        pid = products[0]["id"]

        # Clear cart first if the API supports it — otherwise just add and inspect count
        # Add to cart
        add = api_client.post(
            f"{BASE_URL}/api/cart",
            json={"product_id": pid, "qty": 1},
            headers=headers,
            timeout=30,
        )
        assert add.status_code == 200, f"cart add: {add.status_code} {add.text[:200]}"
        add_data = add.json()
        assert "items" in add_data and "count" in add_data, add_data
        assert add_data["count"] >= 1

        # GET /cart should now expose subtotal_lek / subtotal_eur (used by FloatingCartBar)
        get = api_client.get(f"{BASE_URL}/api/cart", headers=headers, timeout=30)
        assert get.status_code == 200
        cart = get.json()
        assert "items" in cart
        assert "subtotal_lek" in cart, f"subtotal_lek missing: {list(cart.keys())}"
        assert "subtotal_eur" in cart, f"subtotal_eur missing: {list(cart.keys())}"
        assert isinstance(cart["subtotal_lek"], (int, float))
        assert cart["subtotal_lek"] >= 0

        # Cleanup — set qty=0 on the item we just added
        try:
            api_client.patch(
                f"{BASE_URL}/api/cart/{pid}",
                json={"qty": 0},
                headers=headers,
                timeout=30,
            )
        except Exception:
            pass


# ============================================================================
# Auth — quick user login (Bug 1 UI flow depends on it)
# ============================================================================
class TestQuickUserAuth:
    def test_login_ok(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={"phone": QUICK_PHONE, "password": QUICK_PASS},
            timeout=30,
        )
        assert r.status_code == 200
        data = r.json()
        assert data.get("token")
        assert data.get("user", {}).get("phone") == QUICK_PHONE
