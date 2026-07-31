"""Admin: products CRUD + CSV import + Drive image sync + categories."""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile

from config import ADMIN_SECRET, LEK_PER_EUR
from db import db
from models import AdminProductIn, AdminProductPatch
from security import require_admin
from services.csv_import import import_products_from_csv_text, refresh_category_counts
from services.images import save_data_url_as_image, sync_one_product_image

router = APIRouter(prefix="/admin")
logger = logging.getLogger("bharat_bazaar")


@router.get("/products")
async def admin_list_products(
    category: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    in_stock: Optional[bool] = Query(None),
    limit: int = Query(500, ge=1, le=2000),
    _: dict = Depends(require_admin),
):
    query: dict = {}
    if category and category != "all":
        query["category_slug"] = category
    if in_stock is not None:
        query["in_stock"] = in_stock
    if q:
        rx = {"$regex": q.strip(), "$options": "i"}
        query["$or"] = [{"name": rx}, {"sku": rx}, {"product_code": rx}, {"ean_barcode": rx}]
    products = await db.products.find(query, {"_id": 0}).sort("name", 1).limit(limit).to_list(limit)
    return {"products": products, "count": len(products)}


@router.post("/products")
async def admin_create_product(payload: AdminProductIn, admin: dict = Depends(require_admin)):
    now = datetime.now(timezone.utc).isoformat()
    pid = f"p-{secrets.token_hex(6)}"
    price_eur = payload.price_eur if payload.price_eur is not None else round(payload.price_lek / LEK_PER_EUR, 2)
    doc = {
        "id": pid,
        "name": payload.name.strip(),
        "description": payload.description,
        "category_slug": payload.category_slug,
        "price": payload.price_lek,
        "price_lek": payload.price_lek,
        "price_eur": price_eur,
        "discount": payload.discount,
        "sku": payload.sku,
        "product_code": payload.product_code,
        "ean_barcode": payload.ean_barcode,
        "stock": payload.stock,
        "in_stock": payload.in_stock,
        "weight": payload.weight,
        "weight_grams": payload.weight_grams,
        "weight_grams_inferred": False,
        "brand": payload.brand,
        "tags": payload.tags,
        "variants": payload.variants,
        "image_emoji": payload.image_emoji,
        "image_url": payload.image_url,
        "unit": payload.unit,
        "created_at": now,
        "updated_at": now,
        "created_by": admin.get("id"),
    }
    if payload.image_data_url:
        img_url = save_data_url_as_image(payload.image_data_url, pid)
        if img_url:
            doc["image_url"] = img_url
    await db.products.insert_one(doc)
    doc.pop("_id", None)
    await refresh_category_counts()
    return doc


@router.patch("/products/{product_id}")
async def admin_update_product(product_id: str, payload: AdminProductPatch, admin: dict = Depends(require_admin)):
    existing = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")
    updates: dict = {}
    for field in (
        "name", "description", "category_slug", "price_lek", "price_eur", "discount",
        "sku", "product_code", "ean_barcode", "stock", "in_stock",
        "weight", "weight_grams", "brand", "tags", "variants",
        "image_emoji", "image_url", "unit",
    ):
        val = getattr(payload, field)
        if val is not None:
            updates[field] = val
    if "price_lek" in updates:
        updates["price"] = updates["price_lek"]
        if "price_eur" not in updates:
            updates["price_eur"] = round(updates["price_lek"] / LEK_PER_EUR, 2)
    if payload.image_data_url:
        img_url = save_data_url_as_image(payload.image_data_url, product_id)
        if img_url:
            updates["image_url"] = img_url
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates["updated_by"] = admin.get("id")
    await db.products.update_one({"id": product_id}, {"$set": updates})
    updated = await db.products.find_one({"id": product_id}, {"_id": 0})
    if "category_slug" in updates:
        await refresh_category_counts()
    return updated


@router.delete("/products/{product_id}")
async def admin_delete_product(product_id: str, _: dict = Depends(require_admin)):
    r = await db.products.delete_one({"id": product_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    await db.carts.update_many({}, {"$pull": {"items": {"product_id": product_id}}})
    await refresh_category_counts()
    return {"ok": True, "deleted": product_id}


@router.post("/products/import-csv")
async def admin_import_products_admin(
    file: UploadFile = File(...),
    replace: bool = Query(False),
    _: dict = Depends(require_admin),
):
    raw = await file.read()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")
    result = await import_products_from_csv_text(text, replace=replace)
    await refresh_category_counts()
    return {"ok": True, **result}


@router.get("/categories")
async def admin_list_categories(_: dict = Depends(require_admin)):
    cats = await db.categories.find({}, {"_id": 0}).sort("sort_order", 1).to_list(200)
    return {"categories": cats}


# -------------------- Legacy X-Admin-Secret gated endpoints --------------------
def _check_admin_secret(secret: Optional[str]):
    if not ADMIN_SECRET:
        raise HTTPException(status_code=500, detail="ADMIN_SECRET not configured on server")
    if not secret or secret != ADMIN_SECRET:
        raise HTTPException(status_code=401, detail="Invalid admin secret")


@router.post("/products/import")
async def admin_import_products(
    file: UploadFile = File(...),
    replace: bool = Query(False),
    x_admin_secret: Annotated[Optional[str], Header(alias="X-Admin-Secret")] = None,
):
    _check_admin_secret(x_admin_secret)
    raw = await file.read()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")
    result = await import_products_from_csv_text(text, replace=replace)
    return {"ok": True, **result}


@router.post("/products/sync-images")
async def admin_sync_product_images(
    limit: int = Query(500, ge=1, le=2000),
    x_admin_secret: Annotated[Optional[str], Header(alias="X-Admin-Secret")] = None,
):
    _check_admin_secret(x_admin_secret)
    cur = db.products.find(
        {"image_url": {"$regex": "google", "$options": "i"}},
        {"_id": 0, "id": 1, "product_code": 1, "image_url": 1, "name": 1},
    ).limit(limit)
    counts = {"synced": 0, "cached": 0, "download-failed": 0, "skipped-no-id": 0, "skipped-no-drive": 0}
    failed: list = []
    async for prod in cur:
        status = await sync_one_product_image(prod)
        counts[status] = counts.get(status, 0) + 1
        if status == "download-failed":
            failed.append({"id": prod["id"], "name": prod.get("name")})
    return {"ok": True, "counts": counts, "failed_sample": failed[:10]}
