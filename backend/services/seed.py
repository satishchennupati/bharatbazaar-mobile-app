"""Startup seeding: catalog migration, indices, demo/admin/quick users, sample offers."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from config import ROOT_DIR, STATIC_DIR
from db import db
from seed_data import CATEGORIES_SEED, PRODUCTS_SEED, SEED_VERSION
from security import hash_pw
from services.csv_import import import_master_csv_text

logger = logging.getLogger("bharat_bazaar")

# User-supplied category photos (downloaded to static on first boot).
CATEGORY_IMAGE_SOURCES = {
    "spices": "https://customer-assets-0z36b82j.emergentagent.net/job_bharat-app-8/artifacts/cfcfc5f68bafc588_Spices.jpg.jpeg",
    "food": "https://customer-assets-0z36b82j.emergentagent.net/job_bharat-app-8/artifacts/98ca63f7ee5fa071_FMCG%20Food.jpg.jpeg",
    "personal_care": "https://customer-assets-0z36b82j.emergentagent.net/job_bharat-app-8/artifacts/a2317d9244b737ce_Personal%20Care.jpg.jpeg",
    "rice_grain_flour": "https://customer-assets-0z36b82j.emergentagent.net/job_bharat-app-8/artifacts/997573bd231b2306_RICE%2C%20GRAIN%20%26%20FLOUR.png",
    "pooja_needs": "https://customer-assets-0z36b82j.emergentagent.net/job_bharat-app-8/artifacts/e63598475eaffed4_Pooja1.png",
    "household": "https://customer-assets-0z36b82j.emergentagent.net/job_bharat-app-8/artifacts/d3a99e77e87df71b_Home%20Care1.png",
}


async def ensure_category_images():
    """Download the category photos into static/categories (downscaled to JPEG)
    and point the category docs at them. Always overwrites so updated artwork is
    picked up (old catalogs may have left stale files with the same slug)."""
    import io

    import httpx
    from PIL import Image

    version = "5"  # bump to force clients to refetch after artwork changes
    cat_dir = STATIC_DIR / "categories"
    cat_dir.mkdir(parents=True, exist_ok=True)

    def to_jpeg(raw: bytes) -> bytes:
        im = Image.open(io.BytesIO(raw))
        if im.mode in ("RGBA", "LA", "P"):
            im = im.convert("RGBA")
            bg = Image.new("RGB", im.size, (255, 255, 255))
            bg.paste(im, mask=im.split()[-1])
            im = bg
        else:
            im = im.convert("RGB")
        im.thumbnail((800, 800), Image.LANCZOS)
        out = io.BytesIO()
        im.save(out, format="JPEG", quality=85, optimize=True)
        return out.getvalue()

    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        for slug, url in CATEGORY_IMAGE_SOURCES.items():
            fpath = cat_dir / f"{slug}.jpg"
            try:
                r = await client.get(url)
                if r.status_code == 200 and len(r.content) > 500:
                    try:
                        fpath.write_bytes(to_jpeg(r.content))
                    except Exception:
                        fpath.write_bytes(r.content)
            except Exception as e:
                logger.warning("Category image fetch failed for %s: %s", slug, e)
            if fpath.exists():
                await db.categories.update_one(
                    {"slug": slug},
                    {"$set": {"image_url": f"/api/static/categories/{slug}.jpg?v={version}"}},
                )


async def seed_all():
    # Version-gated catalog migration
    meta = await db.meta.find_one({"key": "catalog_seed"})
    current_version = (meta or {}).get("version")
    need_reseed = current_version != SEED_VERSION
    if need_reseed:
        logger.info("Catalog seed version mismatch (%s -> %s); re-seeding", current_version, SEED_VERSION)
        await db.categories.delete_many({})
        await db.products.delete_many({})
        await db.carts.update_many({}, {"$set": {"items": []}})

    cat_count = await db.categories.count_documents({})
    if cat_count == 0:
        await db.categories.insert_many([dict(c) for c in CATEGORIES_SEED])
        logger.info("Seeded %d categories", len(CATEGORIES_SEED))
    prod_count = await db.products.count_documents({})
    if prod_count == 0:
        csv_path = ROOT_DIR / "product_master.csv"
        if csv_path.exists():
            with open(csv_path, encoding="utf-8") as f:
                text = f.read()
            result = await import_master_csv_text(text, replace=False)
            logger.info("Imported %d products from Product Master", result["inserted"])
        else:
            logger.warning("product_master.csv not found; no products seeded")
    # Ensure category photos exist and are linked (idempotent).
    await ensure_category_images()
    if need_reseed:
        await db.meta.update_one(
            {"key": "catalog_seed"},
            {"$set": {"key": "catalog_seed", "version": SEED_VERSION,
                      "applied_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )

    await db.users.create_index("username", unique=True)
    await db.users.create_index("phone", unique=True, sparse=True)
    await db.carts.create_index("user_id", unique=True)
    await db.orders.create_index("user_id")
    # Offers indexes
    await db.offers.create_index("type")
    await db.offers.create_index("coupon_code", sparse=True)

    # Demo user
    if not await db.users.find_one({"username": "demo"}):
        await db.users.insert_one({
            "id": "demo-user-001",
            "username": "demo",
            "phone": "+355690000000",
            "full_name": "Demo Customer",
            "email": "demo@bharatbazaar.com",
            "language": "en",
            "currency": "LEK",
            "password_hash": hash_pw("demo1234"),
            "addresses": [
                {"id": "addr-demo", "label": "Home", "line1": "Rruga e Durresit 12", "line2": "Apt 4",
                 "city": "Tirana", "postal_code": "1001", "country": "Albania",
                 "phone": "+355690000000"}
            ],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Seeded demo user (demo / demo1234)")

    # Whitelisted quick-access user
    quick_phone = "+355695808480"
    quick_pw = "123456"
    existing = await db.users.find_one({"phone": quick_phone})
    if not existing:
        try:
            await db.users.insert_one({
                "id": "quick-user-001",
                "username": "quick_user",
                "phone": quick_phone,
                "full_name": "Bharat Bazaar Customer",
                "email": "quickuser@bharatbazaar.com",
                "language": "en",
                "currency": "LEK",
                "password_hash": hash_pw(quick_pw),
                "addresses": [],
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            logger.info("Seeded quick-access user (%s / %s)", quick_phone, quick_pw)
        except Exception as e:
            logger.warning("Could not seed quick user: %s", e)
    else:
        await db.users.update_one(
            {"phone": quick_phone},
            {"$set": {"password_hash": hash_pw(quick_pw)}},
        )
        logger.info("Ensured quick-access password for %s", quick_phone)

    # Default admin user
    admin_phone = "+355690000001"
    admin_pw = "admin123"
    admin_defaults = {
        "id": "admin-001", "username": "admin", "phone": admin_phone,
        "full_name": "Bharat Bazaar Admin", "email": "admin@bharatbazaar.com",
        "language": "en", "currency": "LEK", "addresses": [], "is_admin": True,
        "role": "admin",
    }
    existing_admin = await db.users.find_one({"phone": admin_phone})
    if not existing_admin:
        try:
            await db.users.insert_one({
                **admin_defaults,
                "password_hash": hash_pw(admin_pw),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            logger.info("Seeded admin user (%s / %s)", admin_phone, admin_pw)
        except Exception as e:
            logger.warning("Could not seed admin user: %s", e)
    else:
        await db.users.update_one(
            {"phone": admin_phone},
            {"$set": {"password_hash": hash_pw(admin_pw), "is_admin": True, "role": "admin"}},
        )
        logger.info("Ensured admin flag & password for %s", admin_phone)

    # Orders-only staff accounts: can view orders & change status, but cannot
    # access products, offers, shipping settings or the dashboard.
    staff_pw = "admin#123"
    staff_accounts = [
        {"id": "staff-001", "phone": "+355690000002", "full_name": "Orders Staff 1"},
        {"id": "staff-002", "phone": "+355690000003", "full_name": "Orders Staff 2"},
    ]
    for s in staff_accounts:
        defaults = {
            "id": s["id"], "username": s["phone"].replace("+", "u"), "phone": s["phone"],
            "full_name": s["full_name"], "email": "", "language": "en", "currency": "LEK",
            "addresses": [], "is_admin": True, "role": "orders_staff",
        }
        existing_staff = await db.users.find_one({"phone": s["phone"]})
        if not existing_staff:
            try:
                await db.users.insert_one({
                    **defaults,
                    "password_hash": hash_pw(staff_pw),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
                logger.info("Seeded orders-staff user %s", s["phone"])
            except Exception as e:
                logger.warning("Could not seed staff user %s: %s", s["phone"], e)
        else:
            await db.users.update_one(
                {"phone": s["phone"]},
                {"$set": {"password_hash": hash_pw(staff_pw), "is_admin": True, "role": "orders_staff"}},
            )
            logger.info("Ensured orders-staff flag & password for %s", s["phone"])

    # Sample offer seed (idempotent - only if collection empty)
    if await db.offers.count_documents({}) == 0:
        now = datetime.now(timezone.utc).isoformat()
        samples = [
            {
                "id": "off-welcome",
                "type": "banner",
                "title": "Welcome to Bharat Bazaar",
                "description": "Fresh Indian groceries, delivered across Albania.",
                "active": True,
                "priority": 100,
                "banner_bg_color": "#FF5722",
                "banner_text_color": "#FFFFFF",
                "cta_label": "Shop now",
                "cta_target": "tab:categories",
                "created_at": now, "updated_at": now,
            },
            {
                "id": "off-freeship",
                "type": "banner",
                "title": "Free shipping over 2000 L",
                "description": "Enjoy free delivery on orders above 2000 L.",
                "active": True,
                "priority": 90,
                "banner_bg_color": "#0F9D58",
                "banner_text_color": "#FFFFFF",
                "cta_label": "Explore",
                "cta_target": "tab:categories",
                "created_at": now, "updated_at": now,
            },
            {
                "id": "off-coupon-welcome10",
                "type": "coupon",
                "title": "WELCOME10 · 10% off first order",
                "description": "Get 10% off your first order over 1000 L (max 300 L).",
                "active": True,
                "priority": 80,
                "coupon_code": "WELCOME10",
                "discount_type": "percent",
                "discount_value": 10,
                "min_order_lek": 1000,
                "max_discount_lek": 300,
                "usage_limit": None,
                "usage_count": 0,
                "per_user_limit": 1,
                "created_at": now, "updated_at": now,
            },
        ]
        await db.offers.insert_many(samples)
        logger.info("Seeded %d sample offers", len(samples))

    # Idempotent promo_strip seed — create a default one if none exists yet.
    if await db.offers.count_documents({"type": "promo_strip"}) == 0:
        now = datetime.now(timezone.utc).isoformat()
        await db.offers.insert_one({
            "id": "off-promo-strip-default",
            "type": "promo_strip",
            "title": "Free shipping ribbon",
            "description": "Home-screen promo strip",
            "active": True,
            "priority": 100,
            "promo_headline": "FREE shipping",
            "promo_amount": "2000 L",
            "promo_sub": "Cash on delivery available",
            "created_at": now, "updated_at": now,
        })
        logger.info("Seeded default promo_strip offer")
