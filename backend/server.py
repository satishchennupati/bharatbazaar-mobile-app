"""Bharat Bazaar mobile backend.

Public endpoints:
- /api/health
- /api/categories
- /api/products (filterable)
- /api/products/{id}
- /api/banner
- /api/auth/login                (existing username/password)
- /api/auth/register/send-otp    (Twilio SMS)
- /api/auth/register/verify-otp  (creates account, returns JWT)

Authenticated endpoints (Bearer JWT):
- /api/me, /api/me/addresses
- /api/cart  (GET, POST add, PATCH update qty, DELETE remove, DELETE /clear)
- /api/orders (POST place COD, GET list, GET {id})
"""
from __future__ import annotations

import csv
import io
import logging
import os
import random
import re
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, List, Literal, Optional

import bcrypt
import httpx
import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, File, Header, HTTPException, Query, Response, UploadFile, status
from fastapi.staticfiles import StaticFiles
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware
from twilio.base.exceptions import TwilioRestException
from twilio.rest import Client as TwilioClient

from seed_data import CATEGORIES_SEED, PRODUCTS_SEED, SEED_VERSION

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("bharat_bazaar")

# ------------------------------------------------------------------
# DB
# ------------------------------------------------------------------
mongo_url = os.environ["MONGO_URL"]
db_name = os.environ["DB_NAME"]
mongo_client = AsyncIOMotorClient(mongo_url)
db = mongo_client[db_name]

# ------------------------------------------------------------------
# Twilio
# ------------------------------------------------------------------
TWILIO_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM = os.environ.get("TWILIO_FROM_NUMBER", "")
TWILIO_MSID = os.environ.get("TWILIO_MESSAGING_SERVICE_SID", "")
twilio_client: Optional[TwilioClient] = None
if TWILIO_SID and TWILIO_TOKEN:
    try:
        twilio_client = TwilioClient(TWILIO_SID, TWILIO_TOKEN)
    except Exception as exc:  # pragma: no cover
        logger.warning("Twilio init failed: %s", exc)
        twilio_client = None

OTP_LENGTH = int(os.environ.get("OTP_LENGTH", "6"))
OTP_EXPIRY_MINUTES = int(os.environ.get("OTP_EXPIRY_MINUTES", "10"))
ADMIN_SECRET = os.environ.get("ADMIN_SECRET", "")
GOOGLE_DRIVE_API_KEY = os.environ.get("GOOGLE_DRIVE_API_KEY", "")
GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")

STATIC_DIR = ROOT_DIR / "static"
PRODUCT_IMG_DIR = STATIC_DIR / "products"
PRODUCT_IMG_DIR.mkdir(parents=True, exist_ok=True)


# ------------------------------------------------------------------
# CSV inventory import helpers
# ------------------------------------------------------------------
LEK_PER_EUR = 100.0

# Map CSV category strings -> our 16-category slugs
CATEGORY_MAP = {
    "snacks": "snacks",
    "rtc (ready to cook)": "rtc",
    "ready to cook": "rtc",
    "rte (ready to eat)": "rte",
    "ready to eat": "rte",
    "noodles & pasta": "noodles_pasta",
    "noodles and pasta": "noodles_pasta",
    "mouth freshners (mukhwas)": "mukhwas",
    "mouth fresheners (mukhwas)": "mukhwas",
    "mukhwas": "mukhwas",
    "indian sweets (mithai)": "mithai",
    "mithai": "mithai",
    "flour": "flour",
    "rice": "rice",
    "lentils (dal)": "dal",
    "dal": "dal",
    "spices": "spices",
    "spices powder (masala)": "spices",
    "whole spices (sabut masala)": "spices",
    "condiments": "spices",
    "oil & ghee": "oils_ghee",
    "oils & ghee": "oils_ghee",
    "oils and ghee": "oils_ghee",
    "pickles": "pickles",
    "organic & healthy living": "organic",
    "high protien food": "organic",
    "high protein food": "organic",
    "tea (chai)": "organic",
    "pharma & wellness": "pharma",
    "health care": "pharma",
    "puja needs": "puja",
    "flavors & fragrance": "puja",
    "personal care": "personal_care",
    "skin care": "personal_care",
    "hair care": "personal_care",
    "body care": "personal_care",
}


def _normalize_drive_url(url: str) -> Optional[str]:
    """Convert Google Drive viewer URL -> direct image URL that RN Image can render."""
    if not url:
        return None
    url = url.strip()
    m = re.search(r"/file/d/([^/]+)", url)
    if not m:
        m = re.search(r"[?&]id=([^&]+)", url)
    if m:
        file_id = m.group(1)
        # lh3.googleusercontent.com serves the file as an image via CDN
        return f"https://lh3.googleusercontent.com/d/{file_id}=w600"
    return url  # already a direct URL


