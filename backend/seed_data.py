"""Bharat Bazaar seed catalog — 16 Indian grocery categories."""
from __future__ import annotations
import hashlib
from typing import Dict, List

SEED_VERSION = "v4-2026-10-master"
LEK_PER_EUR = 100.0


def _eur(lek: float) -> float:
    return round(lek / LEK_PER_EUR, 2)


# 7 top-level categories from the Product Master. Image URLs for the three
# user-supplied category photos are served from static (ensured at startup).
CATEGORIES_SEED: List[Dict] = [
    {"id": "cat-01", "slug": "food",             "name": "Food & Snacks",      "emoji": "🍿", "coming_soon": False, "sort_order": 1, "image_url": "/api/static/categories/food.jpg"},
    {"id": "cat-02", "slug": "spices",           "name": "Spices & Masala",    "emoji": "🌶️", "coming_soon": False, "sort_order": 2, "image_url": "/api/static/categories/spices.jpg"},
    {"id": "cat-03", "slug": "rice_grain_flour", "name": "Rice, Grain & Flour","emoji": "🌾", "coming_soon": False, "sort_order": 3, "image_url": None},
    {"id": "cat-04", "slug": "personal_care",    "name": "Personal Care",      "emoji": "🧴", "coming_soon": False, "sort_order": 4, "image_url": "/api/static/categories/personal_care.jpg"},
    {"id": "cat-05", "slug": "household",         "name": "Household",          "emoji": "🧹", "coming_soon": False, "sort_order": 5, "image_url": None},
    {"id": "cat-06", "slug": "pooja_needs",      "name": "Pooja Needs",        "emoji": "🪔", "coming_soon": False, "sort_order": 6, "image_url": None},
    {"id": "cat-07", "slug": "healthcare",       "name": "Healthcare",         "emoji": "💊", "coming_soon": False, "sort_order": 7, "image_url": None},
]


def _pid(slug: str, name: str) -> str:
    return "p-" + hashlib.md5(f"{SEED_VERSION}:{slug}-{name}".encode()).hexdigest()[:10]


