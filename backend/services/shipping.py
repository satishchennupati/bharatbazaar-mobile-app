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

    Shape:
        {
          "fee_lek": float,
          "zone": "tirana"|"outside",
          "base_lek": float,
          "extra_lek": float,
          "included_grams": int,
          "billable_extra_grams": int,
          "weight_grams": int,
          "free_shipping": bool,
          "free_threshold_lek": float,
        }
    """
    is_tirana = zone == ZONE_TIRANA
    free_threshold = float(
        settings["free_min_tirana_lek"] if is_tirana else settings["free_min_outside_lek"]
    )
    base = float(settings["base_tirana_lek"] if is_tirana else settings["base_outside_lek"])
    included_grams = int(round(float(settings["free_weight_kg"]) * 1000))
    extra_per_gram = float(settings["extra_per_kg_lek"]) / 1000.0

    free = float(subtotal_lek or 0) >= free_threshold

    extra_grams = max(0, int(weight_grams or 0) - included_grams)
    extra_fee = round(extra_grams * extra_per_gram, 2)

    fee = 0.0 if free else round(base + extra_fee, 2)

    return {
        "fee_lek": fee,
        "zone": zone,
        "base_lek": 0.0 if free else base,
        "extra_lek": 0.0 if free else extra_fee,
        "included_grams": included_grams,
        "billable_extra_grams": extra_grams,
        "weight_grams": int(weight_grams or 0),
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
