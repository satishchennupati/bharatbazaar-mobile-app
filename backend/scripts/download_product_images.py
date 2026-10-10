"""One-off: download each product's Google Drive image, downscale to JPEG,
store under static/products/<barcode>.jpg and point the product at it."""
import asyncio
import csv
import io
import re
import sys
from pathlib import Path

import httpx
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import PRODUCT_IMG_DIR  # noqa: E402
from db import db  # noqa: E402

CSV_PATH = Path(__file__).resolve().parent.parent / "product_master.csv"
MAX_DIM = 600
CONCURRENCY = 8


def drive_id(url: str):
    m = re.search(r"/d/([A-Za-z0-9_-]+)", url or "") or re.search(r"[?&]id=([A-Za-z0-9_-]+)", url or "")
    return m.group(1) if m else None


def to_jpeg(raw: bytes) -> bytes:
    im = Image.open(io.BytesIO(raw))
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1] if im.mode == "RGBA" else None)
        im = bg
    else:
        im = im.convert("RGB")
    im.thumbnail((MAX_DIM, MAX_DIM), Image.LANCZOS)
    out = io.BytesIO()
    im.save(out, format="JPEG", quality=82, optimize=True)
    return out.getvalue()


async def fetch_one(client, sem, row, stats):
    barcode = (row.get("barcode") or "").strip()
    fid = drive_id(row.get("image_url") or "")
    if not barcode or not fid:
        stats["skipped"] += 1
        return
    fpath = PRODUCT_IMG_DIR / f"{barcode}.jpg"
    if fpath.exists() and fpath.stat().st_size > 800:
        await db.products.update_one({"product_code": barcode}, {"$set": {"image_url": f"/api/static/products/{barcode}.jpg"}})
        stats["cached"] += 1
        return
    urls = [f"https://lh3.googleusercontent.com/d/{fid}=w800", f"https://drive.google.com/uc?export=download&id={fid}"]
    async with sem:
        for url in urls:
            try:
                r = await client.get(url)
            except Exception:
                continue
            if r.status_code == 200 and r.headers.get("content-type", "").startswith("image/"):
                try:
                    data = to_jpeg(r.content)
                except Exception as e:
                    print("convert fail", barcode, e)
                    continue
                fpath.write_bytes(data)
                await db.products.update_one({"product_code": barcode}, {"$set": {"image_url": f"/api/static/products/{barcode}.jpg"}})
                stats["synced"] += 1
                return
    stats["failed"] += 1
    stats["failed_list"].append(barcode)


async def main():
    with open(CSV_PATH, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    stats = {"synced": 0, "cached": 0, "failed": 0, "skipped": 0, "failed_list": []}
    sem = asyncio.Semaphore(CONCURRENCY)
    headers = {"User-Agent": "Mozilla/5.0 (compatible; BharatBazaar/1.0)"}
    async with httpx.AsyncClient(timeout=40.0, follow_redirects=True, headers=headers) as client:
        tasks = [fetch_one(client, sem, row, stats) for row in rows]
        for i in range(0, len(tasks), 40):
            await asyncio.gather(*tasks[i:i + 40])
            print(f"progress: {min(i+40,len(tasks))}/{len(tasks)}  synced={stats['synced']} cached={stats['cached']} failed={stats['failed']}")
    print("DONE", {k: v for k, v in stats.items() if k != "failed_list"})
    if stats["failed_list"]:
        print("FAILED:", stats["failed_list"][:30])


if __name__ == "__main__":
    asyncio.run(main())
