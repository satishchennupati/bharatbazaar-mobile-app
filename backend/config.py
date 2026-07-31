"""Runtime configuration (env vars, paths, constants) for Bharat Bazaar backend."""
from __future__ import annotations

import logging
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("bharat_bazaar")

# ---- Mongo ----
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

# ---- Twilio ----
TWILIO_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM = os.environ.get("TWILIO_FROM_NUMBER", "")
TWILIO_MSID = os.environ.get("TWILIO_MESSAGING_SERVICE_SID", "")

OTP_LENGTH = int(os.environ.get("OTP_LENGTH", "6"))
OTP_EXPIRY_MINUTES = int(os.environ.get("OTP_EXPIRY_MINUTES", "10"))

# ---- Admin / Google ----
ADMIN_SECRET = os.environ.get("ADMIN_SECRET", "")
GOOGLE_DRIVE_API_KEY = os.environ.get("GOOGLE_DRIVE_API_KEY", "")
GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")

# ---- JWT ----
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = os.environ.get("JWT_ALGORITHM", "HS256")
JWT_EXP_HOURS = int(os.environ.get("JWT_EXP_HOURS", "720"))

# ---- Paths ----
STATIC_DIR = ROOT_DIR / "static"
PRODUCT_IMG_DIR = STATIC_DIR / "products"
OFFER_IMG_DIR = STATIC_DIR / "offers"
PRODUCT_IMG_DIR.mkdir(parents=True, exist_ok=True)
OFFER_IMG_DIR.mkdir(parents=True, exist_ok=True)

# ---- Business constants ----
LEK_PER_EUR = 100.0
SERVICEABLE_COUNTRY_CODES = {"AL"}
ORDER_STATUSES = ["placed", "confirmed", "packed", "out_for_delivery", "delivered", "cancelled"]
FREE_DELIVERY_MIN_LEK = 1500.0
DELIVERY_FEE_LEK = 99.0
