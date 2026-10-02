"""Store-level settings persisted in the `settings` collection.

Currently holds the shipping configuration (free-delivery thresholds, base
fees per zone, and the weight allowance / per-kg surcharge) so the store owner
can tune pricing from the Admin Panel without a code change.
"""
from __future__ import annotations

from db import db

SHIPPING_SETTINGS_ID = "shipping"

# Business defaults (June 2026). Tirana gets a lower free-delivery threshold.
SHIPPING_DEFAULTS = {
    "free_min_tirana_lek": 1000.0,
    "free_min_outside_lek": 2000.0,
    "base_tirana_lek": 200.0,
    "base_outside_lek": 300.0,
    "free_weight_kg": 2.0,       # weight allowance before per-kg surcharge
    "extra_per_kg_lek": 50.0,    # surcharge per extra kg above the allowance
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
