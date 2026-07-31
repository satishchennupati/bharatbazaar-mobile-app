"""Admin auth: /admin/auth/login, /admin/verify."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from db import db
from models import AuthOut, LoginIn
from security import check_pw, make_token, require_admin

router = APIRouter(prefix="/admin")


@router.post("/auth/login", response_model=AuthOut)
async def admin_login(payload: LoginIn):
    phone = payload.phone.strip()
    user = await db.users.find_one({"phone": phone})
    if not user or not check_pw(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid phone or password")
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="This account is not an admin")
    token = make_token(user["id"])
    user.pop("_id", None)
    user.pop("password_hash", None)
    return {"token": token, "user": user}


@router.get("/verify")
async def admin_verify(user: dict = Depends(require_admin)):
    return {"ok": True, "user": user}