def _parse_float(v: str, default: float = 0.0) -> float:
    try:
        return float(str(v).strip().replace(",", "")) if v not in (None, "", "-") else default
    except (ValueError, TypeError):
        return default


def _parse_int(v: str, default: int = 0) -> int:
    try:
        return int(_parse_float(v, default))
    except (ValueError, TypeError):
        return default


def _slugify_cat(raw: str) -> Optional[str]:
    key = (raw or "").strip().lower()
    return CATEGORY_MAP.get(key)


def _display_weight(grams: Optional[float], sku_hint: str) -> str:
    if grams and grams > 0:
        if grams >= 1000:
            kg = grams / 1000.0
            return f"{kg:g} kg"
        return f"{int(grams)} g" if grams.is_integer() else f"{grams:g} g"
    return sku_hint or ""


def _row_to_product(row: dict) -> Optional[dict]:
    """Convert one CSV row -> product dict; returns None if row invalid."""
    name = (row.get("name") or "").strip()
    cat_raw = (row.get("category") or "").strip()
    slug = _slugify_cat(cat_raw)
    if not name or not slug:
        return None
    weight_grams_raw = row.get("Weight (gm)") or row.get("weight_grams") or row.get("Weight") or ""
    weight_grams = _parse_float(weight_grams_raw, 0.0)
    weight_grams_val: Optional[float] = weight_grams if weight_grams > 0 else None
    weight_display = _display_weight(weight_grams_val, (row.get("sku") or "").strip())
    price = _parse_float(row.get("price"), 0.0)
    tags_raw = (row.get("tags") or "").strip()
    tags = [t.strip() for t in re.split(r"[|,;]", tags_raw) if t.strip()] if tags_raw else []
    variants_raw = (row.get("variants") or "").strip()
    variants = [v.strip() for v in re.split(r"[|,;]", variants_raw) if v.strip()] if variants_raw else []
    product_code = (row.get("Product Code") or row.get("product_code") or "").strip()
    # deterministic id from product_code (falls back to name+sku)
    key = product_code or f"{name}-{row.get('sku', '')}"
    import hashlib
    pid = "p-" + hashlib.md5(key.encode()).hexdigest()[:12]
    return {
        "id": pid,
        "name": name,
        "description": (row.get("description") or name).strip(),
        "category_slug": slug,
        "price": price,
        "price_lek": price,
        "price_eur": round(price / LEK_PER_EUR, 2),
        "discount": _parse_float(row.get("discount"), 0.0),
        "sku": (row.get("sku") or "").strip(),
        "product_code": product_code,
        "ean_barcode": (row.get("EAN Barcode") or row.get("ean_barcode") or "").strip(),
        "stock": _parse_int(row.get("stock"), 0),
        "in_stock": _parse_int(row.get("stock"), 0) > 0,
        "weight": weight_display,
        "weight_grams": weight_grams_val,
        "weight_grams_inferred": False,
        "brand": (row.get("brand") or "").strip(),
        "tags": tags,
        "variants": variants,
        "image_emoji": "🛒",
        "image_url": _normalize_drive_url(row.get("image_url") or ""),
        "unit": weight_display or (row.get("sku") or "").strip(),
    }


async def _import_products_from_csv_text(csv_text: str, replace: bool = False) -> dict:
    """Parse CSV text, upsert products by id. Returns counts."""
    reader = csv.DictReader(io.StringIO(csv_text))
    imported = 0
    skipped = 0
    per_cat: dict = {}
    if replace:
        await db.products.delete_many({})
    for row in reader:
        prod = _row_to_product(row)
        if not prod:
            skipped += 1
            continue
        await db.products.update_one({"id": prod["id"]}, {"$set": prod}, upsert=True)
        per_cat[prod["category_slug"]] = per_cat.get(prod["category_slug"], 0) + 1
        imported += 1
    # refresh category product_count
    for slug, n in per_cat.items():
        real_n = await db.products.count_documents({"category_slug": slug})
        await db.categories.update_one({"slug": slug}, {"$set": {"product_count": real_n}})
    # also set counts for cats with 0 products
    for c in CATEGORIES_SEED:
        real_n = await db.products.count_documents({"category_slug": c["slug"]})
        await db.categories.update_one({"slug": c["slug"]}, {"$set": {"product_count": real_n}})
    return {"imported": imported, "skipped": skipped, "per_category": per_cat}


# ------------------------------------------------------------------
# Auth helpers
# ------------------------------------------------------------------
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = os.environ.get("JWT_ALGORITHM", "HS256")
JWT_EXP_HOURS = int(os.environ.get("JWT_EXP_HOURS", "720"))


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def check_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def make_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXP_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


async def get_current_user(authorization: Annotated[Optional[str], Header()] = None) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user_id = payload.get("sub")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ------------------------------------------------------------------
# Models
# ------------------------------------------------------------------
class Category(BaseModel):
    id: str
    name: str
    emoji: str
    slug: str
    coming_soon: bool = False
    product_count: int = 0
    sort_order: int = 0
    image_url: Optional[str] = None


