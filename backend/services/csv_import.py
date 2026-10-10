"""CSV import helpers and category-count refresh."""
from __future__ import annotations

import csv
import hashlib
import io
import re
from typing import Optional

from config import LEK_PER_EUR, PRODUCT_IMG_DIR
from db import db
from seed_data import CATEGORIES_SEED

# Map CSV category strings -> our 16-category slugs
CATEGORY_MAP = {
    "snacks": "snacks",
    "rtc (ready to cook)": "rtc",
    "ready to cook": "rtc",
    "rte (ready to eat)": "rte",
    "ready to eat": "rte",
    "noodles & pasta": "noodles_pasta",
    "noodles and pasta": "noodles_pasta",
    "mouth freshners (mukhwas)": "mukhwas",
    "mouth fresheners (mukhwas)": "mukhwas",
    "mukhwas": "mukhwas",
    "indian sweets (mithai)": "mithai",
    "mithai": "mithai",
    "flour": "flour",
    "rice": "rice",
    "lentils (dal)": "dal",
    "dal": "dal",
    "spices": "spices",
    "spices powder (masala)": "spices",
    "whole spices (sabut masala)": "spices",
    "condiments": "spices",
    "oil & ghee": "oils_ghee",
    "oils & ghee": "oils_ghee",
    "oils and ghee": "oils_ghee",
    "pickles": "pickles",
    "organic & healthy living": "organic",
    "high protien food": "organic",
    "high protein food": "organic",
    "tea (chai)": "organic",
    "pharma & wellness": "pharma",
    "health care": "pharma",
    "puja needs": "puja",
    "flavors & fragrance": "puja",
    "personal care": "personal_care",
    "skin care": "personal_care",
    "hair care": "personal_care",
    "body care": "personal_care",
}


def _normalize_drive_url(url: str) -> Optional[str]:
    if not url:
        return None
    url = url.strip()
    m = re.search(r"/file/d/([^/]+)", url)
    if not m:
        m = re.search(r"[?&]id=([^&]+)", url)
    if m:
        file_id = m.group(1)
        return f"https://lh3.googleusercontent.com/d/{file_id}=w600"
    return url


def _parse_float(v, default: float = 0.0) -> float:
    try:
        return float(str(v).strip().replace(",", "")) if v not in (None, "", "-") else default
    except (ValueError, TypeError):
        return default


def _parse_int(v, default: int = 0) -> int:
    try:
        return int(_parse_float(v, default))
    except (ValueError, TypeError):
        return default


def _slugify_cat(raw: str) -> Optional[str]:
    key = (raw or "").strip().lower()
    return CATEGORY_MAP.get(key)


def _display_weight(grams: Optional[float], sku_hint: str) -> str:
    if grams and grams > 0:
        if grams >= 1000:
            kg = grams / 1000.0
            return f"{kg:g} kg"
        return f"{int(grams)} g" if grams.is_integer() else f"{grams:g} g"
    return sku_hint or ""


def _row_to_product(row: dict) -> Optional[dict]:
    name = (row.get("name") or "").strip()
    cat_raw = (row.get("category") or "").strip()
    slug = _slugify_cat(cat_raw)
    if not name or not slug:
        return None
    weight_grams_raw = row.get("Weight (gm)") or row.get("weight_grams") or row.get("Weight") or ""
    weight_grams = _parse_float(weight_grams_raw, 0.0)
    weight_grams_val: Optional[float] = weight_grams if weight_grams > 0 else None
    weight_display = _display_weight(weight_grams_val, (row.get("sku") or "").strip())
    price = _parse_float(row.get("price"), 0.0)
    tags_raw = (row.get("tags") or "").strip()
    tags = [t.strip() for t in re.split(r"[|,;]", tags_raw) if t.strip()] if tags_raw else []
    variants_raw = (row.get("variants") or "").strip()
    variants = [v.strip() for v in re.split(r"[|,;]", variants_raw) if v.strip()] if variants_raw else []
    product_code = (row.get("Product Code") or row.get("product_code") or "").strip()
    key = product_code or f"{name}-{row.get('sku', '')}"
    pid = "p-" + hashlib.md5(key.encode()).hexdigest()[:12]
    return {
        "id": pid,
        "name": name,
        "description": (row.get("description") or name).strip(),
        "category_slug": slug,
        "price": price,
        "price_lek": price,
        "price_eur": round(price / LEK_PER_EUR, 2),
        "discount": _parse_float(row.get("discount"), 0.0),
        "sku": (row.get("sku") or "").strip(),
        "product_code": product_code,
        "ean_barcode": (row.get("EAN Barcode") or row.get("ean_barcode") or "").strip(),
        "stock": _parse_int(row.get("stock"), 0),
        "in_stock": _parse_int(row.get("stock"), 0) > 0,
        "weight": weight_display,
        "weight_grams": weight_grams_val,
        "weight_grams_inferred": False,
        "brand": (row.get("brand") or "").strip(),
        "tags": tags,
        "variants": variants,
        "image_emoji": "🛒",
        "image_url": _normalize_drive_url(row.get("image_url") or ""),
        "unit": weight_display or (row.get("sku") or "").strip(),
    }


