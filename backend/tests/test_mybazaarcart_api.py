"""myBazaarCart backend API tests."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://bharat-app-8.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def demo_token(session):
    r = session.post(f"{API}/auth/login", json={"username": "demo", "password": "demo1234"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- Public ----------
def test_health(session):
    r = session.get(f"{API}/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_banner(session):
    r = session.get(f"{API}/banner")
    assert r.status_code == 200
    body = r.json()
    assert "1500" in body["message"]
    assert body["free_delivery_min"] == 1500.0


def test_categories(session):
    r = session.get(f"{API}/categories")
    assert r.status_code == 200
    cats = r.json()
    assert len(cats) == 19
    slugs = {c["slug"] for c in cats}
    assert "snacks_munchies" in slugs
    # ensure emoji & coming_soon present
    for c in cats:
        assert c.get("emoji")
        assert "coming_soon" in c


def test_products_list(session):
    r = session.get(f"{API}/products")
    assert r.status_code == 200
    assert len(r.json()) > 0


def test_products_filter_category(session):
    r = session.get(f"{API}/products", params={"category": "snacks_munchies"})
    assert r.status_code == 200
    data = r.json()
    assert len(data) > 0
    assert all(p["category_slug"] == "snacks_munchies" for p in data)


def test_products_search(session):
    r = session.get(f"{API}/products", params={"q": "lay"})
    assert r.status_code == 200
    data = r.json()
    assert len(data) > 0
    assert any("lay" in p["name"].lower() for p in data)


def test_product_by_id(session):
    r = session.get(f"{API}/products", params={"category": "snacks_munchies", "limit": 1})
    pid = r.json()[0]["id"]
    r2 = session.get(f"{API}/products/{pid}")
    assert r2.status_code == 200
    assert r2.json()["id"] == pid


def test_product_not_found(session):
    r = session.get(f"{API}/products/does-not-exist")
    assert r.status_code == 404


# ---------- Auth ----------
def test_login_success(session):
    r = session.post(f"{API}/auth/login", json={"username": "demo", "password": "demo1234"})
    assert r.status_code == 200
    body = r.json()
    assert "token" in body and "user" in body
    assert body["user"]["username"] == "demo"
    assert "password_hash" not in body["user"]


def test_login_wrong(session):
    r = session.post(f"{API}/auth/login", json={"username": "demo", "password": "wrong"})
    assert r.status_code == 401


# ---------- OTP signup ----------
def test_otp_signup_flow(session):
    phone = f"+3556{int(time.time()) % 100000000:08d}"
    r = session.post(f"{API}/auth/register/send-otp", json={"phone": phone})
    if r.status_code in (502, 400):
        pytest.skip(f"Twilio rejected test phone (real creds configured): {r.status_code}")
    assert r.status_code == 200, r.text
    body = r.json()
    code = body.get("debug_code")
    if not code:
        pytest.skip("Twilio sent SMS, cannot retrieve OTP for test")
    # wrong code
    r_bad = session.post(
        f"{API}/auth/register/verify-otp",
        json={
            "phone": phone, "code": "000000",
            "username": f"u{uuid.uuid4().hex[:6]}", "password": "secret123",
        },
    )
    assert r_bad.status_code == 400
    # correct code
    uname = f"u{uuid.uuid4().hex[:6]}"
    r_ok = session.post(
        f"{API}/auth/register/verify-otp",
        json={
            "phone": phone, "code": code,
            "username": uname, "password": "secret123",
            "full_name": "Test User", "language": "en", "currency": "LEK",
        },
    )
    assert r_ok.status_code == 200, r_ok.text
    assert "token" in r_ok.json()


def test_duplicate_username(session):
    # demo already exists - try registering using send-otp + verify with demo username
    phone = f"+3557{int(time.time()) % 100000000:08d}"
    r = session.post(f"{API}/auth/register/send-otp", json={"phone": phone})
    if r.status_code in (502, 400) or not r.json().get("debug_code"):
        pytest.skip("Cannot get debug code (Twilio configured with real creds)")
    code = r.json()["debug_code"]
    r2 = session.post(
        f"{API}/auth/register/verify-otp",
        json={"phone": phone, "code": code, "username": "demo", "password": "secret123"},
    )
    assert r2.status_code == 409


# ---------- Cart ----------
def test_cart_requires_auth(session):
    r = session.get(f"{API}/cart")
    assert r.status_code == 401


def test_cart_crud(session, demo_token):
    h = auth(demo_token)
    # clear first
    session.delete(f"{API}/cart", headers=h)
    # get a product
    prods = session.get(f"{API}/products", params={"category": "snacks_munchies", "limit": 2}).json()
    p1 = prods[0]
    # add
    r = session.post(f"{API}/cart", json={"product_id": p1["id"], "qty": 2}, headers=h)
    assert r.status_code == 200
    cart = r.json()
    assert cart["count"] == 2
    expected = p1["price_lek"] * 2
    assert abs(cart["subtotal_lek"] - expected) < 0.01
    # patch
    r = session.patch(f"{API}/cart/{p1['id']}", json={"qty": 5}, headers=h)
    assert r.status_code == 200
    assert r.json()["count"] == 5
    # delete
    r = session.delete(f"{API}/cart/{p1['id']}", headers=h)
    assert r.status_code == 200
    assert r.json()["count"] == 0


# ---------- Orders ----------
def test_place_order_free_delivery(session, demo_token):
    h = auth(demo_token)
    # clear & build cart >= 1500 LEK
    session.delete(f"{API}/cart", headers=h)
    prods = session.get(f"{API}/products", params={"category": "atta_dal_rice"}).json()
    expensive = max(prods, key=lambda p: p["price_lek"])
    session.post(f"{API}/cart", json={"product_id": expensive["id"], "qty": 2}, headers=h)
    addr = {"label": "Home", "line1": "Rruga 1", "city": "Tirana", "country": "Albania"}
    r = session.post(f"{API}/orders", json={"address": addr, "currency": "LEK"}, headers=h)
    assert r.status_code == 200, r.text
    order = r.json()
    assert order["payment_method"] == "COD"
    assert order["subtotal_lek"] >= 1500
    assert order["delivery_fee_lek"] == 0.0
    # cart cleared
    cart = session.get(f"{API}/cart", headers=h).json()
    assert cart["count"] == 0
    # listed
    orders = session.get(f"{API}/orders", headers=h).json()
    assert any(o["id"] == order["id"] for o in orders)


# ---------- Me update ----------
def test_me_patch(session, demo_token):
    h = auth(demo_token)
    r = session.patch(f"{API}/me", json={"language": "sq", "currency": "EUR"}, headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["language"] == "sq"
    assert body["currency"] == "EUR"
    # reset
    session.patch(f"{API}/me", json={"language": "en", "currency": "LEK"}, headers=h)
