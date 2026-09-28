"""Profile + addresses + favourites (/me, /me/addresses, /me/favourites)."""
from __future__ import annotations

import secrets
from typing import List

from fastapi import APIRouter, Depends, HTTPException

from config import STATIC_DIR
from db import db
from models import AddressIn, MeUpdate, Product, UpdateProfileIn
from security import get_current_user
from services.images import save_data_url_as_image

router = APIRouter()


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@router.patch("/me")
async def update_me(payload: MeUpdate, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if update:
        await db.users.update_one({"id": user["id"]}, {"$set": update})
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return fresh


@router.post("/me/profile")
async def complete_profile(payload: UpdateProfileIn, user: dict = Depends(get_current_user)):
    """Rich profile update endpoint used by 'Complete your profile' and profile edit screens.

    Accepts an optional avatar as a base64 data URL and stores it under /static/avatars/.
    """
    update: dict = {}
    for f in ("full_name", "email", "language", "currency", "avatar_url"):
        v = getattr(payload, f)
        if v is not None:
            update[f] = v
    if payload.avatar_data_url:
        # Ensure avatars dir exists
        avatar_dir = STATIC_DIR / "avatars"
        avatar_dir.mkdir(parents=True, exist_ok=True)
        img_url = save_data_url_as_image(payload.avatar_data_url, user["id"], subdir="avatars")
        if img_url:
            update["avatar_url"] = img_url
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    await db.users.update_one({"id": user["id"]}, {"$set": update})
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return fresh


@router.post("/me/addresses")
async def add_address(addr: AddressIn, user: dict = Depends(get_current_user)):
    addr_doc = addr.model_dump()
    addr_doc["id"] = secrets.token_hex(6)
    await db.users.update_one({"id": user["id"]}, {"$push": {"addresses": addr_doc}})
    return addr_doc


@router.patch("/me/addresses/{addr_id}")
async def update_address(addr_id: str, addr: AddressIn, user: dict = Depends(get_current_user)):
    """Overwrite a saved address in place, preserving its id."""
    addr_doc = addr.model_dump()
    addr_doc["id"] = addr_id
    r = await db.users.update_one(
        {"id": user["id"], "addresses.id": addr_id},
        {"$set": {"addresses.$": addr_doc}},
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Address not found")
    return addr_doc


@router.post("/me/addresses/{addr_id}/touch")
async def touch_address(addr_id: str, user: dict = Depends(get_current_user)):
    """Move a saved address to the end of the array (most-recently-used).

    Called by the checkout flow after an order is placed with an existing
    saved address so that "most recent" on the next visit is really the one
    the customer just used, not merely the last one they created.
    """
    u = await db.users.find_one({"id": user["id"]}, {"addresses": 1})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    addrs = list(u.get("addresses") or [])
    target = next((a for a in addrs if a.get("id") == addr_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Address not found")
    others = [a for a in addrs if a.get("id") != addr_id]
    others.append(target)
    await db.users.update_one({"id": user["id"]}, {"$set": {"addresses": others}})
    return {"ok": True, "addresses": others}


@router.delete("/me/addresses/{addr_id}")
async def remove_address(addr_id: str, user: dict = Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$pull": {"addresses": {"id": addr_id}}})
    return {"ok": True}


# ---------- Favourites ----------
@router.get("/me/favourites", response_model=List[Product])
async def list_favourites(user: dict = Depends(get_current_user)):
    """Return the user's saved products, most-recently-added first."""
    fav_ids = list(user.get("favourites") or [])
    if not fav_ids:
        return []
    docs = await db.products.find({"id": {"$in": fav_ids}}, {"_id": 0}).to_list(500)
    by_id = {d["id"]: d for d in docs}
    return [by_id[i] for i in fav_ids if i in by_id]


@router.post("/me/favourites/{product_id}")
async def add_favourite(product_id: str, user: dict = Depends(get_current_user)):
    exists = await db.products.find_one({"id": product_id}, {"_id": 1})
    if not exists:
        raise HTTPException(status_code=404, detail="Product not found")
    # Keep most-recent-first and avoid duplicates.
    await db.users.update_one({"id": user["id"]}, {"$pull": {"favourites": product_id}})
    await db.users.update_one(
        {"id": user["id"]},
        {"$push": {"favourites": {"$each": [product_id], "$position": 0}}},
    )
    u = await db.users.find_one({"id": user["id"]}, {"favourites": 1})
    return {"favourites": list(u.get("favourites") or [])}


@router.delete("/me/favourites/{product_id}")
async def remove_favourite(product_id: str, user: dict = Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$pull": {"favourites": product_id}})
    u = await db.users.find_one({"id": user["id"]}, {"favourites": 1})
    return {"favourites": list(u.get("favourites") or [])}
