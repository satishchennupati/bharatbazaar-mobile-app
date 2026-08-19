"""Cart persistence + enrichment helpers."""
from __future__ import annotations

from datetime import datetime, timezone

from db import db


async def get_or_create_cart(user_id: str) -> dict:
    cart = await db.carts.find_one({"user_id": user_id}, {"_id": 0})
    if not cart:
        cart = {"user_id": user_id, "items": [], "updated_at": datetime.now(timezone.utc).isoformat()}
        await db.carts.insert_one(dict(cart))
    return cart


async def enrich_cart(cart: dict) -> dict:
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
        items_out.append({
            "product_id": p["id"],
            "name": p["name"],
            "image_emoji": p["image_emoji"],
            "image_url": p.get("image_url"),
            "unit": p["unit"],
            "weight": p.get("weight"),
            "weight_grams": p.get("weight_grams") or 0,
            "price_lek": p["price_lek"],
            "price_eur": p["price_eur"],
            "category_slug": p.get("category_slug"),
            "qty": it["qty"],
            "line_lek": line_lek,
            "line_eur": line_eur,
        })
    return {
        "items": items_out,
        "subtotal_lek": round(subtotal_lek, 2),
        "subtotal_eur": round(subtotal_eur, 2),
        "count": count,
    }
