"""Profile + addresses (/me, /me/addresses)."""
from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends

from db import db
from models import AddressIn, MeUpdate
from security import get_current_user

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


@router.post("/me/addresses")
async def add_address(addr: AddressIn, user: dict = Depends(get_current_user)):
    addr_doc = addr.model_dump()
    addr_doc["id"] = secrets.token_hex(6)
    await db.users.update_one({"id": user["id"]}, {"$push": {"addresses": addr_doc}})
    return addr_doc


@router.delete("/me/addresses/{addr_id}")
async def remove_address(addr_id: str, user: dict = Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$pull": {"addresses": {"id": addr_id}}})
    return {"ok": True}
