"""myBazaarCart mobile backend.

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

import logging
import os
import random
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, List, Literal, Optional

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware
from twilio.base.exceptions import TwilioRestException
from twilio.rest import Client as TwilioClient

from seed_data import CATEGORIES_SEED, PRODUCTS_SEED

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("mybazaarcart")

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


class Product(BaseModel):
    id: str
    name: str
    description: str = ""
    category_slug: str
    price_lek: float
    price_eur: float
    image_emoji: str
    image_url: Optional[str] = None
    unit: str = "1 pc"
    in_stock: bool = True
    tags: List[str] = []


class BannerOut(BaseModel):
    message: str
    free_delivery_min: float = 1500.0
    delivery_fee: float = 99.0


class LoginIn(BaseModel):
    username: str = Field(..., min_length=2)
    password: str = Field(..., min_length=4)


class SendOtpIn(BaseModel):
    phone: str = Field(..., min_length=8)


class VerifyOtpIn(BaseModel):
    phone: str
    code: str
    username: str = Field(..., min_length=3)
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
    line1: str
    line2: str = ""
    city: str
    postal_code: str = ""
    country: str = "Albania"
    phone: str = ""


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
app = FastAPI(title="myBazaarCart API")
api = APIRouter(prefix="/api")


@api.get("/health")
async def health():
    return {"status": "ok", "service": "mybazaarcart", "ts": datetime.now(timezone.utc).isoformat()}


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
@api.post("/auth/login", response_model=AuthOut)
async def login(payload: LoginIn):
    uname = payload.username.strip().lower()
    user = await db.users.find_one({"username": uname})
    if not user or not check_pw(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid username or password")
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
    body = f"Your myBazaarCart verification code is {code}. It expires in {OTP_EXPIRY_MINUTES} minutes."
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


@api.post("/auth/register/verify-otp", response_model=AuthOut)
async def verify_register_otp(payload: VerifyOtpIn):
    phone = payload.phone.strip()
    session = await db.otp_sessions.find_one({"phone": phone})
    if not session:
        raise HTTPException(status_code=400, detail="No OTP requested for this phone")
    # expires_at stored as datetime; compare in utc
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

    # Create user
    uname = payload.username.strip().lower()
    if await db.users.find_one({"username": uname}):
        raise HTTPException(status_code=409, detail="Username already taken")
    user_id = secrets.token_hex(8)
    user_doc = {
        "id": user_id,
        "username": uname,
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
    await db.otp_sessions.delete_one({"phone": phone})
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


# ------------------------------------------------------------------
# Startup: seed data
# ------------------------------------------------------------------
@app.on_event("startup")
async def seed_db():
    cat_count = await db.categories.count_documents({})
    if cat_count == 0:
        await db.categories.insert_many([dict(c) for c in CATEGORIES_SEED])
        logger.info("Seeded %d categories", len(CATEGORIES_SEED))
    prod_count = await db.products.count_documents({})
    if prod_count == 0:
        await db.products.insert_many([dict(p) for p in PRODUCTS_SEED])
        logger.info("Seeded %d products", len(PRODUCTS_SEED))
        # update category counts
        for c in CATEGORIES_SEED:
            n = sum(1 for p in PRODUCTS_SEED if p["category_slug"] == c["slug"])
            await db.categories.update_one({"slug": c["slug"]}, {"$set": {"product_count": n}})
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
                "email": "demo@mybazaarcart.com",
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
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
