"""Async MongoDB client and database handle shared by all routes/services."""
from motor.motor_asyncio import AsyncIOMotorClient

from config import DB_NAME, MONGO_URL

mongo_client = AsyncIOMotorClient(MONGO_URL)
db = mongo_client[DB_NAME]
