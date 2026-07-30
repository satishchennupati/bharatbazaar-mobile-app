"""Backend tests for Admin Phase 3: Product CRUD, image upload, CSV re-import,
categories listing, and Phase 2 regression checks.

Covers:
- GET /api/admin/products (no filter / category / in_stock / q / limit / 403 for customer)
- POST /api/admin/products (create, auto price_eur, missing required -> 422,
  category product_count refresh)
- POST /api/admin/products with image_data_url -> saves file, image_url starts with /api/static/products/
- PATCH /api/admin/products/{id} (updates, price sync, updated_by, 404, empty->400,
  category swap refresh, image_data_url update)
- DELETE /api/admin/products/{id} (deletes, pulls from carts, refreshes category count)
- POST /api/admin/products/import-csv (2-row minimal CSV; verify counts)
- GET /api/admin/categories (16 categories, sorted by sort_order)
- Regression: Phase 2 admin endpoints (dashboard summary, orders list/get/patch)
"""

import base64
import io
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://bharat-app-8.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_PHONE = "+355690000001"
ADMIN_PW = "admin123"
CUSTOMER_PHONE = "+355695808480"
CUSTOMER_PW = "123456"


# -------------- fixtures --------------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/admin/auth/login",
                      json={"phone": ADMIN_PHONE, "password": ADMIN_PW}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def customer_token():
    r = requests.post(f"{API}/auth/login",
                      json={"phone": CUSTOMER_PHONE, "password": CUSTOMER_PW}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _hf(tok):
    return {"Authorization": f"Bearer {tok}"}


# ============ GET /admin/products ============
class TestListProducts:
    def test_list_no_filter(self, admin_token):
        r = requests.get(f"{API}/admin/products", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        b = r.json()
        assert "products" in b and "count" in b
        assert isinstance(b["products"], list)
        assert b["count"] == len(b["products"])
        assert b["count"] > 0, "Expected seeded products in DB"

    def test_list_filter_category(self, admin_token):
        # First get all cats, pick one with products
        cats = requests.get(f"{API}/admin/categories", headers=_h(admin_token)).json()["categories"]
        # try "spices"
        slug = "spices"
        r = requests.get(f"{API}/admin/products?category={slug}", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        b = r.json()
        for p in b["products"]:
            assert p["category_slug"] == slug

    def test_list_filter_in_stock_false(self, admin_token):
        r = requests.get(f"{API}/admin/products?in_stock=false", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        for p in r.json()["products"]:
            assert p.get("in_stock") is False

    def test_list_filter_q(self, admin_token):
        # Case-insensitive partial name match
        r = requests.get(f"{API}/admin/products?q=chandan", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        b = r.json()
        # If matches exist, verify substring in name/sku/code/barcode
        for p in b["products"]:
            hay = " ".join([str(p.get("name", "")), str(p.get("sku", "")),
                            str(p.get("product_code", "")), str(p.get("ean_barcode", ""))]).lower()
            assert "chandan" in hay

    def test_list_limit(self, admin_token):
        r = requests.get(f"{API}/admin/products?limit=5", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        assert len(r.json()["products"]) <= 5

    def test_list_forbidden_for_customer(self, customer_token):
        r = requests.get(f"{API}/admin/products", headers=_h(customer_token), timeout=15)
        assert r.status_code == 403


# ============ POST /admin/products ============
class TestCreateProduct:
    created_ids: list = []

    @classmethod
    def teardown_class(cls):
        # Delete any leftover test products
        r = requests.post(f"{API}/admin/auth/login",
                          json={"phone": ADMIN_PHONE, "password": ADMIN_PW}, timeout=10)
        tok = r.json()["token"]
        for pid in cls.created_ids:
            requests.delete(f"{API}/admin/products/{pid}",
                            headers={"Authorization": f"Bearer {tok}"})

    def test_create_missing_required_422(self, admin_token):
        # Missing name, category_slug, price_lek
        r = requests.post(f"{API}/admin/products", headers=_h(admin_token), json={}, timeout=15)
        assert r.status_code == 422

    def test_create_ok_auto_price_eur(self, admin_token):
        payload = {"name": "TEST_Phase3_AutoEur",
                   "category_slug": "spices", "price_lek": 500, "stock": 7}
        r = requests.post(f"{API}/admin/products", headers=_h(admin_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["id"].startswith("p-")
        assert d["name"] == "TEST_Phase3_AutoEur"
        assert d["price_lek"] == 500
        assert d["price_eur"] == round(500 / 100.0, 2)
        assert d.get("created_at") and d.get("updated_at")
        assert d.get("created_by") == "admin-001"
        TestCreateProduct.created_ids.append(d["id"])

        # Verify it appears in list
        lst = requests.get(f"{API}/admin/products?q=TEST_Phase3_AutoEur",
                           headers=_h(admin_token)).json()
        assert any(p["id"] == d["id"] for p in lst["products"])

    def test_create_refreshes_category_count(self, admin_token):
        # Snapshot spices count
        cats_before = requests.get(f"{API}/admin/categories", headers=_h(admin_token)).json()["categories"]
        before = next(c["product_count"] for c in cats_before if c["slug"] == "spices")

        payload = {"name": "TEST_Phase3_CatCount",
                   "category_slug": "spices", "price_lek": 100}
        r = requests.post(f"{API}/admin/products", headers=_h(admin_token), json=payload, timeout=15)
        assert r.status_code == 200
        pid = r.json()["id"]
        TestCreateProduct.created_ids.append(pid)

        cats_after = requests.get(f"{API}/admin/categories", headers=_h(admin_token)).json()["categories"]
        after = next(c["product_count"] for c in cats_after if c["slug"] == "spices")
        assert after == before + 1, f"category product_count should increment: before={before}, after={after}"

    def test_create_with_image_data_url(self, admin_token):
        # Minimal 1x1 PNG
        png_bytes = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        )
        b64 = base64.b64encode(png_bytes).decode()
        data_url = f"data:image/png;base64,{b64}"
        payload = {"name": "TEST_Phase3_Img", "category_slug": "spices",
                   "price_lek": 250, "image_data_url": data_url}
        r = requests.post(f"{API}/admin/products", headers=_h(admin_token), json=payload, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["image_url"].startswith("/api/static/products/")
        # File on disk
        fname = d["image_url"].split("/")[-1]
        assert os.path.exists(f"/app/backend/static/products/{fname}")
        TestCreateProduct.created_ids.append(d["id"])


# ============ PATCH /admin/products/{id} ============
class TestPatchProduct:
    _pid: str = ""

    @pytest.fixture(scope="class", autouse=True)
    def _prod(self, admin_token):
        r = requests.post(f"{API}/admin/products", headers=_h(admin_token),
                          json={"name": "TEST_Phase3_Patch", "category_slug": "spices",
                                "price_lek": 300, "stock": 5}, timeout=15)
        assert r.status_code == 200
        TestPatchProduct._pid = r.json()["id"]
        yield
        requests.delete(f"{API}/admin/products/{TestPatchProduct._pid}",
                        headers=_h(admin_token))

    def test_patch_404(self, admin_token):
        r = requests.patch(f"{API}/admin/products/does-not-exist",
                           headers=_h(admin_token), json={"name": "x"}, timeout=15)
        assert r.status_code == 404

    def test_patch_empty_400(self, admin_token):
        r = requests.patch(f"{API}/admin/products/{TestPatchProduct._pid}",
                           headers=_h(admin_token), json={}, timeout=15)
        assert r.status_code == 400

    def test_patch_updates_and_price_sync(self, admin_token):
        r = requests.patch(f"{API}/admin/products/{TestPatchProduct._pid}",
                           headers=_h(admin_token),
                           json={"name": "TEST_Phase3_Patch_Updated",
                                 "price_lek": 999}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == "TEST_Phase3_Patch_Updated"
        assert d["price_lek"] == 999
        assert d["price"] == 999, "price column must be kept in sync with price_lek"
        assert d.get("updated_by") == "admin-001"

    def test_patch_category_swap_refreshes_both(self, admin_token):
        # snapshot
        cats = requests.get(f"{API}/admin/categories", headers=_h(admin_token)).json()["categories"]
        spices_before = next(c["product_count"] for c in cats if c["slug"] == "spices")
        # Pick a distinct target
        target_slug = None
        for c in cats:
            if c["slug"] != "spices":
                target_slug = c["slug"]
                break
        assert target_slug
        target_before = next(c["product_count"] for c in cats if c["slug"] == target_slug)

        r = requests.patch(f"{API}/admin/products/{TestPatchProduct._pid}",
                           headers=_h(admin_token),
                           json={"category_slug": target_slug}, timeout=15)
        assert r.status_code == 200

        cats2 = requests.get(f"{API}/admin/categories", headers=_h(admin_token)).json()["categories"]
        spices_after = next(c["product_count"] for c in cats2 if c["slug"] == "spices")
        target_after = next(c["product_count"] for c in cats2 if c["slug"] == target_slug)
        assert spices_after == spices_before - 1
        assert target_after == target_before + 1

    def test_patch_image_data_url(self, admin_token):
        png_bytes = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        )
        b64 = base64.b64encode(png_bytes).decode()
        r = requests.patch(f"{API}/admin/products/{TestPatchProduct._pid}",
                           headers=_h(admin_token),
                           json={"image_data_url": f"data:image/png;base64,{b64}"},
                           timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["image_url"].startswith("/api/static/products/")


# ============ DELETE /admin/products/{id} ============
class TestDeleteProduct:
    def test_delete_removes_from_products_and_carts(self, admin_token):
        # Create product
        r = requests.post(f"{API}/admin/products", headers=_h(admin_token),
                          json={"name": "TEST_Phase3_Delete", "category_slug": "spices",
                                "price_lek": 150, "stock": 3}, timeout=15)
        assert r.status_code == 200
        pid = r.json()["id"]

        # Add to a customer's cart
        # customer login
        ct = requests.post(f"{API}/auth/login", json={"phone": CUSTOMER_PHONE, "password": CUSTOMER_PW}, timeout=10)
        tok = ct.json()["token"]
        cart_add = requests.post(f"{API}/cart/items",
                                 headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"},
                                 json={"product_id": pid, "quantity": 2}, timeout=15)
        cart_has_item = False
        if cart_add.status_code in (200, 201):
            cart = requests.get(f"{API}/cart", headers={"Authorization": f"Bearer {tok}"}).json()
            cart_has_item = any(it.get("product_id") == pid for it in cart.get("items", []))

        # Snapshot spices count
        cats_before = requests.get(f"{API}/admin/categories", headers=_h(admin_token)).json()["categories"]
        spices_before = next(c["product_count"] for c in cats_before if c["slug"] == "spices")

        # Delete
        r = requests.delete(f"{API}/admin/products/{pid}", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        b = r.json()
        assert b.get("ok") is True and b.get("deleted") == pid

        # Confirm not in list
        lst = requests.get(f"{API}/admin/products?q=TEST_Phase3_Delete",
                           headers=_h(admin_token)).json()
        assert not any(p["id"] == pid for p in lst["products"])

        # Confirm cart no longer contains it
        if cart_has_item:
            cart2 = requests.get(f"{API}/cart", headers={"Authorization": f"Bearer {tok}"}).json()
            assert not any(it.get("product_id") == pid for it in cart2.get("items", [])), \
                "Product should be pulled from carts on delete"

        # Category count updated
        cats_after = requests.get(f"{API}/admin/categories", headers=_h(admin_token)).json()["categories"]
        spices_after = next(c["product_count"] for c in cats_after if c["slug"] == "spices")
        assert spices_after == spices_before - 1

    def test_delete_404(self, admin_token):
        r = requests.delete(f"{API}/admin/products/nonexistent-xyz",
                            headers=_h(admin_token), timeout=15)
        assert r.status_code == 404


# ============ POST /admin/products/import-csv ============
class TestCsvImport:
    def test_csv_import_2_rows(self, admin_token):
        # First, create a product so we can update it via CSV
        create = requests.post(f"{API}/admin/products", headers=_h(admin_token),
                               json={"name": "TEST_CSV_Existing", "category_slug": "spices",
                                     "price_lek": 100}, timeout=15)
        assert create.status_code == 200
        pid = create.json()["id"]

        # NOTE: Backend's _row_to_product expects columns: name, category (display name
        # slugified via CATEGORY_MAP), price, Product Code (for deterministic id via md5),
        # sku, stock, etc. It does NOT read category_slug/price_lek/id from CSV.
        # The task's problem-statement CSV format (name,category_slug,price_lek,stock)
        # is INCOMPATIBLE with the current importer — see backend_issues.
        csv_text = (
            "name,category,price,stock,Product Code\n"
            "TEST_CSV_ExistingUpd,Spices,222,10,TESTCSV_EXISTING\n"
            "TEST_CSV_NewRow,Spices,333,20,TESTCSV_NEWROW\n"
        )
        files = {"file": ("t.csv", csv_text.encode("utf-8"), "text/csv")}
        r = requests.post(f"{API}/admin/products/import-csv",
                          headers=_hf(admin_token), files=files, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        # Endpoint returns 'imported'/'skipped' (see _import_products_from_csv_text).
        # However the frontend reads data.inserted/data.updated — this is a KEY MISMATCH
        # (documented in test_report). Accept either shape for regression stability.
        assert ("imported" in body) or ("inserted" in body)
        inserted_or_imported = body.get("imported", body.get("inserted", 0))
        assert inserted_or_imported >= 2, f"Expected at least 2 rows imported, got {inserted_or_imported}"

        # Verify new row was created (id is a deterministic md5 hash from Product Code)
        lst = requests.get(f"{API}/admin/products?q=TEST_CSV_NewRow",
                           headers=_h(admin_token)).json()
        assert any(p["name"] == "TEST_CSV_NewRow" for p in lst["products"])
        updated = requests.get(f"{API}/admin/products?q=TEST_CSV_ExistingUpd",
                               headers=_h(admin_token)).json()
        assert any(p["name"] == "TEST_CSV_ExistingUpd" for p in updated["products"])

        # Cleanup — find generated ids and delete
        for name in ("TEST_CSV_NewRow", "TEST_CSV_ExistingUpd"):
            found = requests.get(f"{API}/admin/products?q={name}",
                                 headers=_h(admin_token)).json()["products"]
            for p in found:
                requests.delete(f"{API}/admin/products/{p['id']}", headers=_h(admin_token))
        requests.delete(f"{API}/admin/products/{pid}", headers=_h(admin_token))

    def test_csv_import_forbidden_for_customer(self, customer_token):
        csv_text = "id,name,category_slug,price_lek,stock\np-x,X,spices,1,1\n"
        files = {"file": ("t.csv", csv_text.encode("utf-8"), "text/csv")}
        r = requests.post(f"{API}/admin/products/import-csv",
                          headers=_hf(customer_token), files=files, timeout=15)
        assert r.status_code == 403


# ============ GET /admin/categories ============
class TestCategories:
    def test_categories_count_and_sort(self, admin_token):
        r = requests.get(f"{API}/admin/categories", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        cats = r.json()["categories"]
        assert len(cats) == 16, f"Expected 16 categories, got {len(cats)}"
        orders = [c.get("sort_order", 0) for c in cats]
        assert orders == sorted(orders), "Categories not sorted by sort_order"


# ============ Regression: Phase 2 endpoints ============
class TestPhase2Regression:
    def test_dashboard_summary(self, admin_token):
        r = requests.get(f"{API}/admin/dashboard/summary", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        b = r.json()
        for k in ("today_orders", "today_revenue_lek", "pending_orders",
                  "total_orders", "total_customers", "status_breakdown",
                  "top_products", "recent_orders", "order_statuses"):
            assert k in b

    def test_orders_list(self, admin_token):
        r = requests.get(f"{API}/admin/orders", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        b = r.json()
        assert "orders" in b and "count" in b

    def test_order_detail_and_patch_still_work(self, admin_token):
        lst = requests.get(f"{API}/admin/orders?limit=1", headers=_h(admin_token)).json()
        if not lst["orders"]:
            pytest.skip("no orders")
        oid = lst["orders"][0]["id"]
        r = requests.get(f"{API}/admin/orders/{oid}", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        # empty patch should 400 (unchanged contract)
        r2 = requests.patch(f"{API}/admin/orders/{oid}", headers=_h(admin_token), json={}, timeout=15)
        assert r2.status_code == 400
