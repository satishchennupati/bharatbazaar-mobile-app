"""Admin offers CRUD (Phase 4).

A unified `offers` collection with a `type` discriminator:
- banner
- coupon
- category_discount
"""
from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from db import db
from models import OfferIn, OfferPatch
from security import require_admin
from services.images import save_data_url_as_image

router = APIRouter(prefix="/admin/offers")


def _normalize_offer_type(o: dict) -> dict:
    """Clear irrelevant fields for the offer's type so the doc is tidy."""
    t = o.get("type")
    if t == "banner":
        for f in ("coupon_code", "discount_type", "discount_value", "min_order_lek",
                  "max_discount_lek", "usage_limit", "per_user_limit",
                  "category_slug", "cat_discount_percent"):
            o.pop(f, None)
    elif t == "coupon":
        for f in ("banner_image_url", "banner_bg_color", "banner_text_color",
                  "cta_label", "cta_target", "banner_image_data_url",
                  "category_slug", "cat_discount_percent"):
            o.pop(f, None)
    elif t == "category_discount":
        for f in ("banner_image_url", "banner_bg_color", "banner_text_color",
                  "cta_label", "cta_target", "banner_image_data_url",
                  "coupon_code", "discount_type", "discount_value",
                  "min_order_lek", "max_discount_lek",
                  "usage_limit", "per_user_limit"):
            o.pop(f, None)
    return o


def _validate_offer_payload(payload: dict, *, is_create: bool):
    t = payload.get("type")
    if is_create and not t:
        raise HTTPException(status_code=400, detail="type is required")
    if t == "coupon":
        if not payload.get("coupon_code"):
            raise HTTPException(status_code=400, detail="coupon_code is required for coupon type")
        if not payload.get("discount_type"):
            raise HTTPException(status_code=400, detail="discount_type is required for coupon type")
        if payload.get("discount_value") is None or float(payload.get("discount_value") or 0) <= 0:
            raise HTTPException(status_code=400, detail="discount_value must be > 0")
    elif t == "category_discount":
        if not payload.get("category_slug"):
            raise HTTPException(status_code=400, detail="category_slug is required for category_discount")
        pct = float(payload.get("cat_discount_percent") or 0)
        if pct <= 0 or pct > 100:
            raise HTTPException(status_code=400, detail="cat_discount_percent must be between 0 and 100")


@router.get("")
async def admin_list_offers(
    type: Optional[str] = Query(None, description="Filter by offer type"),
    active: Optional[bool] = Query(None),
    limit: int = Query(200, ge=1, le=500),
    _: dict = Depends(require_admin),
):
    query: dict = {}
    if type and type != "all":
        query["type"] = type
    if active is not None:
        query["active"] = active
    offers = await db.offers.find(query, {"_id": 0}).sort([("priority", -1), ("created_at", -1)]).limit(limit).to_list(limit)
    return {"offers": offers, "count": len(offers)}


@router.get("/{offer_id}")
async def admin_get_offer(offer_id: str, _: dict = Depends(require_admin)):
    off = await db.offers.find_one({"id": offer_id}, {"_id": 0})
    if not off:
        raise HTTPException(status_code=404, detail="Offer not found")
    return off


@router.post("")
async def admin_create_offer(payload: OfferIn, admin: dict = Depends(require_admin)):
    data = payload.model_dump()
    _validate_offer_payload(data, is_create=True)

    # Enforce unique coupon_code across active coupons
    if data.get("type") == "coupon":
        existing = await db.offers.find_one(
            {"type": "coupon", "coupon_code": {"$regex": f"^{data['coupon_code'].strip()}$", "$options": "i"}}
        )
        if existing:
            raise HTTPException(status_code=409, detail="A coupon with this code already exists")
        data["coupon_code"] = data["coupon_code"].strip().upper()
        data["usage_count"] = 0

    oid = f"off-{secrets.token_hex(6)}"
    now = datetime.now(timezone.utc).isoformat()
    data["id"] = oid
    data["created_at"] = now
    data["updated_at"] = now
    data["created_by"] = admin.get("id")

    # Handle inline image upload (data URL)
    if data.get("banner_image_data_url"):
        img_url = save_data_url_as_image(data["banner_image_data_url"], oid, subdir="offers")
        if img_url:
            data["banner_image_url"] = img_url
    data.pop("banner_image_data_url", None)

    data = _normalize_offer_type(data)
    await db.offers.insert_one(dict(data))
    data.pop("_id", None)
    return data


@router.patch("/{offer_id}")
async def admin_update_offer(offer_id: str, payload: OfferPatch, admin: dict = Depends(require_admin)):
    existing = await db.offers.find_one({"id": offer_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Offer not found")

    incoming = {k: v for k, v in payload.model_dump().items() if v is not None}
    merged = {**existing, **incoming}
    _validate_offer_payload(merged, is_create=False)

    if incoming.get("type") == "coupon" or (
        merged.get("type") == "coupon" and incoming.get("coupon_code")
    ):
        code = (incoming.get("coupon_code") or merged.get("coupon_code") or "").strip()
        if code:
            dup = await db.offers.find_one(
                {"type": "coupon",
                 "coupon_code": {"$regex": f"^{code}$", "$options": "i"},
                 "id": {"$ne": offer_id}}
            )
            if dup:
                raise HTTPException(status_code=409, detail="Another coupon with this code exists")
            incoming["coupon_code"] = code.upper()

    if incoming.get("banner_image_data_url"):
        img_url = save_data_url_as_image(incoming["banner_image_data_url"], offer_id, subdir="offers")
        if img_url:
            incoming["banner_image_url"] = img_url
    incoming.pop("banner_image_data_url", None)

    incoming["updated_at"] = datetime.now(timezone.utc).isoformat()
    incoming["updated_by"] = admin.get("id")

    await db.offers.update_one({"id": offer_id}, {"$set": incoming})
    doc = await db.offers.find_one({"id": offer_id}, {"_id": 0})
    return doc


@router.delete("/{offer_id}")
async def admin_delete_offer(offer_id: str, _: dict = Depends(require_admin)):
    r = await db.offers.delete_one({"id": offer_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Offer not found")
    return {"ok": True, "deleted": offer_id}


@router.post("/{offer_id}/toggle")
async def admin_toggle_offer(offer_id: str, _: dict = Depends(require_admin)):
    off = await db.offers.find_one({"id": offer_id}, {"_id": 0, "active": 1})
    if not off:
        raise HTTPException(status_code=404, detail="Offer not found")
    new_active = not bool(off.get("active"))
    await db.offers.update_one(
        {"id": offer_id},
        {"$set": {"active": new_active, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    doc = await db.offers.find_one({"id": offer_id}, {"_id": 0})
    return doc
