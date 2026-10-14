# Bharat Bazaar — Mobile App PRD

## Overview
A React Native Expo mobile app for **Bharat Bazaar** (companion to mybazaarcart.com) — grocery delivery marketplace serving Albania and neighbouring markets. Mirrors website branding (orange `#FF5722` on warm off-white `#FAFAF8`) and replicates the website's category-led shopping flow.

## Users
- **Existing customers** log in with username + password.
- **New customers** register by phone (E.164) with Twilio SMS OTP verification.

## Languages & Currency
- 7 languages: English, Shqip (Albanian), Hindi, Italian, Greek, French, Macedonian.
- 2 currencies: Lekë (L) and Euro (€). Currency conversion uses a flat 1 EUR ≈ 100 L ratio for display.

## Features
1. **Onboarding** — language + currency picker on first launch, features the Bharat Bazaar B-cart logo.
2. **Authentication**
   - Username/password login (existing users)
   - OTP-verified signup (new users) via Twilio SMS
3. **Home** — sticky greeting, search bar, promo banner ("Free delivery on orders over 1500 L · COD available"), 8-category quick grid, "Best sellers" product list.
4. **Categories** — full 19-category grid (10 active + 9 "Coming soon" with dashed border + dark badge, matching website).
5. **Category browse / search** — `/category/[slug]` and `/category/search?q=`.
6. **Product detail** — emoji hero, name, price, description, tags, qty selector, add to cart.
7. **Cart** — list items, qty edit, remove, "add X more for FREE delivery" hint, subtotal/fee/total breakdown.
8. **Checkout** — segmented address entry (**Manual** or **Pick on map**) with structured fields:
   - Country (dropdown of 90+ countries with flag + dial code, searchable)
   - State / Qark (dropdown for Albania: 12 qarks; free text elsewhere)
   - City / Bashkia (dropdown populated from selected qark for Albania; free text elsewhere)
   - Area (Lagje) — free text
   - Landmark (Pranë / Afër) — free text
   - Postal code (optional)
   - Phone (with country dial hint)
   - WhatsApp number (optional)
   - Order note (optional)
   COD-only payment, place order, address persisted to user profile on first save.
   **Reverse-geocode auto-fill**: when the user picks a location on the map, Google's returned admin_area_level_1 (e.g. "Tirana County", "Durrës County", "Qarku i Tiranës") is fuzzy-matched to our 12 qarks list and the corresponding bashkia is auto-selected too.
   **Mini-map preview**: a Google Static Maps image of the picked location is shown inline (requires "Maps Static API" enabled on the Google key). A graceful pin-badge + coordinate fallback is displayed when the API returns 403.
9. **Order success** — order ID + ETA.
10. **Orders history** — past orders with status, items, total.
11. **Profile** — user info, language switcher, currency switcher, saved addresses count, logout.

## Branding
- App name: **Bharat Bazaar**
- Logo: orange B-shaped shopping cart (used in launcher icon, splash, onboarding, login header, home header).
- Primary color: `#FF5722`  |  Surface: `#FFFFFF`  |  Background: `#FAFAF8`

## Backend (FastAPI + MongoDB)
- 19 categories seeded (matching website slugs/emojis)
- 174 products seeded across 10 active categories
- JWT auth, bcrypt password hash
- Twilio OTP send/verify with rate limiting (5 attempts, 10-minute expiry). SMS body: *"Your Bharat Bazaar verification code is XXXXXX."*
- Cart persistence per user, COD-only order placement
- Free delivery threshold: ≥ 1500 LEK, otherwise 99 LEK delivery fee

## Tech
- Expo SDK 54, expo-router, react-native-safe-area-context, react-native-keyboard-controller
- FastAPI, motor, bcrypt, PyJWT, Twilio