# (name, emoji, unit, price_lek, tags)
_TABLE = {
    "snacks": [
        ("Haldiram's Aloo Bhujia", "🍟", "200g", 280, ["namkeen"]),
        ("Haldiram's Bhujia Sev", "🍜", "200g", 270, ["namkeen"]),
        ("Haldiram's Mixture", "🥨", "200g", 290, ["namkeen"]),
        ("Lay's Magic Masala", "🥔", "52g", 120, ["chips"]),
        ("Kurkure Masala Munch", "🌽", "90g", 150, ["chips"]),
        ("Bikaji Bhujia", "🍟", "200g", 260, ["namkeen"]),
        ("Sev Mamra Bombay Mix", "🍜", "200g", 200, ["namkeen"]),
        ("Roasted Chana Spicy", "🟤", "200g", 260, ["healthy"]),
        ("Murukku Mini", "🥨", "150g", 230, ["south-indian"]),
        ("Banana Chips Salted", "🍌", "150g", 220, ["kerala"]),
        ("Moong Dal Namkeen", "🟡", "200g", 240, ["namkeen"]),
        ("Peanut Masala", "🥜", "200g", 220, ["namkeen"]),
    ],
    "rtc": [
        ("Aashirvaad Instant Poha Mix", "🥄", "80g", 90, ["mtr"]),
        ("MTR Rava Idli Mix", "⚪", "500g", 220, ["mtr"]),
        ("MTR Gulab Jamun Mix", "🟤", "500g", 260, ["mtr"]),
        ("MTR Upma Mix", "🥄", "200g", 180, ["mtr"]),
        ("Gits Dosa Mix", "🥞", "500g", 240, ["gits"]),
        ("Gits Jalebi Mix", "🟡", "500g", 260, ["gits"]),
        ("Everest Sambar Masala", "🌶️", "100g", 130, ["masala"]),
        ("Dabur Hommade Ginger-Garlic Paste", "🟡", "200g", 110, ["paste"]),
        ("Idli Rava", "⚪", "1kg", 220, ["south-indian"]),
        ("Vermicelli Plain", "🍝", "400g", 110, ["seviyan"]),
    ],
    "rte": [
        ("MTR Ready Poha", "🥄", "80g", 90, ["ready"]),
        ("MTR Ready Khichdi", "🥄", "80g", 100, ["ready"]),
        ("Haldiram's Palak Paneer", "🍲", "300g", 320, ["ready"]),
        ("Haldiram's Dal Makhani", "🍲", "300g", 320, ["ready"]),
        ("Kitchens of India Butter Chicken", "🍲", "285g", 380, ["ready"]),
        ("ID Chapati (Pack of 5)", "🫓", "250g", 180, ["ready"]),
        ("ID Malabar Paratha", "🫓", "400g", 240, ["ready"]),
        ("Tasty Bite Rajma Masala", "🍲", "285g", 340, ["ready"]),
    ],
    "noodles_pasta": [
        ("Maggi 2-Minute Noodles", "🍜", "70g", 60, ["maggi"]),
        ("Maggi Atta Noodles", "🍜", "75g", 70, ["maggi"]),
        ("Maggi Oats Noodles", "🍜", "72g", 75, ["maggi"]),
        ("Top Ramen Curry", "🍜", "80g", 65, ["ramen"]),
        ("Yippee Magic Masala", "🍜", "60g", 50, ["noodles"]),
        ("Wai Wai Instant", "🍜", "75g", 55, ["noodles"]),
        ("Del Monte Fusilli Pasta", "🍝", "500g", 220, ["pasta"]),
        ("Del Monte Penne Pasta", "🍝", "500g", 220, ["pasta"]),
        ("Chings Schezwan Noodles", "🍜", "150g", 90, ["chings"]),
    ],
    "mukhwas": [
        ("Rajwadi Meethi Saunf", "🌿", "100g", 140, ["mukhwas"]),
        ("Mint Mukhwas Mix", "🌿", "100g", 130, ["mukhwas"]),
        ("Rose Gulkand Paan Mukhwas", "🌹", "100g", 160, ["mukhwas"]),
        ("Sugar Coated Saunf", "🟢", "100g", 130, ["mukhwas"]),
        ("Rajwadi Special Churan", "🟤", "100g", 130, ["churan"]),
        ("Pass Pass Pan Masala", "🟢", "100g", 90, ["mukhwas"]),
        ("Chandan Mukhwas", "🌿", "100g", 150, ["mukhwas"]),
    ],
    "mithai": [
        ("Haldiram's Soan Papdi", "🍯", "500g", 380, ["mithai"]),
        ("Haldiram's Kaju Katli", "💎", "250g", 720, ["mithai"]),
        ("Bikaji Gulab Jamun Tin", "🟤", "1kg", 380, ["mithai"]),
        ("Rasgulla Tin", "⚪", "1kg", 320, ["mithai"]),
        ("Haldiram's Motichoor Ladoo", "🟡", "400g", 320, ["mithai"]),
        ("Rajbhog Mysore Pak", "🟨", "400g", 340, ["mithai"]),
        ("Haldiram's Rasmalai Tin", "⚪", "1kg", 380, ["mithai"]),
        ("Bikanervala Kesar Peda", "🟡", "400g", 360, ["mithai"]),
    ],
    "flour": [
        ("Aashirvaad Whole Wheat Atta", "🌾", "5kg", 720, ["atta"]),
        ("Aashirvaad Multigrain Atta", "🌾", "5kg", 880, ["atta"]),
        ("Pillsbury Chakki Fresh Atta", "🌾", "5kg", 680, ["atta"]),
        ("Besan Gram Flour", "🟡", "1kg", 180, ["flour"]),
        ("Maida Refined Flour", "⚪", "1kg", 80, ["flour"]),
        ("Suji Semolina (Rava)", "⚪", "1kg", 90, ["flour"]),
        ("Ragi Flour Whole", "🟤", "500g", 140, ["millet"]),
        ("Bajra Flour", "🟤", "500g", 140, ["millet"]),
        ("Jowar Flour", "🟤", "500g", 150, ["millet"]),
        ("Rice Flour", "⚪", "500g", 100, ["flour"]),
    ],
    "rice": [
        ("India Gate Basmati Rice", "🌾", "5kg", 1450, ["basmati"]),
        ("Daawat Basmati Premium", "🌾", "5kg", 1380, ["basmati"]),
        ("Kohinoor Super Basmati", "🌾", "5kg", 1520, ["basmati"]),
        ("Sona Masoori Rice", "🌾", "5kg", 850, ["rice"]),
        ("Ponni Boiled Rice", "🌾", "5kg", 780, ["rice"]),
        ("Brown Basmati Rice", "🌾", "1kg", 320, ["healthy"]),
        ("Kolam Rice", "🌾", "5kg", 720, ["rice"]),
        ("Idli Rice Parboiled", "🌾", "5kg", 780, ["south-indian"]),
    ],
    "dal": [
        ("Toor Dal Premium", "🟡", "1kg", 240, ["dal"]),
        ("Moong Dal Yellow", "🟡", "1kg", 220, ["dal"]),
        ("Moong Dal Whole Green", "🟢", "1kg", 220, ["dal"]),
        ("Masoor Dal Red", "🟠", "1kg", 200, ["dal"]),
        ("Urad Dal Whole", "⚫", "1kg", 280, ["dal"]),
        ("Urad Dal Split", "⚪", "1kg", 270, ["dal"]),
        ("Chana Dal", "🟡", "1kg", 180, ["dal"]),
        ("Rajma Red Kidney Beans", "🔴", "1kg", 260, ["beans"]),
        ("Kabuli Chana (Chickpeas)", "🟤", "1kg", 220, ["chickpea"]),
        ("Black Chana", "⚫", "1kg", 200, ["chickpea"]),
        ("Soya Chunks", "🟤", "200g", 90, ["protein"]),
    ],
    "spices": [
        ("MDH Garam Masala", "🌶️", "100g", 140, ["mdh"]),
        ("MDH Chana Masala", "🌶️", "100g", 130, ["mdh"]),
        ("MDH Kitchen King", "🌶️", "100g", 140, ["mdh"]),
        ("Everest Garam Masala", "🌶️", "100g", 140, ["everest"]),
        ("Everest Sambar Masala", "🌶️", "100g", 130, ["everest"]),
        ("Everest Pav Bhaji Masala", "🌶️", "100g", 140, ["everest"]),
        ("Catch Black Pepper Powder", "⚫", "100g", 220, ["spice"]),
        ("Turmeric Powder Haldi", "🟡", "200g", 110, ["spice"]),
        ("Kashmiri Chilli Powder", "🔴", "100g", 180, ["spice"]),
        ("Coriander Powder Dhania", "🟢", "200g", 100, ["spice"]),
        ("Cumin Seeds Jeera", "🟤", "200g", 220, ["spice"]),
        ("Cardamom Green Elaichi", "🟢", "50g", 380, ["spice"]),
        ("Cinnamon Sticks Dalchini", "🟫", "50g", 140, ["spice"]),
        ("Cloves Laung", "🟤", "50g", 220, ["spice"]),
        ("Saffron Kesar", "🟠", "1g", 480, ["premium"]),
        ("Asafoetida Hing", "🟡", "50g", 220, ["spice"]),
    ],
    "oils_ghee": [
        ("Amul Pure Cow Ghee", "🟡", "500g", 720, ["ghee"]),
        ("Aashirvaad Svasti Cow Ghee", "🟡", "500g", 780, ["ghee"]),
        ("Nanak Buffalo Ghee", "🟡", "500g", 680, ["ghee"]),
        ("Fortune Sunflower Oil", "🌻", "1L", 280, ["oil"]),
        ("Fortune Mustard Oil (Kachi Ghani)", "🟡", "1L", 320, ["oil"]),
        ("Parachute Coconut Oil", "🥥", "500ml", 380, ["oil"]),
        ("Figaro Olive Oil Extra Virgin", "🫒", "500ml", 620, ["oil"]),
        ("Idhayam Sesame Oil (Til)", "🌰", "500ml", 380, ["oil"]),
        ("Dhara Groundnut Oil", "🥜", "1L", 320, ["oil"]),
        ("Fortune Rice Bran Oil", "🌾", "1L", 320, ["oil"]),
    ],
    "pickles": [
        ("Mother's Mango Pickle Spicy", "🥭", "400g", 220, ["pickle"]),
        ("Priya Mango Avakaya", "🥭", "300g", 240, ["andhra"]),
        ("Mother's Lime Sweet Pickle", "🍋", "400g", 220, ["pickle"]),
        ("Mother's Mixed Veg Pickle", "🥒", "400g", 220, ["pickle"]),
        ("Nilon's Garlic Pickle", "🧄", "400g", 240, ["pickle"]),
        ("Priya Gongura Pickle", "🟢", "300g", 260, ["andhra"]),
        ("Mother's Chilli Pickle", "🌶️", "400g", 240, ["pickle"]),
    ],
    "organic": [
        ("Organic Quinoa White", "🌾", "500g", 540, ["organic"]),
        ("Organic Chia Seeds", "⚫", "200g", 320, ["organic"]),
        ("Organic Flax Seeds", "🟤", "200g", 180, ["organic"]),
        ("Organic Jaggery Powder", "🟤", "500g", 220, ["organic"]),
        ("Organic Cold-Pressed Mustard Oil", "🟡", "1L", 480, ["organic"]),
        ("Organic Turmeric Powder", "🟡", "200g", 220, ["organic"]),
        ("Organic Rock Salt (Sendha)", "🌸", "500g", 140, ["organic"]),
        ("Organic Brown Basmati Rice", "🌾", "1kg", 380, ["organic"]),
        ("Organic Honey Raw", "🍯", "500g", 480, ["organic"]),
        ("Organic Green Tea", "🟢", "100g", 360, ["organic"]),
    ],
    "pharma": [
        ("Vicks Vaporub", "🟢", "50g", 220, ["wellness"]),
        ("Zandu Balm", "🟤", "50ml", 180, ["balm"]),
        ("Dabur Chyawanprash", "🟤", "500g", 380, ["ayurveda"]),
        ("Himalaya Liv 52 (100 tabs)", "💊", "100 tabs", 320, ["ayurveda"]),
        ("Patanjali Aloe Vera Juice", "🟢", "1L", 260, ["ayurveda"]),
        ("Baidyanath Triphala Churna", "🟤", "100g", 140, ["ayurveda"]),
        ("Himalaya Ashwagandha Tablets", "💊", "60 tabs", 240, ["ayurveda"]),
        ("Dabur Honey", "🍯", "500g", 320, ["wellness"]),
        ("ORS Electral Powder", "💧", "21.8g", 30, ["wellness"]),
        ("Digene Antacid Gel", "💊", "200ml", 140, ["wellness"]),
    ],
    "puja": [
        ("Cycle Agarbatti (Incense Sticks)", "🕉️", "100 sticks", 180, ["puja"]),
        ("Mysore Sandal Agarbatti", "🕉️", "100 sticks", 220, ["puja"]),
        ("Camphor Tablets (Kapur)", "⚪", "100g", 220, ["puja"]),
        ("Ghee Diya Wicks (Cotton)", "🪔", "100 pcs", 120, ["puja"]),
        ("Havan Samagri Premium", "🔥", "250g", 220, ["puja"]),
        ("Kumkum Sindoor", "🔴", "50g", 90, ["puja"]),
        ("Chandan Powder (Sandalwood)", "🟤", "50g", 220, ["puja"]),
        ("Gau Mutra Ark", "💧", "500ml", 240, ["puja"]),
        ("Panchamrit Kit", "🥣", "100g", 180, ["puja"]),
        ("Roli Kalava Sacred Thread", "🔴", "10 pcs", 90, ["puja"]),
        ("Puja Thali Steel", "🪔", "1 pc", 480, ["puja"]),
        ("Ganga Jal Bottle", "💧", "200ml", 90, ["puja"]),
    ],
    "personal_care": [
        ("Dove Beauty Bar Soap", "🧼", "100g", 90, ["soap"]),
        ("Lifebuoy Total Soap", "🧼", "125g", 80, ["soap"]),
        ("Dettol Original Soap", "🧼", "125g", 90, ["soap"]),
        ("Head & Shoulders Shampoo", "🧴", "340ml", 480, ["shampoo"]),
        ("Pantene Pro-V Shampoo", "🧴", "340ml", 460, ["shampoo"]),
        ("Sunsilk Shampoo", "🧴", "340ml", 380, ["shampoo"]),
        ("Colgate MaxFresh", "🦷", "150g", 180, ["toothpaste"]),
        ("Sensodyne Toothpaste", "🦷", "100g", 220, ["toothpaste"]),
        ("Oral-B Toothbrush", "🪥", "1 pc", 120, ["toothbrush"]),
        ("Gillette Mach3 Razor", "🪒", "1 pc", 380, ["shaving"]),
        ("Nivea Body Lotion", "🧴", "400ml", 480, ["lotion"]),
        ("Vaseline Petroleum Jelly", "🧴", "200ml", 220, ["skincare"]),
        ("Pond's Cold Cream", "🧴", "100g", 180, ["skincare"]),
        ("Dove Deodorant Spray", "🧴", "150ml", 320, ["deodorant"]),
        ("Parachute Coconut Hair Oil", "🥥", "300ml", 260, ["haircare"]),
    ],
}


PRODUCTS_SEED: List[Dict] = []
for slug, items in _TABLE.items():
    for name, emoji, unit, price_lek, tags in items:
        PRODUCTS_SEED.append(
            {
                "id": _pid(slug, name),
                "name": name,
                "description": f"{name} — {unit}. Fresh stock, delivered to your door.",
                "category_slug": slug,
                "price_lek": float(price_lek),
                "price_eur": _eur(price_lek),
                "image_emoji": emoji,
                "image_url": None,
                "unit": unit,
                "in_stock": True,
                "tags": tags,
            }
        )
