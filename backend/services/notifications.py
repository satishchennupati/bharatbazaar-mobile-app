"""Twilio SMS helpers — small and reusable.

Owns the singleton Twilio client so route modules don't each build one, and
exposes higher-level helpers used by order placement etc.
"""
from __future__ import annotations

import logging
from typing import Optional

from twilio.base.exceptions import TwilioRestException
from twilio.rest import Client as TwilioClient

from config import (
    STORE_NAME,
    STORE_OWNER_PHONE,
    TWILIO_FROM,
    TWILIO_MSID,
    TWILIO_SID,
    TWILIO_TOKEN,
)

logger = logging.getLogger("bharat_bazaar")

_client: Optional[TwilioClient] = None
if TWILIO_SID and TWILIO_TOKEN:
    try:
        _client = TwilioClient(TWILIO_SID, TWILIO_TOKEN)
    except Exception as exc:  # pragma: no cover
        logger.warning("Twilio init failed: %s", exc)
        _client = None


def send_sms(to_phone: str, body: str) -> dict:
    """Best-effort SMS send. Never raises — returns a dict describing the outcome.

    Callers can inspect `sent`/`channel` but should NOT abort their flow if
    the SMS failed; notification is a courtesy, not a hard business rule.
    """
    if not to_phone or not to_phone.startswith("+"):
        return {"sent": False, "channel": "invalid", "reason": "phone must be E.164"}
    if not _client:
        logger.warning("Twilio not configured; SMS to %s dropped. Body: %s", to_phone, body)
        return {"sent": False, "channel": "mock"}
    kwargs: dict = {"body": body, "to": to_phone}
    if TWILIO_MSID:
        kwargs["messaging_service_sid"] = TWILIO_MSID
    elif TWILIO_FROM:
        kwargs["from_"] = TWILIO_FROM
    else:
        logger.warning("Twilio sender not configured; SMS to %s dropped", to_phone)
        return {"sent": False, "channel": "misconfigured"}
    try:
        msg = _client.messages.create(**kwargs)
        return {"sent": True, "channel": "sms", "sid": msg.sid}
    except TwilioRestException as exc:
        logger.warning("Twilio send error to %s: %s", to_phone, exc)
        return {"sent": False, "channel": "twilio_error", "error": getattr(exc, "msg", str(exc))}
    except Exception as exc:  # pragma: no cover
        logger.exception("Unexpected Twilio error to %s: %s", to_phone, exc)
        return {"sent": False, "channel": "error", "error": str(exc)}


# ---------- Order-notification templates ----------
def _fmt_lek(v: float) -> str:
    try:
        return f"{int(round(float(v)))} L"
    except Exception:
        return "-"


def _summarise_items(items: list[dict], max_items: int = 3) -> str:
    """Compact one-liner listing the top items in an order for the owner SMS."""
    parts: list[str] = []
    for it in items[:max_items]:
        qty = int(it.get("qty") or 1)
        name = (it.get("name") or "item").strip()
        # Trim very long names to keep SMS body small.
        if len(name) > 24:
            name = name[:23] + "…"
        parts.append(f"{qty}×{name}")
    extra = len(items) - max_items
    if extra > 0:
        parts.append(f"+{extra} more")
    return ", ".join(parts) if parts else "-"


def build_customer_order_sms(order: dict, customer_name: str = "") -> str:
    name_prefix = f"Hi {customer_name.strip()}, " if customer_name and customer_name.strip() else ""
    return (
        f"{STORE_NAME}: {name_prefix}your order #{order['id']} is confirmed. "
        f"Total: {_fmt_lek(order.get('total_lek', 0))} (Cash on Delivery). "
        f"ETA ~{int(order.get('eta_minutes') or 45)} min. Track in the app."
    )


def build_owner_order_sms(order: dict, customer_name: str, customer_phone: str) -> str:
    addr = order.get("address") or {}
    address_line = ", ".join(
        [str(x).strip() for x in [addr.get("line1"), addr.get("area"), addr.get("city"), addr.get("state")] if x]
    )[:80] or (addr.get("formatted_address") or "-")
    items_line = _summarise_items(order.get("items") or [])
    return (
        f"{STORE_NAME}: NEW ORDER #{order['id']} "
        f"| {customer_name or 'Customer'} ({customer_phone}) "
        f"| {items_line} "
        f"| {_fmt_lek(order.get('total_lek', 0))} COD "
        f"| {address_line}"
    )


def notify_order_placed(order: dict, customer_phone: str, customer_name: str = "") -> dict:
    """Fire the two order-confirmation SMS: one to the customer, one to the store owner.

    Runs synchronously (Twilio call is quick) and always returns diagnostics —
    callers should NOT let its result affect the HTTP response for /orders.
    """
    results: dict = {}
    if customer_phone:
        body = build_customer_order_sms(order, customer_name=customer_name)
        results["customer"] = send_sms(customer_phone, body)
    else:
        results["customer"] = {"sent": False, "channel": "no_phone"}
    if STORE_OWNER_PHONE:
        body_owner = build_owner_order_sms(order, customer_name=customer_name, customer_phone=customer_phone or "n/a")
        results["owner"] = send_sms(STORE_OWNER_PHONE, body_owner)
    else:
        results["owner"] = {"sent": False, "channel": "no_owner_phone"}
    return results
