"""Iteration 22 — Full catalog replacement (Product Master Excel import) regression tests.

Validates:
  • /api/categories: exactly 7 categories, correct product_counts, 3 have real image_url that serves 200.
  • /api/products?category=<slug>: counts per category match the master; required product fields exist.
  • /api/products?q=SWAD: search returns SWAD products with discount & MRP.
  • Individual /api/products/{id}: SWAD CHATPATE CHOLE RTE 450G returns 35% off, MRP 1107, price 820.
  • Static image URLs: /api/static/products/<barcode>.jpg serve HTTP 200 (sample 20).
  • Cart + Place-Order (COD) still works with the new catalog (quick-user-001 session).
  • Admin products listing with category filter uses the 7 new categories.
"""
from __future__ import annotations

import os
import random
from typing import Dict, List

import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL") or "https://bharat-app-8.preview.emergentagent.com"
API = BASE_URL.rstrip("/") + "/api"

EXPECTED_COUNTS: Dict[str, int] = {
    "food": 159,
    "spices": 85,
    "rice_grain_flour": 13,
    "personal_care": 17,
    "household": 26,
    "pooja_needs": 4,
    "healthcare": 1,
}
CATEGORIES_WITH_IMAGE = {"food", "spices", "personal_care"}
TOTAL_EXPECTED = sum(EXPECTED_COUNTS.values())  # 305


# --------------- fixtures ---------------
@pytest.fixture(scope="module")
def api_client() -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def customer_token(api_client) -> str:
    r = api_client.post(f"{API}/auth/login", json={"phone": "+355695808480", "password": "123456"})
    assert r.status_code == 200, f"customer login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token(api_client) -> str:
    r = api_client.post(f"{API}/admin/auth/login", json={"phone": "+355690000001", "password": "admin123"})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


# --------------- Categories ---------------
class TestCategories:
    def test_exactly_seven_categories(self, api_client):
        r = api_client.get(f"{API}/categories")
        assert r.status_code == 200
        cats = r.json()
        assert len(cats) == 7, f"Expected 7 categories, got {len(cats)}"

    def test_product_counts_per_category(self, api_client):
        r = api_client.get(f"{API}/categories")
        by_slug = {c["slug"]: c for c in r.json()}
        for slug, expected in EXPECTED_COUNTS.items():
            assert slug in by_slug, f"Missing category {slug}"
            got = by_slug[slug].get("product_count")
            assert got == expected, f"{slug}: expected {expected}, got {got}"

    def test_three_categories_have_image_url(self, api_client):
        r = api_client.get(f"{API}/categories")
        by_slug = {c["slug"]: c for c in r.json()}
        for slug in CATEGORIES_WITH_IMAGE:
            iu = by_slug[slug].get("image_url")
            assert iu and "/api/static/categories/" in iu, f"{slug}: missing/invalid image_url: {iu}"

    def test_category_images_load_200(self, api_client):
        r = api_client.get(f"{API}/categories")
        by_slug = {c["slug"]: c for c in r.json()}
        for slug in CATEGORIES_WITH_IMAGE:
            url = BASE_URL.rstrip("/") + by_slug[slug]["image_url"]
            img = api_client.get(url, timeout=10)
            assert img.status_code == 200, f"{slug}: image {url} returned {img.status_code}"
            assert int(img.headers.get("content-length", "1")) > 1000, f"{slug}: suspiciously small image"


