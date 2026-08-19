"""Zone- and weight-based delivery fee calculator for Albania.

Business rules (finalised June 2026):
- Cart subtotal > 2000 L → shipping is free.
- Tirana City (address.city contains "tiran"): base 200 L for the first 2 kg.
- Rest of Albania: base 300 L for the first 2 kg.
- Above 2 kg → +50 L / kg (i.e. 0.05 L per gram) added to the base.
- Products missing `weight_grams` are treated as 0 g.

The delivery fee resolver is intentionally pure (no I/O) so it can be reused
by both the checkout preview endpoint and the actual `place_order` handler.
"""
from __future__ import annotations

from typing import Iterable, Optional

from config import (
    FREE_DELIVERY_MIN_LEK,
    SHIPPING_BASE_OUTSIDE_LEK,
    SHIPPING_BASE_TIRANA_LEK,
    SHIPPING_EXTRA_LEK_PER_GRAM,
    SHIPPING_WEIGHT_INCLUDED_G,
)

ZONE_TIRANA = "tirana"
ZONE_OUTSIDE = "outside"


def detect_zone(address: Optional[dict]) -> str:
    """Return "tirana" if the address city looks like Tirana, else "outside"."""
    if not address:
        return ZONE_OUTSIDE
    city = (address.get("city") or address.get("locality") or "").strip().lower()
    # Match "Tirana", "Tiranë", "Tiran", "Tirana District" etc.
    if not city:
        return ZONE_OUTSIDE
    return ZONE_TIRANA if ("tiran" in city) else ZONE_OUTSIDE


def cart_weight_grams(items: Iterable[dict]) -> int:
    """Sum weight_grams * qty across cart items. Missing weight → 0 g."""
    total = 0
    for it in items or []:
        try:
            qty = int(it.get("qty") or 1)
        except Exception:
            qty = 1
        w = it.get("weight_grams") or 0
        try:
            w_int = int(round(float(w)))
        except Exception:
            w_int = 0
        if w_int < 0:
            w_int = 0
        total += w_int * qty
    return total


def calculate_delivery_fee(
    *,
    subtotal_lek: float,
    weight_grams: int,
    zone: str,
) -> dict:
    """Return a breakdown of the delivery fee.

    Shape:
        {
          "fee_lek": float,
          "zone": "tirana"|"outside",
          "base_lek": float,
          "extra_lek": float,
          "included_grams": int,
          "billable_extra_grams": int,
          "free_shipping": bool,
          "free_threshold_lek": float,
        }
    """
    free = float(subtotal_lek or 0) >= FREE_DELIVERY_MIN_LEK

    base = SHIPPING_BASE_TIRANA_LEK if zone == ZONE_TIRANA else SHIPPING_BASE_OUTSIDE_LEK

    extra_grams = max(0, int(weight_grams or 0) - SHIPPING_WEIGHT_INCLUDED_G)
    extra_fee = round(extra_grams * SHIPPING_EXTRA_LEK_PER_GRAM, 2)

    fee = 0.0 if free else round(base + extra_fee, 2)

    return {
        "fee_lek": fee,
        "zone": zone,
        "base_lek": 0.0 if free else base,
        "extra_lek": 0.0 if free else extra_fee,
        "included_grams": SHIPPING_WEIGHT_INCLUDED_G,
        "billable_extra_grams": extra_grams,
        "weight_grams": int(weight_grams or 0),
        "free_shipping": free,
        "free_threshold_lek": FREE_DELIVERY_MIN_LEK,
    }


def quote_for_cart(items: Iterable[dict], subtotal_lek: float, address: Optional[dict]) -> dict:
    """Convenience wrapper: derive zone + weight from cart/address, then quote."""
    zone = detect_zone(address)
    grams = cart_weight_grams(items)
    return calculate_delivery_fee(
        subtotal_lek=float(subtotal_lek or 0),
        weight_grams=grams,
        zone=zone,
    )
