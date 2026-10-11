"""Admin-configurable store settings (currently: shipping pricing)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from models import ShippingSettingsIn, StoreSettingsIn
from security import require_admin
from services.settings import (
    get_shipping_settings,
    get_store_settings,
    update_shipping_settings,
    update_store_settings,
)

router = APIRouter(prefix="/admin/settings")


@router.get("/shipping")
async def admin_get_shipping_settings(_: dict = Depends(require_admin)):
    return await get_shipping_settings()


@router.put("/shipping")
async def admin_update_shipping_settings(
    payload: ShippingSettingsIn, _: dict = Depends(require_admin)
):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    return await update_shipping_settings(updates)


@router.get("/store")
async def admin_get_store_settings(_: dict = Depends(require_admin)):
    return await get_store_settings()


@router.put("/store")
async def admin_update_store_settings(
    payload: StoreSettingsIn, _: dict = Depends(require_admin)
):
    phone = (payload.owner_phone or "").strip()
    if phone and not phone.startswith("+"):
        raise HTTPException(status_code=400, detail="Owner phone must be in E.164 format (e.g. +355695808480)")
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    return await update_store_settings(updates)