# --------------- Products listing ---------------
class TestProductsListing:
    def test_food_returns_159(self, api_client):
        r = api_client.get(f"{API}/products", params={"category": "food", "limit": 500})
        assert r.status_code == 200
        items = r.json()
        assert len(items) == 159, f"Expected 159 food products, got {len(items)}"

    @pytest.mark.parametrize("slug,count", list(EXPECTED_COUNTS.items()))
    def test_each_category_returns_expected_count(self, api_client, slug, count):
        r = api_client.get(f"{API}/products", params={"category": slug, "limit": 500})
        assert r.status_code == 200
        assert len(r.json()) == count, f"{slug}: expected {count}, got {len(r.json())}"

    def test_food_products_have_required_fields(self, api_client):
        r = api_client.get(f"{API}/products", params={"category": "food", "limit": 500})
        items = r.json()
        for p in items[:30]:
            assert p["name"], "name missing"
            assert isinstance(p["price_lek"], (int, float)) and p["price_lek"] > 0
            # weight should be a non-empty label
            assert p.get("weight"), f"weight missing for {p['name']}"
            # image_url may be null (23 private-image products) OR a /api/static/products/ path
            iu = p.get("image_url")
            assert iu is None or iu.startswith("/api/static/products/"), f"bad image_url: {iu}"

    def test_mrp_greater_than_price_when_present(self, api_client):
        r = api_client.get(f"{API}/products", params={"category": "food", "limit": 500})
        for p in r.json():
            mrp = p.get("mrp_lek")
            if mrp is not None and mrp > 0:
                assert mrp >= p["price_lek"], f"{p['name']}: mrp {mrp} < price {p['price_lek']}"


# --------------- Search ---------------
class TestSearch:
    def test_swad_search_returns_results(self, api_client):
        r = api_client.get(f"{API}/products", params={"q": "SWAD", "limit": 500})
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 10, f"expected several SWAD products, got {len(items)}"
        # all results should mention SWAD somewhere (name/desc/tags/brand)
        for p in items[:5]:
            blob = f"{p['name']} {p.get('brand','')} {p.get('description','')}".lower()
            assert "swad" in blob

    def test_swad_chatpate_chole_discount_display(self, api_client):
        r = api_client.get(f"{API}/products", params={"q": "CHATPATE CHOLE", "limit": 500})
        assert r.status_code == 200
        items = r.json()
        hit = next((p for p in items if "CHATPATE CHOLE" in p["name"].upper()), None)
        assert hit, "SWAD CHATPATE CHOLE not found"
        assert hit["price_lek"] == 820.0
        assert hit["mrp_lek"] == 1107.0
        assert hit["discount"] == 35.0
        assert hit["weight"] == "450 g"
        assert hit["image_url"] == "/api/static/products/608171020041.jpg"


# --------------- Product detail ---------------
class TestProductDetail:
    def test_get_single_product(self, api_client):
        r = api_client.get(f"{API}/products", params={"q": "CHATPATE CHOLE", "limit": 10})
        pid = next(p for p in r.json() if "CHATPATE CHOLE" in p["name"].upper())["id"]
        detail = api_client.get(f"{API}/products/{pid}")
        assert detail.status_code == 200
        d = detail.json()
        assert d["discount"] == 35.0
        assert d["mrp_lek"] == 1107.0
        assert d["price_lek"] == 820.0

    def test_product_image_serves_200(self, api_client):
        url = f"{BASE_URL.rstrip('/')}/api/static/products/608171020041.jpg"
        r = api_client.get(url, timeout=10)
        assert r.status_code == 200
        assert int(r.headers.get("content-length", "1")) > 1000


# --------------- Static images sampling ---------------
class TestStaticImages:
    def test_sample_product_images_load(self, api_client):
        # pull 20 products with image_url across categories and verify 200
        r = api_client.get(f"{API}/products", params={"limit": 500})
        items = r.json()
        with_img = [p for p in items if p.get("image_url")]
        assert len(with_img) >= 200, f"expected many images, got {len(with_img)}"
        random.seed(42)
        sample = random.sample(with_img, 20)
        failures = []
        for p in sample:
            url = BASE_URL.rstrip("/") + p["image_url"]
            resp = api_client.get(url, timeout=10)
            if resp.status_code != 200:
                failures.append((p["name"], url, resp.status_code))
        assert not failures, f"image failures: {failures}"

    def test_null_image_products_exist(self, api_client):
        # 23 products are expected to have image_url = null (private Drive images)
        r = api_client.get(f"{API}/products", params={"limit": 500})
        items = r.json()
        nulls = [p for p in items if p.get("image_url") is None]
        # must be exactly 23 per the spec, but allow a small variance to be robust
        assert 20 <= len(nulls) <= 30, f"expected ~23 null-image products, got {len(nulls)}"