## Admin Module (Phases 1–4 — complete)
- **Adaptive UI**: tab bar on mobile, sidebar on wide screens. Route: `/admin/*`.
- **Phase 1** — Auth: `POST /api/admin/auth/login` (403 for non-admins), `GET /api/admin/verify`. Seeded admin `+355690000001 / admin123`.
- **Phase 2** — Order tracking: list/detail/update status + delivery person, KPI dashboard `/api/admin/dashboard/summary`.
- **Phase 3** — Product management: CRUD + image upload (data URL → static) + CSV bulk import + category counters refresh.
- **Phase 4** — Offers:
  - Home banners (rotating carousel component `OffersCarousel` on Home tab)
  - Coupon codes (WELCOME10 seeded — 10% off, min 1000 L, 300 L cap, 1 per user). Cart shows inline coupon input; validated live on subtotal change; order stored with `coupon_code`, `coupon_discount_lek`, and increments `offer.usage_count`.
  - Category-wide discounts (percent off applied per line at order time; stored on order.items[]).
  - Endpoints: `GET /api/offers/banners`, `GET /api/offers/category-discounts`, `POST /api/offers/validate-coupon` (public); `GET|POST|PATCH|DELETE /api/admin/offers`, `POST /api/admin/offers/{id}/toggle` (admin JWT).

## Backend architecture (post-refactor)
- `server.py` (thin, ~65 lines) mounts routers only
- `config.py`, `db.py`, `security.py`, `models.py`
- `routes/`: catalog, auth, me, cart, orders, geo, offers, admin_auth, admin_orders, admin_products, admin_offers
- `services/`: csv_import, cart, images, offers, seed


## Catalog (v4 — Product Master, Oct 2026)
- Full catalog REPLACED by Product Master Excel: 305 products across 7 top-level categories.
- Categories: food(159), spices(85), rice_grain_flour(13), personal_care(17), household(26), pooja_needs(4), healthcare(1).
- 3 category photos hosted at /api/static/categories/{food,spices,personal_care}.jpg
- 282 product images localized to /api/static/products/<barcode>.jpg; 23 private Drive images => null (emoji fallback).
- Pricing: price_lek=PRICE, mrp_lek=PRE-DISCOUNT (struck), discount=DISCOUNT% (badge), eur=lek/100.
- Seed: SEED_VERSION v4-2026-10-master; imports backend/product_master.csv; services/seed.ensure_category_images() downloads the 3 photos idempotently.
- Image downloader script: backend/scripts/download_product_images.py (re-run to localize remaining images if Drive files are later made public).

## Event Webhooks (added)
- All business events POST a consistent envelope to WEBHOOK_URL (backend/.env). Service: backend/services/webhooks.py (emit_event, fire-and-forget, non-blocking, best-effort).
- Envelope: schemaVersion/eventId(evt_)/eventType/eventTimestamp(UTC Z)/source{application:bharatbazaar,platform,appVersion,environment}/store{storeId,storeName}/actor{customerId,sessionId}/correlationId/data.
- Events wired:
  - otp.sent  -> routes/auth.py _send_sms_otp (purpose register|reset); data: purpose, phoneCountryCode, phoneMasked, channel, providerMessageId(twilio sid), deliveryStatus.
  - order.placed -> routes/orders.py after insert; data: orderId, orderNumber(=id), orderType, currency(LEK), totalAmount, paymentStatus(pending-COD), orderStatus, itemCount.
  - order.status_updated -> routes/admin_orders.py on status change; data: orderId, previousStatus, currentStatus, statusReason(admin_note), updatedBy(store), statusSequence.
  - payment.completed -> routes/admin_orders.py when status becomes 'delivered' (COD cash collected); provider/method=cod, paymentStatus=captured.
- Config in backend/.env: WEBHOOK_URL, WEBHOOK_ENV, APP_VERSION, STORE_ID. Verified live POST returns 200.

## Shipping weight rounding (updated)
- Billable weight rounds UP to next whole kg (math.ceil) in services/shipping.py: 0.45kg->1kg=100L, 1.2kg->2kg=200L. Field billable_kg added to quote; checkout.tsx hint shows billable_kg.

## Shipping zone rates (updated)
- Per-zone delivery rate below free threshold: Tirana 100 L/kg, Rest of Albania 300 L/kg (was single flat rate). Settings keys: rate_per_kg_tirana_lek(100), rate_per_kg_outside_lek(300) in services/settings.py SHIPPING_DEFAULTS; model ShippingSettingsIn updated; admin/settings.tsx shows both zone rate fields. Billable weight still ceil to next whole kg.
- Checkout order summary now shows a "Total weight" row (sum of item weight_grams × qty; kg if ≥1kg else g). CartItem type in src/lib/api.ts gained optional weight_grams (already returned by enrich_cart).
