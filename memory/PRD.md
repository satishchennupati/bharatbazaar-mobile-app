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
