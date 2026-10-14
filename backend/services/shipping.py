"""Zone- and weight-based delivery fee calculator for Albania.

Business rules are now configurable from the Admin Panel (stored in the
`settings` collection, see `services.settings`). Defaults:
- Cart subtotal ≥ free threshold → shipping is free. The threshold differs by
  zone: Tirana City (1000 L) vs Rest of Albania (2000 L).
- Tirana City (address.city contains "tiran"): base 200 L for the first 2 kg.
- Rest of Albania: base 300 L for the first 2 kg.
- Above the free weight allowance → +50 L / kg added to the base.
- Products missing `weight_grams` are treated as 0 g.

`calculate_delivery_fee` stays pure (no I/O); `quote_for_cart` fetches the
live settings and is therefore async.
"""
from __future__ import annotations

import math
from typing import Iterable, Optional

from services.settings import get_shipping_settings

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
    settings: dict,
) -> dict:
    """Return a breakdown of the delivery fee using the given shipping settings.

    Rule: if the subtotal reaches the zone's free threshold → free. Otherwise
    delivery is charged at a flat rate per kg (same rate in both zones),
    proportional to the cart weight.

    Shape:
        {
          "fee_lek": float,
          "zone": "tirana"|"outside",
          "rate_per_kg_lek": float,
          "weight_grams": int,
          "weight_kg": float,
          "billable_kg": int,  # weight_kg rounded up to the next whole kg
          "free_shipping": bool,
          "free_threshold_lek": float,
        }
    """
    is_tirana = zone == ZONE_TIRANA
    free_threshold = float(
        settings["free_min_tirana_lek"] if is_tirana else settings["free_min_outside_lek"]
    )
    rate = float(
        settings.get("rate_per_kg_tirana_lek", 100.0)
        if is_tirana
        else settings.get("rate_per_kg_outside_lek", 300.0)
    )

    free = float(subtotal_lek or 0) >= free_threshold
    weight_kg = max(0.0, int(weight_grams or 0) / 1000.0)
    # Billable weight rounds up to the next whole kg (e.g. 0.45 kg → 1 kg,
    # 1.2 kg → 2 kg). A cart with any weight is charged for at least 1 kg.
    billable_kg = math.ceil(weight_kg) if weight_kg > 0 else 0
    fee = 0.0 if free else round(billable_kg * rate, 2)

    return {
        "fee_lek": fee,
        "zone": zone,
        "rate_per_kg_lek": rate,
        "weight_grams": int(weight_grams or 0),
        "weight_kg": round(weight_kg, 3),
        "billable_kg": billable_kg,
        "free_shipping": free,
        "free_threshold_lek": free_threshold,
    }


async def quote_for_cart(items: Iterable[dict], subtotal_lek: float, address: Optional[dict]) -> dict:
    """Convenience wrapper: derive zone + weight from cart/address, load the
    live shipping settings, then quote."""
    zone = detect_zone(address)
    grams = cart_weight_grams(items)
    settings = await get_shipping_settings()
    return calculate_delivery_fee(
        subtotal_lek=float(subtotal_lek or 0),
        weight_grams=grams,
        zone=zone,
        settings=settings,
    )