async def import_products_from_csv_text(csv_text: str, replace: bool = False) -> dict:
    reader = csv.DictReader(io.StringIO(csv_text))
    inserted = 0
    updated = 0
    skipped = 0
    per_cat: dict = {}
    if replace:
        await db.products.delete_many({})
    for row in reader:
        prod = _row_to_product(row)
        if not prod:
            skipped += 1
            continue
        r = await db.products.update_one({"id": prod["id"]}, {"$set": prod}, upsert=True)
        if r.upserted_id:
            inserted += 1
        else:
            updated += 1
        per_cat[prod["category_slug"]] = per_cat.get(prod["category_slug"], 0) + 1
    for slug in per_cat:
        real_n = await db.products.count_documents({"category_slug": slug})
        await db.categories.update_one({"slug": slug}, {"$set": {"product_count": real_n}})
    for c in CATEGORIES_SEED:
        real_n = await db.products.count_documents({"category_slug": c["slug"]})
        await db.categories.update_one({"slug": c["slug"]}, {"$set": {"product_count": real_n}})
    return {
        "inserted": inserted,
        "updated": updated,
        "imported": inserted + updated,
        "skipped": skipped,
        "per_category": per_cat,
    }


def _drive_id(url: str) -> Optional[str]:
    if not url:
        return None
    m = re.search(r"/d/([A-Za-z0-9_-]+)", url) or re.search(r"[?&]id=([A-Za-z0-9_-]+)", url)
    return m.group(1) if m else None


def _master_image_url(barcode: str, drive_url: str) -> Optional[str]:
    """Prefer a previously-localized static file; else a resized Drive URL."""
    for ext in ("jpg", "png", "jpeg", "webp"):
        if (PRODUCT_IMG_DIR / f"{barcode}.{ext}").exists():
            return f"/api/static/products/{barcode}.{ext}"
    fid = _drive_id(drive_url)
    if fid:
        return f"https://lh3.googleusercontent.com/d/{fid}=w600"
    return drive_url or None


async def import_master_csv_text(csv_text: str, replace: bool = True) -> dict:
    """Import the Product Master CSV (barcode, sku, name, category_slug,
    subcategory, price_lek, discount, mrp_lek, weight, weight_grams, image_url,
    description) into the products collection."""
    reader = csv.DictReader(io.StringIO(csv_text))
    if replace:
        await db.products.delete_many({})
    docs: list = []
    per_cat: dict = {}
    for row in reader:
        barcode = (row.get("barcode") or "").strip()
        name = (row.get("name") or "").strip()
        slug = (row.get("category_slug") or "").strip()
        if not name or not slug:
            continue
        price = _parse_float(row.get("price_lek"), 0.0)
        mrp = _parse_float(row.get("mrp_lek"), 0.0)
        disc = _parse_float(row.get("discount"), 0.0)
        wg = _parse_float(row.get("weight_grams"), 0.0)
        weight = (row.get("weight") or "").strip()
        pid = "p-" + hashlib.md5((barcode or name).encode()).hexdigest()[:12]
        brand = name.split()[0].title() if name else ""
        docs.append({
            "id": pid,
            "name": name,
            "description": (row.get("description") or name).strip(),
            "category_slug": slug,
            "subcategory": (row.get("subcategory") or "").strip(),
            "price": price,
            "price_lek": price,
            "price_eur": round(price / LEK_PER_EUR, 2),
            "mrp_lek": mrp or None,
            "discount": disc,
            "sku": (row.get("sku") or "").strip(),
            "product_code": barcode,
            "ean_barcode": barcode,
            "stock": 100,
            "in_stock": True,
            "weight": weight,
            "weight_grams": wg or None,
            "weight_grams_inferred": False,
            "brand": brand,
            "tags": [],
            "variants": [],
            "image_emoji": "🛒",
            "image_url": _master_image_url(barcode, (row.get("image_url") or "").strip()),
            "unit": weight,
        })
        per_cat[slug] = per_cat.get(slug, 0) + 1
    if docs:
        await db.products.insert_many(docs)
    for c in CATEGORIES_SEED:
        n = await db.products.count_documents({"category_slug": c["slug"]})
        await db.categories.update_one({"slug": c["slug"]}, {"$set": {"product_count": n}})
    return {"inserted": len(docs), "per_category": per_cat}


async def refresh_category_counts():
    pipe = [{"$group": {"_id": "$category_slug", "count": {"$sum": 1}}}]
    counts: dict = {}
    async for row in db.products.aggregate(pipe):
        counts[row["_id"]] = row["count"]
    async for cat in db.categories.find({}, {"_id": 0, "slug": 1}):
        await db.categories.update_one(
            {"slug": cat["slug"]},
            {"$set": {"product_count": counts.get(cat["slug"], 0)}},
        )
