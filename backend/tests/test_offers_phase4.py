"""Phase 4: Offers (banners + coupons + category_discounts) + regression suite."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://bharat-app-8.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_PHONE = "+355690000001"
ADMIN_PW = "admin123"
USER_PHONE = "+355695808480"
USER_PW = "123456"


# ---------------- Fixtures ----------------
@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def admin_token(s):
    r = s.post(f"{API}/admin/auth/login", json={"phone": ADMIN_PHONE, "password": ADMIN_PW}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def user_token(s):
    r = s.post(f"{API}/auth/login", json={"phone": USER_PHONE, "password": USER_PW}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def H(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------- Regression: existing endpoints ----------------
class TestRegression:
    def test_health(self, s):
        r = s.get(f"{API}/health", timeout=10)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_categories(self, s):
        r = s.get(f"{API}/categories", timeout=10)
        assert r.status_code == 200
        data = r.json()
        cats = data.get("categories") if isinstance(data, dict) else data
        assert isinstance(cats, list) and len(cats) >= 10

    def test_products(self, s):
        r = s.get(f"{API}/products?limit=5", timeout=15)
        assert r.status_code == 200
        data = r.json()
        products = data.get("products") if isinstance(data, dict) else data
        assert isinstance(products, list) and len(products) > 0
        assert "id" in products[0]

    def test_banner(self, s):
        r = s.get(f"{API}/banner", timeout=10)
        assert r.status_code == 200
        assert "message" in r.json()

    def test_admin_verify(self, s, admin_token):
        r = s.get(f"{API}/admin/verify", headers=H(admin_token), timeout=10)
        assert r.status_code == 200
        assert r.json()["user"]["is_admin"] is True

    def test_admin_dashboard(self, s, admin_token):
        r = s.get(f"{API}/admin/dashboard/summary", headers=H(admin_token), timeout=15)
        assert r.status_code == 200

    def test_me(self, s, user_token):
        r = s.get(f"{API}/me", headers=H(user_token), timeout=10)
        assert r.status_code == 200
        assert "id" in r.json()

    def test_cart_get(self, s, user_token):
        r = s.get(f"{API}/cart", headers=H(user_token), timeout=10)
        assert r.status_code == 200
        assert "items" in r.json()

    def test_geo_autocomplete(self, s):
        r = s.get(f"{API}/geo/autocomplete?input=Tirana", timeout=15)
        assert r.status_code == 200
        assert "predictions" in r.json()


# ---------------- Public Offers endpoints ----------------
class TestPublicOffers:
    def test_banners_list(self, s):
        r = s.get(f"{API}/offers/banners", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "banners" in data
        assert data["count"] >= 2
        # Seeded banners contain welcome + freeship
        titles = [b["title"] for b in data["banners"]]
        assert any("Welcome" in t for t in titles)

    def test_category_discounts_map(self, s):
        r = s.get(f"{API}/offers/category-discounts", timeout=10)
        assert r.status_code == 200
        assert "discounts" in r.json()

    def test_category_discount_single(self, s):
        r = s.get(f"{API}/offers/category-discount/bharat-app-8", timeout=10)
        assert r.status_code == 200
        # No such slug seeded
        assert r.json().get("discount") is None

    def test_validate_coupon_below_min(self, s):
        r = s.post(f"{API}/offers/validate-coupon", json={"code": "WELCOME10", "subtotal_lek": 500}, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["valid"] is False
        assert "Minimum" in d["message"] or "minimum" in d["message"]

    def test_validate_coupon_valid_no_auth(self, s):
        r = s.post(f"{API}/offers/validate-coupon", json={"code": "WELCOME10", "subtotal_lek": 2000}, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["valid"] is True
        # 10% of 2000 = 200 (under 300 cap)
        assert d["discount_lek"] == 200.0
        assert d["coupon"]["code"] == "WELCOME10"

    def test_validate_coupon_cap(self, s):
        # 10% of 5000 = 500, but max_discount_lek = 300 → capped
        r = s.post(f"{API}/offers/validate-coupon", json={"code": "WELCOME10", "subtotal_lek": 5000}, timeout=10)
        assert r.status_code == 200
        assert r.json()["discount_lek"] == 300.0

    def test_validate_coupon_invalid_code(self, s):
        r = s.post(f"{API}/offers/validate-coupon", json={"code": "NOSUCHCODE_XYZ", "subtotal_lek": 2000}, timeout=10)
        assert r.status_code == 200
        assert r.json()["valid"] is False

    def test_validate_coupon_case_insensitive(self, s):
        r = s.post(f"{API}/offers/validate-coupon", json={"code": "welcome10", "subtotal_lek": 2000}, timeout=10)
        assert r.status_code == 200
        assert r.json()["valid"] is True


# ---------------- Admin Offers CRUD ----------------
class TestAdminOffersAuth:
    def test_list_requires_auth(self, s):
        r = s.get(f"{API}/admin/offers", timeout=10)
        assert r.status_code in (401, 403)

    def test_list_forbidden_for_non_admin(self, s, user_token):
        r = s.get(f"{API}/admin/offers", headers=H(user_token), timeout=10)
        assert r.status_code == 403


class TestAdminOffersCRUD:
    created_ids = []

    def test_list_all_admin(self, s, admin_token):
        r = s.get(f"{API}/admin/offers", headers=H(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["count"] >= 3

    def test_list_by_type(self, s, admin_token):
        r = s.get(f"{API}/admin/offers?type=banner", headers=H(admin_token), timeout=10)
        assert r.status_code == 200
        for o in r.json()["offers"]:
            assert o["type"] == "banner"

    def test_create_banner(self, s, admin_token):
        payload = {
            "type": "banner", "title": "TEST_Banner Phase4",
            "description": "test banner", "priority": 50,
            "banner_bg_color": "#4285F4", "banner_text_color": "#FFFFFF",
            "cta_label": "Go", "cta_target": "tab:categories",
        }
        r = s.post(f"{API}/admin/offers", headers=H(admin_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["id"].startswith("off-")
        assert d["type"] == "banner"
        assert d["active"] is True
        # normalize: banner should not have coupon fields
        assert "coupon_code" not in d or d.get("coupon_code") is None
        TestAdminOffersCRUD.created_ids.append(d["id"])

    def test_create_coupon(self, s, admin_token):
        payload = {
            "type": "coupon", "title": "TEST_Coupon Phase4",
            "coupon_code": "test_p4",  # will be uppercased
            "discount_type": "percent", "discount_value": 15,
            "min_order_lek": 500, "max_discount_lek": 200,
        }
        r = s.post(f"{API}/admin/offers", headers=H(admin_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["coupon_code"] == "TEST_P4"
        assert d["usage_count"] == 0
        TestAdminOffersCRUD.created_ids.append(d["id"])

    def test_create_duplicate_coupon(self, s, admin_token):
        payload = {
            "type": "coupon", "title": "dup",
            "coupon_code": "TEST_P4",
            "discount_type": "percent", "discount_value": 5,
        }
        r = s.post(f"{API}/admin/offers", headers=H(admin_token), json=payload, timeout=10)
        assert r.status_code == 409

    def test_create_coupon_missing_code(self, s, admin_token):
        payload = {"type": "coupon", "title": "missing", "discount_type": "percent", "discount_value": 10}
        r = s.post(f"{API}/admin/offers", headers=H(admin_token), json=payload, timeout=10)
        assert r.status_code == 400

    def test_create_category_discount(self, s, admin_token):
        # Pick a valid category slug
        cr = s.get(f"{API}/admin/categories", headers=H(admin_token), timeout=10)
        cats = cr.json().get("categories") or cr.json()
        slug = cats[0]["slug"]
        payload = {
            "type": "category_discount", "title": "TEST_CatDisc P4",
            "category_slug": slug, "cat_discount_percent": 20,
        }
        r = s.post(f"{API}/admin/offers", headers=H(admin_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["category_slug"] == slug
        assert d["cat_discount_percent"] == 20
        TestAdminOffersCRUD.created_ids.append(d["id"])
        TestAdminOffersCRUD.cat_slug = slug
        TestAdminOffersCRUD.cat_offer_id = d["id"]

    def test_create_category_discount_missing_slug(self, s, admin_token):
        payload = {"type": "category_discount", "title": "bad", "cat_discount_percent": 10}
        r = s.post(f"{API}/admin/offers", headers=H(admin_token), json=payload, timeout=10)
        assert r.status_code == 400

    def test_create_category_discount_invalid_pct(self, s, admin_token):
        payload = {"type": "category_discount", "title": "bad", "category_slug": "spices", "cat_discount_percent": 150}
        r = s.post(f"{API}/admin/offers", headers=H(admin_token), json=payload, timeout=10)
        assert r.status_code == 400

    def test_get_by_id(self, s, admin_token):
        oid = TestAdminOffersCRUD.created_ids[0]
        r = s.get(f"{API}/admin/offers/{oid}", headers=H(admin_token), timeout=10)
        assert r.status_code == 200
        assert r.json()["id"] == oid

    def test_get_404(self, s, admin_token):
        r = s.get(f"{API}/admin/offers/off-nosuch", headers=H(admin_token), timeout=10)
        assert r.status_code == 404

    def test_patch(self, s, admin_token):
        oid = TestAdminOffersCRUD.created_ids[0]
        r = s.patch(f"{API}/admin/offers/{oid}", headers=H(admin_token),
                    json={"title": "TEST_Banner P4 Updated", "priority": 88}, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["title"] == "TEST_Banner P4 Updated"
        assert d["priority"] == 88

    def test_toggle(self, s, admin_token):
        oid = TestAdminOffersCRUD.created_ids[0]
        before = s.get(f"{API}/admin/offers/{oid}", headers=H(admin_token), timeout=10).json()["active"]
        r = s.post(f"{API}/admin/offers/{oid}/toggle", headers=H(admin_token), timeout=10)
        assert r.status_code == 200
        assert r.json()["active"] == (not before)
        # Toggle back
        s.post(f"{API}/admin/offers/{oid}/toggle", headers=H(admin_token), timeout=10)


# ---------------- Orders with coupon & category discount ----------------
class TestOrdersWithOffers:
    """Full flow: seed cart → apply coupon → verify totals + usage_count."""

    ADDRESS = {
        "label": "Home", "line1": "Rruga Test 1", "city": "Tirana",
        "postal_code": "1001", "country": "Albania", "phone": "+355695808480",
    }

    def _add_to_cart(self, s, user_token, min_lek=1500):
        # Fetch highest-priced products to reach min_lek quickly
        pr = s.get(f"{API}/products?limit=50", timeout=15)
        pj = pr.json()
        products = pj.get("products") if isinstance(pj, dict) else pj
        # Clear cart
        cart = s.get(f"{API}/cart", headers=H(user_token), timeout=10).json()
        for it in cart.get("items", []):
            s.delete(f"{API}/cart/{it['product_id']}", headers=H(user_token), timeout=10)
        # Sort by price_lek desc
        products = sorted(products, key=lambda p: p.get("price_lek", 0), reverse=True)
        added_slug = None
        subtotal = 0
        for p in products:
            if not p.get("in_stock"):
                continue
            s.post(f"{API}/cart", headers=H(user_token),
                   json={"product_id": p["id"], "qty": 2}, timeout=10)
            subtotal += float(p.get("price_lek", 0)) * 2
            if not added_slug:
                added_slug = p.get("category_slug")
            if subtotal >= min_lek:
                break
        return added_slug, subtotal

    def test_place_order_with_coupon(self, s, user_token):
        self._add_to_cart(s, user_token, min_lek=1500)
        # Get subtotal from cart
        cart_r = s.get(f"{API}/cart", headers=H(user_token), timeout=10).json()
        subtotal = cart_r.get("subtotal_lek", 0)
        assert subtotal >= 1000

        r = s.post(f"{API}/orders", headers=H(user_token),
                   json={"address": self.ADDRESS, "note": "TEST", "currency": "LEK",
                         "coupon_code": "WELCOME10"}, timeout=20)
        assert r.status_code == 200, r.text
        order = r.json()
        assert order["coupon_code"] == "WELCOME10"
        assert order["coupon_discount_lek"] > 0
        assert order["total_discount_lek"] >= order["coupon_discount_lek"]
        # total should reflect discount
        assert order["total_lek"] < order["subtotal_lek"] + order["delivery_fee_lek"]
        # Verify persistence via GET
        gr = s.get(f"{API}/orders/{order['id']}", headers=H(user_token), timeout=10)
        assert gr.status_code == 200
        assert gr.json()["coupon_code"] == "WELCOME10"

    def test_place_order_invalid_coupon(self, s, user_token):
        self._add_to_cart(s, user_token, min_lek=1500)
        r = s.post(f"{API}/orders", headers=H(user_token),
                   json={"address": self.ADDRESS, "currency": "LEK",
                         "coupon_code": "NOSUCH_XYZ"}, timeout=15)
        assert r.status_code == 400

    def test_place_order_coupon_below_min(self, s, user_token):
        # Clear and add just one low-value item
        cart = s.get(f"{API}/cart", headers=H(user_token), timeout=10).json()
        for it in cart.get("items", []):
            s.delete(f"{API}/cart/{it['product_id']}", headers=H(user_token), timeout=10)
        pr = s.get(f"{API}/products?limit=100", timeout=15)
        pj = pr.json()
        products = pj.get("products") if isinstance(pj, dict) else pj
        cheap = sorted([p for p in products if p.get("in_stock") and p.get("price_lek", 0) > 0],
                       key=lambda p: p["price_lek"])[0]
        s.post(f"{API}/cart", headers=H(user_token),
               json={"product_id": cheap["id"], "qty": 1}, timeout=10)
        # Try coupon
        r = s.post(f"{API}/orders", headers=H(user_token),
                   json={"address": self.ADDRESS, "currency": "LEK",
                         "coupon_code": "WELCOME10"}, timeout=15)
        assert r.status_code == 400

    def test_place_order_with_category_discount(self, s, user_token, admin_token):
        # Ensure category discount exists (from CRUD test); if not, create one now
        cat_slug = getattr(TestAdminOffersCRUD, "cat_slug", None)
        cat_offer_id = getattr(TestAdminOffersCRUD, "cat_offer_id", None)
        if not cat_offer_id:
            cr = s.get(f"{API}/admin/categories", headers=H(admin_token), timeout=10)
            cats = cr.json().get("categories") or cr.json()
            cat_slug = cats[0]["slug"]
            create = s.post(f"{API}/admin/offers", headers=H(admin_token), json={
                "type": "category_discount", "title": "TEST_CatDisc Runtime",
                "category_slug": cat_slug, "cat_discount_percent": 20,
            }, timeout=15).json()
            cat_offer_id = create["id"]
            TestAdminOffersCRUD.created_ids.append(cat_offer_id)

        # Clear cart, then add products from that category
        cart = s.get(f"{API}/cart", headers=H(user_token), timeout=10).json()
        for it in cart.get("items", []):
            s.delete(f"{API}/cart/{it['product_id']}", headers=H(user_token), timeout=10)
        pr = s.get(f"{API}/products?category={cat_slug}&limit=10", timeout=15)
        pj = pr.json()
        products = pj.get("products") if isinstance(pj, dict) else pj
        candidates = [p for p in products if p.get("in_stock") and p.get("category_slug") == cat_slug]
        if not candidates:
            pytest.skip(f"No in-stock products for {cat_slug}")
        for p in candidates[:3]:
            s.post(f"{API}/cart", headers=H(user_token),
                   json={"product_id": p["id"], "qty": 2}, timeout=10)

        r = s.post(f"{API}/orders", headers=H(user_token),
                   json={"address": self.ADDRESS, "currency": "LEK"}, timeout=20)
        assert r.status_code == 200, r.text
        order = r.json()
        assert order["category_discount_lek"] > 0
        # Each item from that cat should have cat_discount_percent = 20
        matching = [it for it in order["items"] if it.get("category_slug") == cat_slug]
        assert matching
        for it in matching:
            assert it.get("cat_discount_percent") == 20
            assert it.get("cat_discount_lek", 0) > 0
            assert "line_lek_after_cat_discount" in it


# ---------------- Cleanup ----------------
def test_zzz_cleanup(admin_token):
    """Delete offers created in the test run."""
    session = requests.Session()
    for oid in list(TestAdminOffersCRUD.created_ids):
        r = session.delete(f"{API}/admin/offers/{oid}", headers=H(admin_token), timeout=10)
        # Some may already be deleted; treat 404 as OK
        assert r.status_code in (200, 404)