class Product(BaseModel):
    id: str
    name: str
    description: str = ""
    category_slug: str
    # pricing (base = LEK; app displays LEK or EUR)
    price: float
    price_lek: float
    price_eur: float
    discount: float = 0.0
    # inventory
    sku: str = ""
    product_code: str = ""
    ean_barcode: str = ""
    stock: int = 0
    in_stock: bool = True
    # weight
    weight: str = ""
    weight_grams: Optional[float] = None
    weight_grams_inferred: bool = False
    # taxonomy
    brand: str = ""
    tags: List[str] = []
    variants: List[str] = []
    # media
    image_emoji: str = "🛒"
    image_url: Optional[str] = None
    unit: str = ""


class BannerOut(BaseModel):
    message: str
    free_delivery_min: float = 1500.0
    delivery_fee: float = 99.0


class LoginIn(BaseModel):
    phone: str = Field(..., min_length=8)
    password: str = Field(..., min_length=4)


class CheckPhoneIn(BaseModel):
    phone: str = Field(..., min_length=8)


class SendOtpIn(BaseModel):
    phone: str = Field(..., min_length=8)


class VerifyOtpIn(BaseModel):
    phone: str
    code: str


class SetPasswordIn(BaseModel):
    signup_token: str
    password: str = Field(..., min_length=6)
    full_name: str = ""
    email: Optional[EmailStr] = None
    language: str = "en"
    currency: Literal["LEK", "EUR"] = "LEK"


class AuthOut(BaseModel):
    token: str
    user: dict


class AddressIn(BaseModel):
    label: str = "Home"
    line1: str = ""
    line2: str = ""
    city: str = ""
    state: str = ""  # Qark / State / Region
    area: str = ""  # Lagje / Area / Neighborhood
    landmark: str = ""  # Pranë / Afër
    postal_code: str = ""
    country: str = "Albania"
    country_code: str = "AL"
    phone: str = ""
    whatsapp: str = ""  # optional WhatsApp number
    entry_mode: str = "manual"  # "manual" or "map"
    lat: Optional[float] = None
    lng: Optional[float] = None
    formatted_address: str = ""


class CartItemIn(BaseModel):
    product_id: str
    qty: int = 1


class CartItemUpdate(BaseModel):
    qty: int


class PlaceOrderIn(BaseModel):
    address: AddressIn
    note: str = ""
    currency: Literal["LEK", "EUR"] = "LEK"


# ------------------------------------------------------------------
# App + Router
# ------------------------------------------------------------------
app = FastAPI(title="Bharat Bazaar API")
api = APIRouter(prefix="/api")


@api.get("/health")
async def health():
    return {"status": "ok", "service": "bharat_bazaar", "ts": datetime.now(timezone.utc).isoformat()}


# ---------- Public catalog ----------
@api.get("/banner", response_model=BannerOut)
async def get_banner():
    return BannerOut(
        message="Free delivery on orders over 1500 L · Cash on delivery available",
        free_delivery_min=1500.0,
        delivery_fee=99.0,
    )


@api.get("/categories", response_model=List[Category])
async def list_categories():
    cats = await db.categories.find({}, {"_id": 0}).sort("sort_order", 1).to_list(200)
    return cats


@api.get("/products", response_model=List[Product])
async def list_products(
    category: Optional[str] = Query(None, description="category slug"),
    q: Optional[str] = Query(None, description="search query"),
    limit: int = Query(100, ge=1, le=500),
):
    query: dict = {}
    if category:
        query["category_slug"] = category
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
            {"tags": {"$regex": q, "$options": "i"}},
        ]
    items = await db.products.find(query, {"_id": 0}).limit(limit).to_list(limit)
    return items


@api.get("/products/{product_id}", response_model=Product)
async def get_product(product_id: str):
    item = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Product not found")
    return item


# ---------- Auth ----------
@api.post("/auth/check-phone")
async def check_phone(payload: CheckPhoneIn):
    phone = payload.phone.strip()
    if not phone.startswith("+"):
        raise HTTPException(status_code=400, detail="Phone must be E.164 (e.g. +355...)")
    user = await db.users.find_one({"phone": phone}, {"_id": 0, "id": 1})
    return {"exists": bool(user), "phone": phone}


