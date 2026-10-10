"""Pydantic request/response models shared across route modules."""
from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field


# ---------- Catalog ----------
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
    price: float
    price_lek: float
    price_eur: float
    mrp_lek: Optional[float] = None
    discount: float = 0.0
    sku: str = ""
    subcategory: str = ""
    product_code: str = ""
    ean_barcode: str = ""
    stock: int = 0
    in_stock: bool = True
    weight: str = ""
    weight_grams: Optional[float] = None
    weight_grams_inferred: bool = False
    brand: str = ""
    tags: List[str] = []
    variants: List[str] = []
    image_emoji: str = "🛒"
    image_url: Optional[str] = None
    unit: str = ""


class BannerOut(BaseModel):
    message: str
    free_delivery_min: float = 1500.0
    delivery_fee: float = 99.0


# ---------- Auth ----------
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


class ResetPasswordIn(BaseModel):
    reset_token: str
    password: str = Field(..., min_length=6)


class UpdateProfileIn(BaseModel):
    """Full profile update — used by the 'Complete profile' screen and later edits."""
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    language: Optional[str] = None
    currency: Optional[Literal["LEK", "EUR"]] = None
    avatar_data_url: Optional[str] = None  # data:image/...;base64,..
    avatar_url: Optional[str] = None       # allow clearing/setting directly


class AuthOut(BaseModel):
    token: str
    user: dict


# ---------- Me / Address ----------
class AddressIn(BaseModel):
    label: str = "Home"
    line1: str = ""
    line2: str = ""
    city: str = ""
    state: str = ""
    area: str = ""
    landmark: str = ""
    postal_code: str = ""
    country: str = "Albania"
    country_code: str = "AL"
    phone: str = ""
    whatsapp: str = ""
    entry_mode: str = "manual"
    lat: Optional[float] = None
    lng: Optional[float] = None
    formatted_address: str = ""


class MeUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    language: Optional[str] = None
    currency: Optional[Literal["LEK", "EUR"]] = None


# ---------- Cart ----------
class CartItemIn(BaseModel):
    product_id: str
    qty: int = 1


class CartItemUpdate(BaseModel):
    qty: int


# ---------- Orders ----------
class PlaceOrderIn(BaseModel):
    address: AddressIn
    note: str = ""
    currency: Literal["LEK", "EUR"] = "LEK"
    coupon_code: Optional[str] = None


class AdminOrderPatch(BaseModel):
    status: Optional[str] = None
    delivery_person_name: Optional[str] = None
    delivery_person_phone: Optional[str] = None
    admin_note: Optional[str] = None


# ---------- Admin Products ----------
class AdminProductIn(BaseModel):
    name: str
    description: str = ""
    category_slug: str
    price_lek: float
    price_eur: Optional[float] = None
    mrp_lek: Optional[float] = None
    discount: float = 0.0
    sku: str = ""
    product_code: str = ""
    ean_barcode: str = ""
    stock: int = 0
    in_stock: bool = True
    weight: str = ""
    weight_grams: Optional[float] = None
    brand: str = ""
    tags: List[str] = []
    variants: List[str] = []
    image_emoji: str = "🛒"
    image_url: Optional[str] = None
    unit: str = ""
    image_data_url: Optional[str] = None


class AdminProductPatch(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category_slug: Optional[str] = None
    price_lek: Optional[float] = None
    price_eur: Optional[float] = None
    mrp_lek: Optional[float] = None
    discount: Optional[float] = None
    sku: Optional[str] = None
    product_code: Optional[str] = None
    ean_barcode: Optional[str] = None
    stock: Optional[int] = None
    in_stock: Optional[bool] = None
    weight: Optional[str] = None
    weight_grams: Optional[float] = None
    brand: Optional[str] = None
    tags: Optional[List[str]] = None
    variants: Optional[List[str]] = None
    image_emoji: Optional[str] = None
    image_url: Optional[str] = None
    unit: Optional[str] = None
    image_data_url: Optional[str] = None


# ---------- Offers (Phase 4) ----------
OfferType = Literal["banner", "coupon", "category_discount", "promo_strip"]
DiscountType = Literal["percent", "fixed"]


class OfferIn(BaseModel):
    """Unified create/update payload for banners, coupons, and category discounts."""
    type: OfferType
    title: str
    description: str = ""
    active: bool = True
    priority: int = 0

    # banner
    banner_image_url: Optional[str] = None
    banner_bg_color: str = "#FF5722"
    banner_text_color: str = "#FFFFFF"
    cta_label: str = ""
    cta_target: str = ""
    banner_image_data_url: Optional[str] = None

    # promo_strip (the always-visible animated ribbon on Home)
    promo_headline: Optional[str] = None
    promo_amount: Optional[str] = None
    promo_sub: Optional[str] = None

    # coupon
    coupon_code: Optional[str] = None
    discount_type: Optional[DiscountType] = None
    discount_value: float = 0.0
    min_order_lek: float = 0.0
    max_discount_lek: Optional[float] = None
    usage_limit: Optional[int] = None
    per_user_limit: Optional[int] = None

    # category_discount
    category_slug: Optional[str] = None
    cat_discount_percent: float = 0.0

    # coupon + category_discount
    starts_at: Optional[str] = None
    ends_at: Optional[str] = None


class OfferPatch(BaseModel):
    """Partial update — all fields optional."""
    type: Optional[OfferType] = None
    title: Optional[str] = None
    description: Optional[str] = None
    active: Optional[bool] = None
    priority: Optional[int] = None

    banner_image_url: Optional[str] = None
    banner_bg_color: Optional[str] = None
    banner_text_color: Optional[str] = None
    cta_label: Optional[str] = None
    cta_target: Optional[str] = None
    banner_image_data_url: Optional[str] = None

    promo_headline: Optional[str] = None
    promo_amount: Optional[str] = None
    promo_sub: Optional[str] = None

    coupon_code: Optional[str] = None
    discount_type: Optional[DiscountType] = None
    discount_value: Optional[float] = None
    min_order_lek: Optional[float] = None
    max_discount_lek: Optional[float] = None
    usage_limit: Optional[int] = None
    per_user_limit: Optional[int] = None

    category_slug: Optional[str] = None
    cat_discount_percent: Optional[float] = None

    starts_at: Optional[str] = None
    ends_at: Optional[str] = None


class CouponValidateIn(BaseModel):
    code: str
    subtotal_lek: float = 0.0


# ---------- Shipping settings (Admin-configurable) ----------
class ShippingSettingsIn(BaseModel):
    """Partial update of the store shipping configuration. All optional so the
    admin can tweak individual fields."""
    free_min_tirana_lek: Optional[float] = Field(None, ge=0)
    free_min_outside_lek: Optional[float] = Field(None, ge=0)
    base_tirana_lek: Optional[float] = Field(None, ge=0)
    base_outside_lek: Optional[float] = Field(None, ge=0)
    free_weight_kg: Optional[float] = Field(None, ge=0)
    extra_per_kg_lek: Optional[float] = Field(None, ge=0)
