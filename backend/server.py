"""Bharat Bazaar mobile backend — application entry point.

The route logic lives in `routes/` and business logic in `services/`. This
module only builds the FastAPI app, mounts routers + static files, and wires
the startup seed hook.
"""
from __future__ import annotations

from fastapi import APIRouter, FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware

from config import STATIC_DIR
from db import mongo_client
from routes import (
    admin_auth,
    admin_offers,
    admin_orders,
    admin_products,
    admin_settings,
    auth,
    cart,
    catalog,
    geo,
    me,
    offers,
    orders,
)
from services.seed import seed_all

app = FastAPI(title="Bharat Bazaar API")
api = APIRouter(prefix="/api")

# Public / customer routers
api.include_router(catalog.router)
api.include_router(auth.router)
api.include_router(me.router)
api.include_router(cart.router)
api.include_router(orders.router)
api.include_router(geo.router)
api.include_router(offers.router)

# Admin routers
api.include_router(admin_auth.router)
api.include_router(admin_orders.router)
api.include_router(admin_products.router)
api.include_router(admin_offers.router)
api.include_router(admin_settings.router)

app.include_router(api)
app.mount("/api/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup():
    await seed_all()


@app.on_event("shutdown")
async def _shutdown():
    mongo_client.close()