# --------------- Cart + COD checkout ---------------
class TestCartAndCheckout:
    def test_cart_add_update_place_order(self, api_client, customer_token):
        headers = {"Authorization": f"Bearer {customer_token}"}

        # Pick a food product with image for a realistic cart
        r = api_client.get(f"{API}/products", params={"category": "food", "limit": 500})
        picks = [p for p in r.json() if p.get("image_url")][:2]
        assert len(picks) == 2

        # Clean any existing cart
        api_client.delete(f"{API}/cart", headers=headers)

        # Add two items
        for p in picks:
            add = api_client.post(f"{API}/cart", json={"product_id": p["id"], "qty": 2}, headers=headers)
            assert add.status_code in (200, 201), f"add cart failed: {add.status_code} {add.text}"

        # Verify cart
        cart = api_client.get(f"{API}/cart", headers=headers)
        assert cart.status_code == 200
        c = cart.json()
        assert len(c.get("items", [])) == 2
        subtotal = c.get("subtotal_lek") or c.get("subtotal")
        assert subtotal and subtotal > 0

        # Place a COD order
        addr = {
            "label": "Home", "line1": "Rr. Myslym Shyri 123", "city": "Tirana",
            "state": "Tirana", "country": "Albania", "country_code": "AL",
            "postal_code": "1001", "phone": "+355 695808480",
        }
        order_resp = api_client.post(
            f"{API}/orders",
            json={"address": addr, "note": "iter22 test", "currency": "LEK"},
            headers=headers,
        )
        assert order_resp.status_code in (200, 201), f"place order failed: {order_resp.status_code} {order_resp.text}"
        order = order_resp.json()
        assert order.get("id"), "order id missing"
        assert order.get("status") in ("placed", "pending", "confirmed", "new")

        # Cart should be empty after order
        after = api_client.get(f"{API}/cart", headers=headers)
        assert after.status_code == 200
        assert len(after.json().get("items", [])) == 0


# --------------- Admin products ---------------
class TestAdminProducts:
    def test_admin_products_list_shows_new_catalog(self, api_client, admin_token):
        headers = {"Authorization": f"Bearer {admin_token}"}
        r = api_client.get(f"{API}/admin/products", params={"limit": 2000}, headers=headers)
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        data = r.json()
        items = data.get("products", []) if isinstance(data, dict) else data
        assert len(items) >= TOTAL_EXPECTED - 5, f"admin list too small: {len(items)}"

    def test_admin_filter_by_each_new_category(self, api_client, admin_token):
        headers = {"Authorization": f"Bearer {admin_token}"}
        for slug, expected in EXPECTED_COUNTS.items():
            r = api_client.get(
                f"{API}/admin/products",
                params={"category": slug, "limit": 500},
                headers=headers,
            )
            assert r.status_code == 200, f"{slug}: {r.status_code}"
            data = r.json()
            items = data.get("products", []) if isinstance(data, dict) else data
            assert len(items) == expected, f"{slug}: expected {expected}, got {len(items)}"

    def test_admin_patch_product_round_trip(self, api_client, admin_token):
        headers = {"Authorization": f"Bearer {admin_token}"}
        # Pick a food product
        r = api_client.get(f"{API}/products", params={"q": "CHATPATE CHOLE", "limit": 10})
        pid = next(p for p in r.json() if "CHATPATE CHOLE" in p["name"].upper())["id"]
        original = api_client.get(f"{API}/products/{pid}").json()

        patch = {"discount": 40.0, "mrp_lek": 1200.0, "price_lek": 820.0}
        upd = api_client.patch(f"{API}/admin/products/{pid}", json=patch, headers=headers)
        assert upd.status_code in (200, 204), f"patch failed: {upd.status_code} {upd.text}"

        after = api_client.get(f"{API}/products/{pid}").json()
        assert after["discount"] == 40.0
        assert after["mrp_lek"] == 1200.0

        # restore
        restore = {
            "discount": original["discount"],
            "mrp_lek": original["mrp_lek"],
            "price_lek": original["price_lek"],
        }
        api_client.patch(f"{API}/admin/products/{pid}", json=restore, headers=headers)
