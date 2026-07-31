"""Public offers endpoints: banners, coupon validation, category discounts."""
from __future__ import annotations

from typing import Annotated, Optional

import jwt
from fastapi import APIRouter, Header, Query

from config import JWT_ALGO, JWT_SECRET
from models import CouponValidateIn
from services.offers import (
    active_category_discount,
    list_active_banners,
    list_active_category_discounts,
    validate_coupon,
)

router = APIRouter(prefix="/offers")


def _optional_user_id(authorization: Optional[str]) -> Optional[str]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        return payload.get("sub")
    except Exception:
        return None


@router.get("/banners")
async def get_active_banners(limit: int = Query(10, ge=1, le=20)):
    banners = await list_active_banners(limit=limit)
    return {"banners": banners, "count": len(banners)}


@router.get("/category-discounts")
async def get_active_category_discounts():
    """Return a lightweight map of {category_slug: percent} for badge/pricing display."""
    active = await list_active_category_discounts()
    m: dict[str, float] = {}
    for o in active:
        slug = o.get("category_slug")
        pct = float(o.get("cat_discount_percent") or 0.0)
        if slug and pct > 0:
            m[slug] = max(m.get(slug, 0), pct)
    return {"discounts": m}


@router.get("/category-discount/{slug}")
async def get_category_discount(slug: str):
    d = await active_category_discount(slug)
    return {"discount": d}


@router.post("/validate-coupon")
async def validate_coupon_endpoint(
    payload: CouponValidateIn,
    authorization: Annotated[Optional[str], Header()] = None,
):
    """Public coupon validate (auth is optional; when present we enforce per-user limits)."""
    user_id = _optional_user_id(authorization)
    result = await validate_coupon(payload.code, payload.subtotal_lek, user_id=user_id)
    return result
