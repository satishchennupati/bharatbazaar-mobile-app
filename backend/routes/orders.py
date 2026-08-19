"""Customer orders: place COD order, list, detail."""
from __future__ import annotations

import logging
import random
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import LEK_PER_EUR
from db import db
from models import PlaceOrderIn
from security import get_current_user
from services.cart import enrich_cart, get_or_create_cart
from services.notifications import notify_order_placed
from services.offers import apply_category_discounts_to_items, validate_coupon
from services.shipping import quote_for_cart

logger = logging.getLogger("bharat_bazaar")
router = APIRouter(prefix="/orders")


class ShippingQuoteIn(BaseModel):
    """Live shipping-fee preview payload from the checkout screen."""
    address: dict | None = None


@router.post("/shipping-quote")
async def shipping_quote(payload: ShippingQuoteIn, user: dict = Depends(get_current_user)):
    """Return the delivery-fee breakdown for the user's current cart & given address.

    Called from the checkout screen whenever the address selection changes so
    the customer sees a live shipping fee (or "FREE" if their bill qualifies).
    """
    cart = await get_or_create_cart(user["id"])
    enriched = await enrich_cart(cart)
    items = enriched.get("items") or []
    subtotal = float(enriched.get("subtotal_lek") or 0.0)
    quote = quote_for_cart(items, subtotal, payload.address or {})
    return {
        "subtotal_lek": subtotal,
        **quote,
    }


@router.post("")
async def place_order(payload: PlaceOrderIn, user: dict = Depends(get_current_user)):
    cart = await get_or_create_cart(user["id"])
    enriched = await enrich_cart(cart)
    if not enriched["items"]:
        raise HTTPException(status_code=400, detail="Cart is empty")

    # Category-level discounts (applied automatically)
    items_with_cat, cat_disc_lek = await apply_category_discounts_to_items(enriched["items"])

    subtotal_lek = float(enriched["subtotal_lek"])
    subtotal_eur = float(enriched["subtotal_eur"])
    subtotal_after_cat = round(subtotal_lek - cat_disc_lek, 2)

    # Coupon (optional, applied on top of category discounts)
    coupon_discount_lek = 0.0
    coupon_meta: dict | None = None
    coupon_code: str = ""
    if payload.coupon_code:
        v = await validate_coupon(payload.coupon_code, subtotal_after_cat, user_id=user["id"])
        if not v.get("valid"):
            raise HTTPException(status_code=400, detail=v.get("message") or "Invalid coupon")
        coupon_discount_lek = float(v.get("discount_lek") or 0.0)
        coupon_meta = v.get("coupon")
        coupon_code = payload.coupon_code.strip()

    total_discount_lek = round(cat_disc_lek + coupon_discount_lek, 2)
    payable_pre_shipping = max(0.0, subtotal_after_cat - coupon_discount_lek)

    # Zone- and weight-based shipping. Use the *pre-shipping* payable amount as
    # the "bill" for free-shipping check (matches what the user sees).
    ship_quote = quote_for_cart(items_with_cat, payable_pre_shipping, payload.address.model_dump())
    delivery_fee_lek = float(ship_quote["fee_lek"])
    delivery_fee_eur = round(delivery_fee_lek / LEK_PER_EUR, 2)
    total_lek = round(payable_pre_shipping + delivery_fee_lek, 2)
    total_eur = round(subtotal_eur - (total_discount_lek / LEK_PER_EUR) + delivery_fee_eur, 2)

    order_id = "MBC" + secrets.token_hex(4).upper()
    order = {
        "id": order_id,
        "user_id": user["id"],
        "items": items_with_cat,
        "address": payload.address.model_dump(),
        "note": payload.note,
        "payment_method": "COD",
        "currency": payload.currency,
        "status": "placed",
        "subtotal_lek": subtotal_lek,
        "subtotal_eur": subtotal_eur,
        "category_discount_lek": cat_disc_lek,
        "coupon_code": coupon_code,
        "coupon": coupon_meta,
        "coupon_discount_lek": coupon_discount_lek,
        "total_discount_lek": total_discount_lek,
        "delivery_fee_lek": delivery_fee_lek,
        "delivery_fee_eur": delivery_fee_eur,
        "shipping_zone": ship_quote.get("zone"),
        "shipping_weight_grams": ship_quote.get("weight_grams"),
        "shipping_breakdown": ship_quote,
        "total_lek": total_lek,
        "total_eur": max(0.0, total_eur),
        "placed_at": datetime.now(timezone.utc).isoformat(),
        "eta_minutes": random.randint(35, 75),
    }
    await db.orders.insert_one(dict(order))
    await db.carts.update_one({"user_id": user["id"]}, {"$set": {"items": []}})

    # Increment coupon usage counter
    if coupon_meta and coupon_meta.get("id"):
        await db.offers.update_one(
            {"id": coupon_meta["id"]},
            {"$inc": {"usage_count": 1}},
        )

    # Fire order-confirmation SMS: one to the customer, one to the store owner.
    # Prefer the customer's registered phone; fall back to the address phone if
    # the account is missing one for any reason. Never fail the order on SMS
    # errors — Twilio outages are common and this is a courtesy notification.
    customer_phone = user.get("phone") or (payload.address.phone or "")
    customer_name = (user.get("full_name") or user.get("username") or "").strip()
    try:
        sms_results = notify_order_placed(order, customer_phone=customer_phone, customer_name=customer_name)
        await db.orders.update_one(
            {"id": order_id},
            {"$set": {
                "notification_sent_at": datetime.now(timezone.utc).isoformat(),
                "notification_customer": sms_results.get("customer"),
                "notification_owner": sms_results.get("owner"),
            }},
        )
    except Exception as exc:  # defensive
        logger.warning("Order %s SMS notification error: %s", order_id, exc)

    order.pop("_id", None)
    return order


@router.get("")
async def list_orders(user: dict = Depends(get_current_user)):
    orders = await db.orders.find({"user_id": user["id"]}, {"_id": 0}).sort("placed_at", -1).to_list(200)
    return orders


@router.get("/{order_id}")
async def get_order(order_id: str, user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id, "user_id": user["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order
