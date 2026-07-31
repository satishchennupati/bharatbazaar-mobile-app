"""Health + banner + catalog (categories, products)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query

from db import db
from models import BannerOut, Category, Product

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok", "service": "bharat_bazaar", "ts": datetime.now(timezone.utc).isoformat()}


@router.get("/banner", response_model=BannerOut)
async def get_banner():
    return BannerOut(
        message="Free delivery on orders over 1500 L · Cash on delivery available",
        free_delivery_min=1500.0,
        delivery_fee=99.0,
    )


@router.get("/categories", response_model=List[Category])
async def list_categories():
    cats = await db.categories.find({}, {"_id": 0}).sort("sort_order", 1).to_list(200)
    return cats


@router.get("/products", response_model=List[Product])
async def list_products(
    category: Optional[str] = Query(None, description="category slug"),
    q: Optional[str] = Query(None, description="search query"),
    limit: int = Query(100, ge=1, le=500),
):
    query: dict = {}
    if category:
        query["category_slug"] = category
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
            {"tags": {"$regex": q, "$options": "i"}},
        ]
    items = await db.products.find(query, {"_id": 0}).limit(limit).to_list(limit)
    return items


@router.get("/products/{product_id}", response_model=Product)
async def get_product(product_id: str):
    item = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Product not found")
    return item