@api.post("/auth/login", response_model=AuthOut)
async def login(payload: LoginIn):
    phone = payload.phone.strip()
    user = await db.users.find_one({"phone": phone})
    if not user or not check_pw(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid phone or password")
    token = make_token(user["id"])
    user.pop("_id", None)
    user.pop("password_hash", None)
    return {"token": token, "user": user}


def _gen_otp() -> str:
    return "".join(secrets.choice("0123456789") for _ in range(OTP_LENGTH))


async def _send_sms_otp(phone: str, code: str) -> dict:
    if not twilio_client:
        logger.warning("Twilio not configured; OTP not sent for %s (code=%s)", phone, code)
        return {"sent": False, "channel": "mock"}
    body = f"Your Bharat Bazaar verification code is {code}. It expires in {OTP_EXPIRY_MINUTES} minutes."
    kwargs = {"body": body, "to": phone}
    if TWILIO_MSID:
        kwargs["messaging_service_sid"] = TWILIO_MSID
    elif TWILIO_FROM:
        kwargs["from_"] = TWILIO_FROM
    else:
        raise HTTPException(status_code=500, detail="Twilio sender not configured")
    try:
        msg = twilio_client.messages.create(**kwargs)
        return {"sent": True, "channel": "sms", "sid": msg.sid}
    except TwilioRestException as exc:
        # In dev/preview environments Twilio rejects non-verified / synthetic
        # phone numbers (error 21211 etc.). Fall back to mock mode so the
        # signup flow stays testable; debug_code is exposed in the response.
        logger.warning("Twilio send error (falling back to mock): %s", exc)
        return {"sent": False, "channel": "mock", "twilio_error": getattr(exc, "msg", str(exc))}


@api.post("/auth/register/send-otp")
async def send_register_otp(payload: SendOtpIn):
    phone = payload.phone.strip()
    if not phone.startswith("+"):
        raise HTTPException(status_code=400, detail="Phone must be E.164 (e.g. +355...)")
    # Reject if a verified user with this phone already exists
    existing = await db.users.find_one({"phone": phone})
    if existing:
        raise HTTPException(status_code=409, detail="Phone already registered. Please login instead.")
    code = _gen_otp()
    await db.otp_sessions.delete_many({"phone": phone})
    await db.otp_sessions.insert_one(
        {
            "phone": phone,
            "code": code,
            "attempts": 0,
            "created_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES),
        }
    )
    result = await _send_sms_otp(phone, code)
    resp = {"ok": True, "phone": phone, "expires_in_minutes": OTP_EXPIRY_MINUTES}
    # In mock mode (twilio missing) we expose the code so devs can test
    if not result.get("sent"):
        resp["debug_code"] = code
    return resp


@api.post("/auth/register/verify-otp")
async def verify_register_otp(payload: VerifyOtpIn):
    phone = payload.phone.strip()
    session = await db.otp_sessions.find_one({"phone": phone})
    if not session:
        raise HTTPException(status_code=400, detail="No OTP requested for this phone")
    exp = session.get("expires_at")
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp and exp < datetime.now(timezone.utc):
        await db.otp_sessions.delete_one({"phone": phone})
        raise HTTPException(status_code=400, detail="OTP expired, please request a new one")
    if session.get("attempts", 0) >= 5:
        await db.otp_sessions.delete_one({"phone": phone})
        raise HTTPException(status_code=429, detail="Too many attempts")
    if payload.code.strip() != session.get("code"):
        await db.otp_sessions.update_one({"phone": phone}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Invalid OTP")

    # OTP is valid — issue short-lived signup token; DO NOT create the user yet.
    signup_payload = {
        "phone": phone,
        "typ": "signup",
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
    }
    signup_token = jwt.encode(signup_payload, JWT_SECRET, algorithm=JWT_ALGO)
    await db.otp_sessions.delete_one({"phone": phone})
    return {"ok": True, "signup_token": signup_token, "phone": phone, "expires_in_minutes": 15}


@api.post("/auth/demo-login", response_model=AuthOut)
async def demo_login():
    """One-tap demo login for showcasing the app in any environment (dev or prod).
    Returns a JWT for the seeded demo user. Resets the demo user's cart so each
    demo session starts fresh. No credentials required."""
    demo_id = "demo-user-001"
    user = await db.users.find_one({"id": demo_id}, {"_id": 0, "password_hash": 0})
    if not user:
        # Auto-provision if seeding hasn't run yet (defensive; startup handler
        # already seeds this user idempotently).
        user_doc = {
            "id": demo_id,
            "username": "demo",
            "phone": "+355690000000",
            "full_name": "Demo Customer",
            "email": "demo@bharatbazaar.com",
            "language": "en",
            "currency": "LEK",
            "password_hash": hash_pw(secrets.token_hex(16)),
            "addresses": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "is_demo": True,
        }
        await db.users.insert_one(user_doc)
        user = {k: v for k, v in user_doc.items() if k != "password_hash"}
    # Reset the demo cart so every demo session starts clean.
    await db.carts.update_one(
        {"user_id": demo_id},
        {"$set": {"items": [], "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    token = make_token(demo_id)
    return {"token": token, "user": user}


@api.post("/auth/register/set-password", response_model=AuthOut)
async def set_password(payload: SetPasswordIn):
    try:
        data = jwt.decode(payload.signup_token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=400, detail="Signup session expired, please verify OTP again")
    except jwt.PyJWTError:
        raise HTTPException(status_code=400, detail="Invalid signup token")
    if data.get("typ") != "signup":
        raise HTTPException(status_code=400, detail="Invalid signup token")
    phone = data["phone"]
    if await db.users.find_one({"phone": phone}):
        raise HTTPException(status_code=409, detail="Account already exists for this phone. Please login.")
    user_id = secrets.token_hex(8)
    # username is derived from phone (retained for backward compat with existing indexes)
    derived_username = phone.replace("+", "u")
    user_doc = {
        "id": user_id,
        "username": derived_username,
        "phone": phone,
        "full_name": payload.full_name,
        "email": payload.email,
        "language": payload.language,
        "currency": payload.currency,
        "password_hash": hash_pw(payload.password),
        "addresses": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    user_doc.pop("_id", None)
    user_doc.pop("password_hash", None)
    token = make_token(user_id)
    return {"token": token, "user": user_doc}


# ---------- Me / addresses ----------
@api.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user


class MeUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    language: Optional[str] = None
    currency: Optional[Literal["LEK", "EUR"]] = None


@api.patch("/me")
async def update_me(payload: MeUpdate, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if update:
        await db.users.update_one({"id": user["id"]}, {"$set": update})
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return fresh


@api.post("/me/addresses")
async def add_address(addr: AddressIn, user: dict = Depends(get_current_user)):
    addr_doc = addr.model_dump()
    addr_doc["id"] = secrets.token_hex(6)
    await db.users.update_one({"id": user["id"]}, {"$push": {"addresses": addr_doc}})
    return addr_doc


@api.delete("/me/addresses/{addr_id}")
async def remove_address(addr_id: str, user: dict = Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$pull": {"addresses": {"id": addr_id}}})
    return {"ok": True}


# ---------- Cart ----------
async def _get_or_create_cart(user_id: str) -> dict:
    cart = await db.carts.find_one({"user_id": user_id}, {"_id": 0})
    if not cart:
        cart = {"user_id": user_id, "items": [], "updated_at": datetime.now(timezone.utc).isoformat()}
        await db.carts.insert_one(dict(cart))
    return cart


async def _enrich_cart(cart: dict) -> dict:
    if not cart.get("items"):
        return {"items": [], "subtotal_lek": 0.0, "subtotal_eur": 0.0, "count": 0}
    ids = [it["product_id"] for it in cart["items"]]
    products = await db.products.find({"id": {"$in": ids}}, {"_id": 0}).to_list(500)
    by_id = {p["id"]: p for p in products}
    items_out = []
    subtotal_lek = 0.0
    subtotal_eur = 0.0
    count = 0
    for it in cart["items"]:
        p = by_id.get(it["product_id"])
        if not p:
            continue
        line_lek = p["price_lek"] * it["qty"]
        line_eur = p["price_eur"] * it["qty"]
        subtotal_lek += line_lek
        subtotal_eur += line_eur
        count += it["qty"]
        items_out.append(
            {
                "product_id": p["id"],
                "name": p["name"],
                "image_emoji": p["image_emoji"],
                "image_url": p.get("image_url"),
                "unit": p["unit"],
                "price_lek": p["price_lek"],
                "price_eur": p["price_eur"],
                "qty": it["qty"],
                "line_lek": line_lek,
                "line_eur": line_eur,
            }
        )
    return {
        "items": items_out,
        "subtotal_lek": round(subtotal_lek, 2),
        "subtotal_eur": round(subtotal_eur, 2),
        "count": count,
    }


@api.get("/cart")
async def get_cart(user: dict = Depends(get_current_user)):
    cart = await _get_or_create_cart(user["id"])
    return await _enrich_cart(cart)


@api.post("/cart")
async def add_to_cart(payload: CartItemIn, user: dict = Depends(get_current_user)):
    prod = await db.products.find_one({"id": payload.product_id}, {"_id": 0, "id": 1})
    if not prod:
        raise HTTPException(status_code=404, detail="Product not found")
    cart = await _get_or_create_cart(user["id"])
    items = cart.get("items", [])
    found = False
    for it in items:
        if it["product_id"] == payload.product_id:
            it["qty"] += payload.qty
            found = True
            break
    if not found:
        items.append({"product_id": payload.product_id, "qty": max(payload.qty, 1)})
    items = [it for it in items if it["qty"] > 0]
    await db.carts.update_one(
        {"user_id": user["id"]},
        {"$set": {"items": items, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return await _enrich_cart({"items": items})


@api.patch("/cart/{product_id}")
async def update_cart_item(product_id: str, payload: CartItemUpdate, user: dict = Depends(get_current_user)):
    cart = await _get_or_create_cart(user["id"])
    items = cart.get("items", [])
    for it in items:
        if it["product_id"] == product_id:
            it["qty"] = payload.qty
            break
    items = [it for it in items if it["qty"] > 0]
    await db.carts.update_one({"user_id": user["id"]}, {"$set": {"items": items}})
    return await _enrich_cart({"items": items})


@api.delete("/cart/{product_id}")
async def remove_cart_item(product_id: str, user: dict = Depends(get_current_user)):
    cart = await _get_or_create_cart(user["id"])
    items = [it for it in cart.get("items", []) if it["product_id"] != product_id]
    await db.carts.update_one({"user_id": user["id"]}, {"$set": {"items": items}})
    return await _enrich_cart({"items": items})


@api.delete("/cart")
async def clear_cart(user: dict = Depends(get_current_user)):
    await db.carts.update_one({"user_id": user["id"]}, {"$set": {"items": []}})
    return {"items": [], "subtotal_lek": 0.0, "subtotal_eur": 0.0, "count": 0}


# ---------- Orders ----------
@api.post("/orders")
async def place_order(payload: PlaceOrderIn, user: dict = Depends(get_current_user)):
    cart = await _get_or_create_cart(user["id"])
    enriched = await _enrich_cart(cart)
    if not enriched["items"]:
        raise HTTPException(status_code=400, detail="Cart is empty")
    free_min = 1500.0
    delivery_fee_lek = 0.0 if enriched["subtotal_lek"] >= free_min else 99.0
    delivery_fee_eur = 0.0 if enriched["subtotal_lek"] >= free_min else 0.99
    total_lek = enriched["subtotal_lek"] + delivery_fee_lek
    total_eur = enriched["subtotal_eur"] + delivery_fee_eur
    order_id = "MBC" + secrets.token_hex(4).upper()
    order = {
        "id": order_id,
        "user_id": user["id"],
        "items": enriched["items"],
        "address": payload.address.model_dump(),
        "note": payload.note,
        "payment_method": "COD",
        "currency": payload.currency,
        "status": "placed",
        "subtotal_lek": enriched["subtotal_lek"],
        "subtotal_eur": enriched["subtotal_eur"],
        "delivery_fee_lek": delivery_fee_lek,
        "delivery_fee_eur": delivery_fee_eur,
        "total_lek": round(total_lek, 2),
        "total_eur": round(total_eur, 2),
        "placed_at": datetime.now(timezone.utc).isoformat(),
        "eta_minutes": random.randint(35, 75),
    }
    await db.orders.insert_one(dict(order))
    await db.carts.update_one({"user_id": user["id"]}, {"$set": {"items": []}})
    order.pop("_id", None)
    return order


@api.get("/orders")
async def list_orders(user: dict = Depends(get_current_user)):
    orders = await db.orders.find({"user_id": user["id"]}, {"_id": 0}).sort("placed_at", -1).to_list(200)
    return orders


@api.get("/orders/{order_id}")
async def get_order(order_id: str, user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id, "user_id": user["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


# ---------- Geo / address picker (Google Places proxy) ----------
SERVICEABLE_COUNTRY_CODES = {"AL"}


@api.get("/geo/autocomplete")
async def geo_autocomplete(input: str = Query(..., min_length=2), country: str = Query("al")):
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(status_code=500, detail="Maps API key not configured")
    params = {
        "input": input,
        "key": GOOGLE_MAPS_API_KEY,
        "components": f"country:{country.lower()}",
        "language": "en",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get("https://maps.googleapis.com/maps/api/place/autocomplete/json", params=params)
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="Places autocomplete failed")
    data = r.json()
    preds = [
        {
            "place_id": p.get("place_id"),
            "description": p.get("description"),
            "main_text": (p.get("structured_formatting") or {}).get("main_text"),
            "secondary_text": (p.get("structured_formatting") or {}).get("secondary_text"),
        }
        for p in data.get("predictions", [])
    ]
    return {"predictions": preds, "status": data.get("status")}


@api.get("/geo/place-details")
async def geo_place_details(place_id: str = Query(...)):
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(status_code=500, detail="Maps API key not configured")
    params = {
        "place_id": place_id,
        "key": GOOGLE_MAPS_API_KEY,
        "fields": "formatted_address,geometry/location,address_components,name",
        "language": "en",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get("https://maps.googleapis.com/maps/api/place/details/json", params=params)
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="Places details failed")
    data = r.json()
    result = data.get("result") or {}
    loc = ((result.get("geometry") or {}).get("location") or {})
    parts = {}
    country_code = None
    for comp in result.get("address_components", []):
        types = comp.get("types", [])
        if "country" in types:
            country_code = comp.get("short_name")
            parts["country"] = comp.get("long_name")
        if "postal_code" in types:
            parts["postal_code"] = comp.get("long_name")
        if "administrative_area_level_1" in types:
            parts["state"] = comp.get("long_name")
        if "administrative_area_level_2" in types:
            parts.setdefault("city", comp.get("long_name"))
        if "locality" in types:
            parts["city"] = comp.get("long_name")  # locality overrides admin_area_level_2 as city
        if "sublocality" in types or "sublocality_level_1" in types or "neighborhood" in types:
            parts.setdefault("area", comp.get("long_name"))
        if "route" in types:
            parts.setdefault("street", comp.get("long_name"))
        if "street_number" in types:
            parts["street_number"] = comp.get("long_name")
    line1 = " ".join([p for p in [parts.get("street_number"), parts.get("street")] if p]) or (result.get("name") or "")
    serviceable = country_code in SERVICEABLE_COUNTRY_CODES
    return {
        "place_id": place_id,
        "formatted_address": result.get("formatted_address"),
        "lat": loc.get("lat"),
        "lng": loc.get("lng"),
        "country_code": country_code,
        "country": parts.get("country"),
        "state": parts.get("state", ""),
        "city": parts.get("city"),
        "area": parts.get("area", ""),
        "postal_code": parts.get("postal_code", ""),
        "line1": line1,
        "serviceable": serviceable,
        "unserviceable_reason": None if serviceable else "We currently deliver only within Albania.",
    }


@api.get("/geo/static-map")
async def geo_static_map(
    lat: float = Query(...),
    lng: float = Query(...),
    zoom: int = Query(15, ge=8, le=20),
    width: int = Query(600, ge=100, le=800),
    height: int = Query(300, ge=100, le=400),
):
    """Stream a Google Static Map PNG through the backend so the API key stays server-side."""
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(status_code=500, detail="Maps API key not configured")
    url = (
        "https://maps.googleapis.com/maps/api/staticmap"
        f"?center={lat},{lng}&zoom={zoom}&size={width}x{height}"
        f"&markers=color:0xFF5722%7C{lat},{lng}&key={GOOGLE_MAPS_API_KEY}"
        "&scale=2&style=feature:poi|element:labels|visibility:off"
    )
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(url)
    if r.status_code != 200:
        # Common cause: "Maps Static API" not enabled on the API key.
        # Return 502 so the frontend <Image> onError handler can show a graceful fallback.
        raise HTTPException(status_code=502, detail="static_map_unavailable")
    return Response(
        content=r.content,
        media_type=r.headers.get("content-type", "image/png"),
        headers={"Cache-Control": "public, max-age=86400"},
    )


# ---------- Admin: bulk import ----------
def _check_admin(secret: Optional[str]):
    if not ADMIN_SECRET:
        raise HTTPException(status_code=500, detail="ADMIN_SECRET not configured on server")
    if not secret or secret != ADMIN_SECRET:
        raise HTTPException(status_code=401, detail="Invalid admin secret")


@api.post("/admin/products/import")
async def admin_import_products(
    file: UploadFile = File(...),
    replace: bool = Query(False, description="If true, delete all existing products before importing"),
    x_admin_secret: Annotated[Optional[str], Header(alias="X-Admin-Secret")] = None,
):
    _check_admin(x_admin_secret)
    raw = await file.read()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")
    result = await _import_products_from_csv_text(text, replace=replace)
    return {"ok": True, **result}


# ------------------ Google Drive → local static sync ------------------
def _extract_drive_id(url: str) -> Optional[str]:
    if not url:
        return None
    m = re.search(r"/d/([A-Za-z0-9_-]+)", url) or re.search(r"[?&]id=([A-Za-z0-9_-]+)", url)
    return m.group(1) if m else None


async def _download_drive_file(file_id: str) -> Optional[bytes]:
    """Download a Drive image via Google's public CDN endpoints.

    Tries endpoints in order:
      1. lh3.googleusercontent.com/d/{id}=w800  (image CDN, fastest)
      2. drive.google.com/uc?export=download&id={id}  (fallback)
    The API-key path is skipped here because Google's abuse detection
    aggressively throttles server-to-server media downloads via that route.
    """
    urls = [
        f"https://lh3.googleusercontent.com/d/{file_id}=w800",
        f"https://drive.google.com/uc?export=download&id={file_id}",
    ]
    headers = {"User-Agent": "Mozilla/5.0 (compatible; BharatBazaar/1.0)"}
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True, headers=headers) as client:
        for url in urls:
            try:
                r = await client.get(url)
            except httpx.RequestError as exc:
                logger.warning("Drive fetch network error %s: %s", file_id, exc)
                continue
            if r.status_code == 200 and r.headers.get("content-type", "").startswith("image/"):
                return r.content
            logger.debug("Drive fetch %s from %s -> %s", file_id, url, r.status_code)
    logger.warning("Drive download failed for %s from all endpoints", file_id)
    return None


async def _sync_one_product_image(product: dict) -> str:
    """Download drive image for one product, save to disk, update DB. Returns status."""
    src = product.get("image_url") or ""
    if not src or "drive.google" not in src and "googleusercontent" not in src:
        return "skipped-no-drive"
    fid = _extract_drive_id(src)
    if not fid:
        return "skipped-no-id"
    ext = "jpg"
    fname = f"{product.get('product_code') or product['id']}.{ext}"
    fpath = PRODUCT_IMG_DIR / fname
    if fpath.exists() and fpath.stat().st_size > 500:
        # already synced — just make sure DB points to local
        new_url = f"/api/static/products/{fname}"
        if product.get("image_url") != new_url:
            await db.products.update_one({"id": product["id"]}, {"$set": {"image_url": new_url}})
        return "cached"
    data = await _download_drive_file(fid)
    if not data:
        return "download-failed"
    fpath.write_bytes(data)
    new_url = f"/api/static/products/{fname}"
    await db.products.update_one({"id": product["id"]}, {"$set": {"image_url": new_url}})
    return "synced"


@api.post("/admin/products/sync-images")
async def admin_sync_product_images(
    limit: int = Query(500, ge=1, le=2000),
    x_admin_secret: Annotated[Optional[str], Header(alias="X-Admin-Secret")] = None,
):
    _check_admin(x_admin_secret)
    # find products whose image_url still points to Google Drive
    cur = db.products.find(
        {"image_url": {"$regex": "google", "$options": "i"}},
        {"_id": 0, "id": 1, "product_code": 1, "image_url": 1, "name": 1},
    ).limit(limit)
    counts = {"synced": 0, "cached": 0, "download-failed": 0, "skipped-no-id": 0, "skipped-no-drive": 0}
    failed: list = []
    async for prod in cur:
        status = await _sync_one_product_image(prod)
        counts[status] = counts.get(status, 0) + 1
        if status == "download-failed":
            failed.append({"id": prod["id"], "name": prod.get("name")})
    return {"ok": True, "counts": counts, "failed_sample": failed[:10]}


# ------------------------------------------------------------------
# Startup: seed data
# ------------------------------------------------------------------
@app.on_event("startup")
async def seed_db():
    # Version-gated migration: if the stored catalog version doesn't match the
    # current seed, wipe categories + products and re-seed. Users, carts, and
    # orders are preserved across catalog migrations.
    meta = await db.meta.find_one({"key": "catalog_seed"})
    current_version = (meta or {}).get("version")
    need_reseed = current_version != SEED_VERSION
    if need_reseed:
        logger.info("Catalog seed version mismatch (%s -> %s); re-seeding", current_version, SEED_VERSION)
        await db.categories.delete_many({})
        await db.products.delete_many({})
        # Also clear carts so items referencing old product ids don't linger
        await db.carts.update_many({}, {"$set": {"items": []}})

    cat_count = await db.categories.count_documents({})
    if cat_count == 0:
        await db.categories.insert_many([dict(c) for c in CATEGORIES_SEED])
        logger.info("Seeded %d categories", len(CATEGORIES_SEED))
    prod_count = await db.products.count_documents({})
    if prod_count == 0:
        csv_path = ROOT_DIR / "inventory_import.csv"
        if csv_path.exists():
            with open(csv_path, encoding="latin-1") as f:
                text = f.read()
            result = await _import_products_from_csv_text(text, replace=False)
            logger.info("Imported %d products from CSV (skipped %d)", result["imported"], result["skipped"])
        else:
            # Fallback: sample seed
            await db.products.insert_many([dict(p) for p in PRODUCTS_SEED])
            logger.info("Seeded %d sample products", len(PRODUCTS_SEED))
            for c in CATEGORIES_SEED:
                n = sum(1 for p in PRODUCTS_SEED if p["category_slug"] == c["slug"])
                await db.categories.update_one({"slug": c["slug"]}, {"$set": {"product_count": n}})
    if need_reseed:
        await db.meta.update_one(
            {"key": "catalog_seed"},
            {"$set": {"key": "catalog_seed", "version": SEED_VERSION,
                      "applied_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
    await db.users.create_index("username", unique=True)
    await db.users.create_index("phone", unique=True, sparse=True)
    await db.carts.create_index("user_id", unique=True)
    await db.orders.create_index("user_id")
    # seed demo user (idempotent)
    if not await db.users.find_one({"username": "demo"}):
        await db.users.insert_one(
            {
                "id": "demo-user-001",
                "username": "demo",
                "phone": "+355690000000",
                "full_name": "Demo Customer",
                "email": "demo@bharatbazaar.com",
                "language": "en",
                "currency": "LEK",
                "password_hash": hash_pw("demo1234"),
                "addresses": [
                    {
                        "id": "addr-demo",
                        "label": "Home",
                        "line1": "Rruga e Durresit 12",
                        "line2": "Apt 4",
                        "city": "Tirana",
                        "postal_code": "1001",
                        "country": "Albania",
                        "phone": "+355690000000",
                    }
                ],
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        logger.info("Seeded demo user (demo / demo1234)")


@app.on_event("shutdown")
async def shutdown():
    mongo_client.close()


app.include_router(api)
app.mount("/api/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
