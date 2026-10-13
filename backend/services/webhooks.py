"""Outbound event webhook dispatcher.

Whenever a business event happens (OTP sent, order placed, order status
updated, payment completed) we POST a consistent envelope to the configured
`WEBHOOK_URL`. Delivery is best-effort and fully non-blocking: it runs as a
background task and never raises into the request flow — a webhook outage must
never break checkout, login, or admin actions.

Envelope shape (common across all events; only `data` differs):

    {
      "schemaVersion": "1.0",
      "eventId": "evt_...",
      "eventType": "order.placed",
      "eventTimestamp": "2026-06-01T14:30:00Z",
      "source": {"application": "bharatbazaar", "platform": ...,
                 "appVersion": ..., "environment": ...},
      "store": {"storeId": ..., "storeName": ...},
      "actor": {"customerId": ..., "sessionId": ...},
      "correlationId": "corr_...",
      "data": { ... event-specific ... }
    }
"""
from __future__ import annotations

import asyncio
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx

from config import APP_VERSION, STORE_ID, STORE_NAME, WEBHOOK_ENV, WEBHOOK_URL

logger = logging.getLogger("bharat_bazaar")

# Keep strong references to in-flight tasks so the event loop doesn't GC them
# mid-flight (asyncio only holds weak refs to tasks).
_inflight: set[asyncio.Task] = set()

# Known dialing codes we may encounter, longest-first for correct matching.
_KNOWN_CC = ("+355", "+377", "+91", "+44", "+39", "+49", "+30", "+1")


def _now_iso_z() -> str:
    """UTC timestamp like 2026-06-01T14:30:00Z (no microseconds)."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:20]}"


def split_phone(phone: str) -> tuple[str, str]:
    """Return (countryCode, nationalNumber) for an E.164 phone, best-effort."""
    p = (phone or "").strip()
    for cc in _KNOWN_CC:
        if p.startswith(cc):
            return cc, p[len(cc):]
    # Fallback: assume a 10-digit national number.
    digits = re.sub(r"\D", "", p)
    if len(digits) > 10:
        return "+" + digits[:-10], digits[-10:]
    return "", digits


def mask_phone(phone: str) -> str:
    """Mask everything but the last 4 digits, e.g. +355691234 -> ******1234."""
    _, national = split_phone(phone)
    digits = re.sub(r"\D", "", national)
    if len(digits) <= 4:
        return "*" * len(digits)
    return "*" * (len(digits) - 4) + digits[-4:]


def _build_envelope(
    event_type: str,
    data: dict,
    *,
    actor: Optional[dict] = None,
    correlation_id: Optional[str] = None,
    platform: str = "server",
) -> dict:
    return {
        "schemaVersion": "1.0",
        "eventId": _new_id("evt"),
        "eventType": event_type,
        "eventTimestamp": _now_iso_z(),
        "source": {
            "application": "bharatbazaar",
            "platform": platform,
            "appVersion": APP_VERSION,
            "environment": WEBHOOK_ENV,
        },
        "store": {"storeId": STORE_ID, "storeName": STORE_NAME},
        "actor": {
            "customerId": (actor or {}).get("customerId"),
            "sessionId": (actor or {}).get("sessionId"),
        },
        "correlationId": correlation_id,
        "data": data,
    }


async def _post(payload: dict) -> None:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(WEBHOOK_URL, json=payload)
            logger.info(
                "Webhook %s -> %s (%s)",
                payload.get("eventType"), resp.status_code, payload.get("eventId"),
            )
    except Exception as exc:  # best-effort; never propagate
        logger.warning("Webhook %s delivery failed: %s", payload.get("eventType"), exc)


def emit_event(
    event_type: str,
    data: dict,
    *,
    actor: Optional[dict] = None,
    correlation_id: Optional[str] = None,
    platform: str = "server",
) -> None:
    """Fire-and-forget: build the envelope and POST it in the background.

    Safe to call from any async request handler. Does nothing if no
    `WEBHOOK_URL` is configured.
    """
    if not WEBHOOK_URL:
        return
    payload = _build_envelope(
        event_type, data, actor=actor, correlation_id=correlation_id, platform=platform
    )
    try:
        task = asyncio.create_task(_post(payload))
        _inflight.add(task)
        task.add_done_callback(_inflight.discard)
    except RuntimeError:
        # No running event loop (e.g. called from a sync script) — post inline.
        try:
            httpx.post(WEBHOOK_URL, json=payload, timeout=10.0)
        except Exception as exc:
            logger.warning("Webhook %s inline delivery failed: %s", event_type, exc)
