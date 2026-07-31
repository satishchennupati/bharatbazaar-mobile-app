"""Startup seeding: catalog migration, indices, demo/admin/quick users, sample offers."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from config import ROOT_DIR
from db import db
from seed_data import CATEGORIES_SEED, PRODUCTS_SEED, SEED_VERSION
from security import hash_pw
from services.csv_import import import_products_from_csv_text

logger = logging.getLogger("bharat_bazaar")


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
        csv_path = ROOT_DIR / "inventory_import.csv"
        if csv_path.exists():
            with open(csv_path, encoding="latin-1") as f:
                text = f.read()
            result = await import_products_from_csv_text(text, replace=False)
            logger.info("Imported %d products from CSV (skipped %d)", result["imported"], result["skipped"])
        else:
            await db.products.insert_many([dict(p) for p in PRODUCTS_SEED])
            logger.info("Seeded %d sample products", len(PRODUCTS_SEED))
            for c in CATEGORIES_SEED:
                n = sum(1 for p in PRODUCTS_SEED if p["category_slug"] == c["slug"])
                await db.categories.update_one({"slug": c["slug"]}, {"$set": {"product_count": n}})
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
            {"$set": {"password_hash": hash_pw(admin_pw), "is_admin": True}},
        )
        logger.info("Ensured admin flag & password for %s", admin_phone)

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
                "title": "Free shipping over 1500 L",
                "description": "Enjoy free delivery on orders above 1500 L.",
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
