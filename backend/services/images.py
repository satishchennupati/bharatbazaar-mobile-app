"""Product image persistence helpers (data URL upload + Drive sync)."""
from __future__ import annotations

import base64
import logging
import os
import re
from typing import Optional

import httpx

from config import PRODUCT_IMG_DIR, OFFER_IMG_DIR, STATIC_DIR
from db import db

logger = logging.getLogger("bharat_bazaar")


# ---------- Data-URL persistence ----------
def save_data_url_as_image(data_url: str, product_id: str, subdir: str = "products") -> Optional[str]:
    """Persist a data URL into the appropriate static folder. Returns public /api/static/... URL."""
    m = re.match(r"^data:image/(\w+);base64,(.+)$", data_url, re.S)
    if not m:
        return None
    ext = m.group(1).lower().replace("jpeg", "jpg")
    if ext not in {"png", "jpg", "gif", "webp"}:
        ext = "jpg"
    try:
        content = base64.b64decode(m.group(2))
    except Exception:
        return None
    if subdir == "offers":
        target_dir = OFFER_IMG_DIR
    elif subdir == "products":
        target_dir = PRODUCT_IMG_DIR
    else:
        target_dir = STATIC_DIR / subdir
        target_dir.mkdir(parents=True, exist_ok=True)
    fname = f"{product_id}.{ext}"
    fpath = target_dir / fname
    with open(fpath, "wb") as f:
        f.write(content)
    return f"/api/static/{subdir}/{fname}"


# ---------- Google Drive sync ----------
def _extract_drive_id(url: str) -> Optional[str]:
    if not url:
        return None
    m = re.search(r"/d/([A-Za-z0-9_-]+)", url) or re.search(r"[?&]id=([A-Za-z0-9_-]+)", url)
    return m.group(1) if m else None


async def _download_drive_file(file_id: str) -> Optional[bytes]:
    urls = [
        f"https://lh3.googleusercontent.com/d/{file_id}=w800",
        f"https://drive.google.com/uc?export=download&id={file_id}",
    ]
    headers = {"User-Agent": "Mozilla/5.0 (compatible; BharatBazaar/1.0)"}
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True, headers=headers) as client:
        for url in urls:
            try:
                r = await client.get(url)
            except httpx.RequestError as exc:
                logger.warning("Drive fetch network error %s: %s", file_id, exc)
                continue
            if r.status_code == 200 and r.headers.get("content-type", "").startswith("image/"):
                return r.content
            logger.debug("Drive fetch %s from %s -> %s", file_id, url, r.status_code)
    logger.warning("Drive download failed for %s from all endpoints", file_id)
    return None


async def sync_one_product_image(product: dict) -> str:
    src = product.get("image_url") or ""
    if not src or "drive.google" not in src and "googleusercontent" not in src:
        return "skipped-no-drive"
    fid = _extract_drive_id(src)
    if not fid:
        return "skipped-no-id"
    ext = "jpg"
    fname = f"{product.get('product_code') or product['id']}.{ext}"
    fpath = PRODUCT_IMG_DIR / fname
    if fpath.exists() and fpath.stat().st_size > 500:
        new_url = f"/api/static/products/{fname}"
        if product.get("image_url") != new_url:
            await db.products.update_one({"id": product["id"]}, {"$set": {"image_url": new_url}})
        return "cached"
    data = await _download_drive_file(fid)
    if not data:
        return "download-failed"
    fpath.write_bytes(data)
    new_url = f"/api/static/products/{fname}"
    await db.products.update_one({"id": product["id"]}, {"$set": {"image_url": new_url}})
    return "synced"
