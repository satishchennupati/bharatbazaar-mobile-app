"""Backend tests for /api/me/favourites (add, list, delete, auth, 404)."""
import os
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

CUSTOMER_PHONE = "+355695808480"
CUSTOMER_PASSWORD = "123456"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"phone": CUSTOMER_PHONE, "password": CUSTOMER_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def product_ids():
    r = requests.get(f"{BASE_URL}/api/products?limit=5", timeout=15)
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 3, "need at least 3 products in DB"
    return [p["id"] for p in items[:3]]


@pytest.fixture(scope="module", autouse=True)
def cleanup(auth_headers, product_ids):
    # Remove any pre-existing favs among the ones we'll touch (before + after)
    yield
    for pid in product_ids:
        requests.delete(f"{BASE_URL}/api/me/favourites/{pid}", headers=auth_headers, timeout=15)


class TestFavouritesAuth:
    def test_get_favourites_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/me/favourites", timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"

    def test_post_favourite_requires_auth(self, product_ids):
        r = requests.post(f"{BASE_URL}/api/me/favourites/{product_ids[0]}", timeout=15)
        assert r.status_code in (401, 403)

    def test_delete_favourite_requires_auth(self, product_ids):
        r = requests.delete(f"{BASE_URL}/api/me/favourites/{product_ids[0]}", timeout=15)
        assert r.status_code in (401, 403)


class TestFavouritesFlow:
    def test_reset_state(self, auth_headers, product_ids):
        for pid in product_ids:
            requests.delete(f"{BASE_URL}/api/me/favourites/{pid}", headers=auth_headers, timeout=15)

    def test_add_favourite_returns_list(self, auth_headers, product_ids):
        pid = product_ids[0]
        r = requests.post(f"{BASE_URL}/api/me/favourites/{pid}", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "favourites" in data
        assert pid in data["favourites"]

    def test_add_multiple_most_recent_first(self, auth_headers, product_ids):
        # Add p1 then p2 — response should have p2 before p1
        p1, p2 = product_ids[1], product_ids[2]
        requests.post(f"{BASE_URL}/api/me/favourites/{p1}", headers=auth_headers, timeout=15)
        r = requests.post(f"{BASE_URL}/api/me/favourites/{p2}", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        favs = r.json()["favourites"]
        assert favs.index(p2) < favs.index(p1), f"expected {p2} before {p1}, got {favs}"

    def test_get_favourites_returns_products_most_recent_first(self, auth_headers, product_ids):
        r = requests.get(f"{BASE_URL}/api/me/favourites", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        ids = [p["id"] for p in items]
        # Most recently added first — product_ids[2] added last
        assert ids[0] == product_ids[2], f"expected {product_ids[2]} first, got {ids}"
        # All added products present
        for pid in product_ids:
            assert pid in ids
        # Product shape sanity
        sample = items[0]
        for k in ("id", "name", "price_lek", "in_stock"):
            assert k in sample, f"missing {k}"

    def test_add_duplicate_is_idempotent_and_moves_to_top(self, auth_headers, product_ids):
        p0 = product_ids[0]  # currently oldest
        r = requests.post(f"{BASE_URL}/api/me/favourites/{p0}", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        favs = r.json()["favourites"]
        # p0 should appear exactly once and be first (most recent)
        assert favs.count(p0) == 1
        assert favs[0] == p0

    def test_delete_favourite_removes(self, auth_headers, product_ids):
        pid = product_ids[0]
        r = requests.delete(f"{BASE_URL}/api/me/favourites/{pid}", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        favs = r.json()["favourites"]
        assert pid not in favs

        # Verify via GET too
        g = requests.get(f"{BASE_URL}/api/me/favourites", headers=auth_headers, timeout=15)
        ids = [p["id"] for p in g.json()]
        assert pid not in ids

    def test_add_nonexistent_product_returns_404(self, auth_headers):
        r = requests.post(f"{BASE_URL}/api/me/favourites/does-not-exist-xyz",
                          headers=auth_headers, timeout=15)
        assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text}"
