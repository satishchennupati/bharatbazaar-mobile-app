"""Store-level settings persisted in the `settings` collection.

Currently holds the shipping configuration (free-delivery thresholds, base
fees per zone, and the weight allowance / per-kg surcharge) so the store owner
can tune pricing from the Admin Panel without a code change.
"""
from __future__ import annotations

from db import db
from config import STORE_OWNER_PHONE

SHIPPING_SETTINGS_ID = "shipping"
STORE_SETTINGS_ID = "store"

# Store/notification defaults.
STORE_DEFAULTS = {
    "owner_phone": STORE_OWNER_PHONE or "+355695808480",
}

# Shipping defaults. When an order's subtotal is below the (zone-specific) free
# threshold, delivery is charged at a flat rate per kg that now differs by zone:
# Tirana city 100 L/kg, rest of Albania 300 L/kg. Billable weight rounds up to
# the next whole kg.
SHIPPING_DEFAULTS = {
    "free_min_tirana_lek": 1000.0,
    "free_min_outside_lek": 2000.0,
    "rate_per_kg_tirana_lek": 100.0,
    "rate_per_kg_outside_lek": 300.0,
}

_FLOAT_FIELDS = tuple(SHIPPING_DEFAULTS.keys())


async def get_shipping_settings() -> dict:
    """Return the shipping settings, falling back to defaults for any gap."""
    doc = await db.settings.find_one({"id": SHIPPING_SETTINGS_ID}, {"_id": 0}) or {}
    out = {}
    for f in _FLOAT_FIELDS:
        try:
            out[f] = float(doc.get(f, SHIPPING_DEFAULTS[f]))
        except (TypeError, ValueError):
            out[f] = SHIPPING_DEFAULTS[f]
    return out


async def update_shipping_settings(updates: dict) -> dict:
    """Merge the given (already-validated) updates and persist. Returns fresh settings."""
    current = await get_shipping_settings()
    for f in _FLOAT_FIELDS:
        v = updates.get(f)
        if v is not None:
            current[f] = float(v)
    current["id"] = SHIPPING_SETTINGS_ID
    await db.settings.update_one(
        {"id": SHIPPING_SETTINGS_ID}, {"$set": current}, upsert=True
    )
    current.pop("id", None)
    return current


async def get_store_settings() -> dict:
    """Return store/notification settings, falling back to defaults."""
    doc = await db.settings.find_one({"id": STORE_SETTINGS_ID}, {"_id": 0}) or {}
    return {
        "owner_phone": (doc.get("owner_phone") or STORE_DEFAULTS["owner_phone"]).strip(),
    }


async def update_store_settings(updates: dict) -> dict:
    """Merge and persist store settings. Returns fresh settings."""
    current = await get_store_settings()
    if updates.get("owner_phone") is not None:
        current["owner_phone"] = str(updates["owner_phone"]).strip()
    current["id"] = STORE_SETTINGS_ID
    await db.settings.update_one(
        {"id": STORE_SETTINGS_ID}, {"$set": current}, upsert=True
    )
    current.pop("id", None)
    return current
