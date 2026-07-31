"""Cart CRUD."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from db import db
from models import CartItemIn, CartItemUpdate
from security import get_current_user
from services.cart import enrich_cart, get_or_create_cart

router = APIRouter(prefix="/cart")


@router.get("")
async def get_cart(user: dict = Depends(get_current_user)):
    cart = await get_or_create_cart(user["id"])
    return await enrich_cart(cart)


@router.post("")
async def add_to_cart(payload: CartItemIn, user: dict = Depends(get_current_user)):
    prod = await db.products.find_one({"id": payload.product_id}, {"_id": 0, "id": 1})
    if not prod:
        raise HTTPException(status_code=404, detail="Product not found")
    cart = await get_or_create_cart(user["id"])
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
    return await enrich_cart({"items": items})


@router.patch("/{product_id}")
async def update_cart_item(product_id: str, payload: CartItemUpdate, user: dict = Depends(get_current_user)):
    cart = await get_or_create_cart(user["id"])
    items = cart.get("items", [])
    for it in items:
        if it["product_id"] == product_id:
            it["qty"] = payload.qty
            break
    items = [it for it in items if it["qty"] > 0]
    await db.carts.update_one({"user_id": user["id"]}, {"$set": {"items": items}})
    return await enrich_cart({"items": items})


@router.delete("/{product_id}")
async def remove_cart_item(product_id: str, user: dict = Depends(get_current_user)):
    cart = await get_or_create_cart(user["id"])
    items = [it for it in cart.get("items", []) if it["product_id"] != product_id]
    await db.carts.update_one({"user_id": user["id"]}, {"$set": {"items": items}})
    return await enrich_cart({"items": items})


@router.delete("")
async def clear_cart(user: dict = Depends(get_current_user)):
    await db.carts.update_one({"user_id": user["id"]}, {"$set": {"items": []}})
    return {"items": [], "subtotal_lek": 0.0, "subtotal_eur": 0.0, "count": 0}
