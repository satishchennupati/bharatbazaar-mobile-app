"""Admin-configurable store settings (currently: shipping pricing)."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from models import ShippingSettingsIn
from security import require_admin
from services.settings import get_shipping_settings, update_shipping_settings

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
