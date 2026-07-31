"""Offers domain logic — banner listing, coupon validation, category discounts.

Offer documents share a single `offers` collection but are distinguished by
`type`. Each type only uses a subset of fields; unrelated fields are ignored.

Types:
- "banner"             -> home carousel promo card (title/image/CTA)
- "coupon"             -> code redeemed at checkout (percent/fixed off)
- "category_discount"  -> % off across all products in a category slug
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from db import db


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_iso(dt: Optional[str]) -> Optional[datetime]:
    if not dt:
        return None
    try:
        s = dt.replace("Z", "+00:00")
        d = datetime.fromisoformat(s)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d
    except Exception:
        return None


def offer_is_active_now(offer: dict) -> bool:
    """True if `active` is true AND we're inside the [starts_at, ends_at] window."""
    if not offer.get("active"):
        return False
    now = _now()
    s = _parse_iso(offer.get("starts_at"))
    if s and now < s:
        return False
    e = _parse_iso(offer.get("ends_at"))
    if e and now > e:
        return False
    return True


async def list_active_banners(limit: int = 10) -> list[dict]:
    cursor = db.offers.find({"type": "banner"}, {"_id": 0}).sort("priority", -1)
    banners: list[dict] = []
    async for off in cursor:
        if offer_is_active_now(off):
            banners.append(off)
        if len(banners) >= limit:
            break
    return banners


async def active_category_discount(category_slug: str) -> Optional[dict]:
    """Return the highest-percent active category discount for a slug, or None."""
    cursor = db.offers.find(
        {"type": "category_discount", "category_slug": category_slug},
        {"_id": 0},
    ).sort("cat_discount_percent", -1)
    async for off in cursor:
        if offer_is_active_now(off):
            return off
    return None


async def list_active_category_discounts() -> list[dict]:
    """Return all currently active category_discount offers (for badge display)."""
    cursor = db.offers.find({"type": "category_discount"}, {"_id": 0})
    active: list[dict] = []
    async for off in cursor:
        if offer_is_active_now(off):
            active.append(off)
    return active


async def find_coupon_by_code(code: str) -> Optional[dict]:
    if not code:
        return None
    return await db.offers.find_one(
        {"type": "coupon", "coupon_code": {"$regex": f"^{code.strip()}$", "$options": "i"}},
        {"_id": 0},
    )


def compute_coupon_discount(coupon: dict, subtotal_lek: float) -> float:
    """Return the LEK discount value for a coupon given the current subtotal."""
    if not coupon:
        return 0.0
    min_order = float(coupon.get("min_order_lek") or 0.0)
    if subtotal_lek < min_order:
        return 0.0
    dtype = coupon.get("discount_type") or "percent"
    value = float(coupon.get("discount_value") or 0.0)
    if dtype == "percent":
        raw = subtotal_lek * (value / 100.0)
    else:  # fixed
        raw = value
    cap = coupon.get("max_discount_lek")
    if cap is not None:
        raw = min(raw, float(cap))
    return round(max(0.0, min(raw, subtotal_lek)), 2)


async def validate_coupon(code: str, subtotal_lek: float, user_id: Optional[str] = None) -> dict:
    """Return {valid, discount_lek, message, coupon?}. Never throws."""
    coupon = await find_coupon_by_code(code)
    if not coupon:
        return {"valid": False, "discount_lek": 0.0, "message": "Coupon not found"}
    if not offer_is_active_now(coupon):
        return {"valid": False, "discount_lek": 0.0, "message": "Coupon is expired or inactive"}
    min_order = float(coupon.get("min_order_lek") or 0.0)
    if subtotal_lek < min_order:
        return {
            "valid": False,
            "discount_lek": 0.0,
            "message": f"Minimum order of {int(min_order)} L required",
        }
    usage_limit = coupon.get("usage_limit")
    usage_count = int(coupon.get("usage_count") or 0)
    if usage_limit is not None and usage_count >= int(usage_limit):
        return {"valid": False, "discount_lek": 0.0, "message": "Coupon usage limit reached"}
    if user_id and coupon.get("per_user_limit"):
        # Count how many orders this user has placed with this coupon
        used_by_user = await db.orders.count_documents({
            "user_id": user_id,
            "coupon_code": {"$regex": f"^{code.strip()}$", "$options": "i"},
        })
        if used_by_user >= int(coupon["per_user_limit"]):
            return {
                "valid": False,
                "discount_lek": 0.0,
                "message": "You've already used this coupon",
            }
    discount = compute_coupon_discount(coupon, subtotal_lek)
    if discount <= 0:
        return {"valid": False, "discount_lek": 0.0, "message": "Coupon doesn't apply to this order"}
    return {
        "valid": True,
        "discount_lek": discount,
        "message": f"Coupon applied · you save {int(discount)} L",
        "coupon": {
            "id": coupon.get("id"),
            "code": coupon.get("coupon_code"),
            "type": coupon.get("discount_type"),
            "value": coupon.get("discount_value"),
        },
    }


async def apply_category_discounts_to_items(items: list[dict]) -> tuple[list[dict], float]:
    """Given enriched cart items, apply category_discount offers to each line.

    Mutates a copy of each item to add `cat_discount_percent` and
    `line_lek_after_cat_discount`. Returns (items, total_cat_discount_lek).
    """
    if not items:
        return items, 0.0
    active = await list_active_category_discounts()
    by_slug = {}
    for o in active:
        slug = o.get("category_slug")
        pct = float(o.get("cat_discount_percent") or 0.0)
        if not slug or pct <= 0:
            continue
        # Keep the highest percent per slug
        if by_slug.get(slug, 0) < pct:
            by_slug[slug] = pct
    total_disc = 0.0
    out: list[dict] = []
    for it in items:
        slug = it.get("category_slug")
        pct = by_slug.get(slug, 0.0)
        line = float(it.get("line_lek") or 0.0)
        d = round(line * (pct / 100.0), 2) if pct > 0 else 0.0
        total_disc += d
        new_it = dict(it)
        new_it["cat_discount_percent"] = pct
        new_it["cat_discount_lek"] = d
        new_it["line_lek_after_cat_discount"] = round(line - d, 2)
        out.append(new_it)
    return out, round(total_disc, 2)
