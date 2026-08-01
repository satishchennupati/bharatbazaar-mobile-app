"""Profile + addresses (/me, /me/addresses)."""
from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, HTTPException

from config import STATIC_DIR
from db import db
from models import AddressIn, MeUpdate, UpdateProfileIn
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


@router.delete("/me/addresses/{addr_id}")
async def remove_address(addr_id: str, user: dict = Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$pull": {"addresses": {"id": addr_id}}})
    return {"ok": True}
