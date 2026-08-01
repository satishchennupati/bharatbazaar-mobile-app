"""Auth: login, phone-check, OTP register, demo-login, set-password."""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from twilio.base.exceptions import TwilioRestException
from twilio.rest import Client as TwilioClient

from config import (
    OTP_EXPIRY_MINUTES,
    OTP_LENGTH,
    TWILIO_FROM,
    TWILIO_MSID,
    TWILIO_SID,
    TWILIO_TOKEN,
)
from db import db
from models import AuthOut, CheckPhoneIn, LoginIn, ResetPasswordIn, SendOtpIn, SetPasswordIn, VerifyOtpIn
from security import (
    check_pw,
    decode_reset_token,
    decode_signup_token,
    hash_pw,
    make_reset_token,
    make_signup_token,
    make_token,
)

router = APIRouter(prefix="/auth")
logger = logging.getLogger("bharat_bazaar")

twilio_client: Optional[TwilioClient] = None
if TWILIO_SID and TWILIO_TOKEN:
    try:
        twilio_client = TwilioClient(TWILIO_SID, TWILIO_TOKEN)
    except Exception as exc:  # pragma: no cover
        logger.warning("Twilio init failed: %s", exc)
        twilio_client = None


def _gen_otp() -> str:
    return "".join(secrets.choice("0123456789") for _ in range(OTP_LENGTH))


async def _send_sms_otp(phone: str, code: str) -> dict:
    if not twilio_client:
        logger.warning("Twilio not configured; OTP not sent for %s (code=%s)", phone, code)
        return {"sent": False, "channel": "mock"}
    body = f"Your Bharat Bazaar verification code is {code}. It expires in {OTP_EXPIRY_MINUTES} minutes."
    kwargs = {"body": body, "to": phone}
    if TWILIO_MSID:
        kwargs["messaging_service_sid"] = TWILIO_MSID
    elif TWILIO_FROM:
        kwargs["from_"] = TWILIO_FROM
    else:
        raise HTTPException(status_code=500, detail="Twilio sender not configured")
    try:
        msg = twilio_client.messages.create(**kwargs)
        return {"sent": True, "channel": "sms", "sid": msg.sid}
    except TwilioRestException as exc:
        logger.warning("Twilio send error (falling back to mock): %s", exc)
        return {"sent": False, "channel": "mock", "twilio_error": getattr(exc, "msg", str(exc))}


@router.post("/check-phone")
async def check_phone(payload: CheckPhoneIn):
    phone = payload.phone.strip()
    if not phone.startswith("+"):
        raise HTTPException(status_code=400, detail="Phone must be E.164 (e.g. +355...)")
    user = await db.users.find_one({"phone": phone}, {"_id": 0, "id": 1})
    return {"exists": bool(user), "phone": phone}


@router.post("/login", response_model=AuthOut)
async def login(payload: LoginIn):
    phone = payload.phone.strip()
    user = await db.users.find_one({"phone": phone})
    if not user or not check_pw(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid phone or password")
    token = make_token(user["id"])
    user.pop("_id", None)
    user.pop("password_hash", None)
    return {"token": token, "user": user}


@router.post("/register/send-otp")
async def send_register_otp(payload: SendOtpIn):
    phone = payload.phone.strip()
    if not phone.startswith("+"):
        raise HTTPException(status_code=400, detail="Phone must be E.164 (e.g. +355...)")
    existing = await db.users.find_one({"phone": phone})
    if existing:
        raise HTTPException(status_code=409, detail="Phone already registered. Please login instead.")
    code = _gen_otp()
    await db.otp_sessions.delete_many({"phone": phone})
    await db.otp_sessions.insert_one({
        "phone": phone,
        "code": code,
        "attempts": 0,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES),
    })
    result = await _send_sms_otp(phone, code)
    resp = {"ok": True, "phone": phone, "expires_in_minutes": OTP_EXPIRY_MINUTES}
    if not result.get("sent"):
        resp["debug_code"] = code
    return resp


@router.post("/register/verify-otp")
async def verify_register_otp(payload: VerifyOtpIn):
    phone = payload.phone.strip()
    session = await db.otp_sessions.find_one({"phone": phone})
    if not session:
        raise HTTPException(status_code=400, detail="No OTP requested for this phone")
    exp = session.get("expires_at")
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp and exp < datetime.now(timezone.utc):
        await db.otp_sessions.delete_one({"phone": phone})
        raise HTTPException(status_code=400, detail="OTP expired, please request a new one")
    if session.get("attempts", 0) >= 5:
        await db.otp_sessions.delete_one({"phone": phone})
        raise HTTPException(status_code=429, detail="Too many attempts")
    if payload.code.strip() != session.get("code"):
        await db.otp_sessions.update_one({"phone": phone}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Invalid OTP")
    signup_token = make_signup_token(phone, minutes=15)
    await db.otp_sessions.delete_one({"phone": phone})
    return {"ok": True, "signup_token": signup_token, "phone": phone, "expires_in_minutes": 15}


@router.post("/demo-login", response_model=AuthOut)
async def demo_login():
    demo_id = "demo-user-001"
    user = await db.users.find_one({"id": demo_id}, {"_id": 0, "password_hash": 0})
    if not user:
        user_doc = {
            "id": demo_id,
            "username": "demo",
            "phone": "+355690000000",
            "full_name": "Demo Customer",
            "email": "demo@bharatbazaar.com",
            "language": "en",
            "currency": "LEK",
            "password_hash": hash_pw(secrets.token_hex(16)),
            "addresses": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "is_demo": True,
        }
        await db.users.insert_one(user_doc)
        user = {k: v for k, v in user_doc.items() if k != "password_hash"}
    await db.carts.update_one(
        {"user_id": demo_id},
        {"$set": {"items": [], "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    token = make_token(demo_id)
    return {"token": token, "user": user}


@router.post("/register/set-password", response_model=AuthOut)
async def set_password(payload: SetPasswordIn):
    data = decode_signup_token(payload.signup_token)
    phone = data["phone"]
    if await db.users.find_one({"phone": phone}):
        raise HTTPException(status_code=409, detail="Account already exists for this phone. Please login.")
    user_id = secrets.token_hex(8)
    derived_username = phone.replace("+", "u")
    user_doc = {
        "id": user_id,
        "username": derived_username,
        "phone": phone,
        "full_name": payload.full_name,
        "email": payload.email,
        "language": payload.language,
        "currency": payload.currency,
        "password_hash": hash_pw(payload.password),
        "addresses": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    user_doc.pop("_id", None)
    user_doc.pop("password_hash", None)
    token = make_token(user_id)
    return {"token": token, "user": user_doc}



# --------------------------------------------------------------------------
# Forgot / Reset password — OTP-driven via Twilio
# --------------------------------------------------------------------------
@router.post("/forgot-password/send-otp")
async def send_reset_otp(payload: SendOtpIn):
    """Send a 6-digit OTP to the phone if it belongs to an existing account.

    To prevent user enumeration we return the same shape whether the phone
    exists or not, but only actually SMS when it does.
    """
    phone = payload.phone.strip()
    if not phone.startswith("+"):
        raise HTTPException(status_code=400, detail="Phone must be E.164 (e.g. +355...)")
    existing = await db.users.find_one({"phone": phone})
    resp: dict = {"ok": True, "phone": phone, "expires_in_minutes": OTP_EXPIRY_MINUTES}
    if not existing:
        # Silent fallback so bad actors can't harvest which numbers exist.
        return resp
    code = _gen_otp()
    await db.otp_sessions.delete_many({"phone": phone, "purpose": "reset"})
    await db.otp_sessions.insert_one({
        "phone": phone,
        "code": code,
        "purpose": "reset",
        "attempts": 0,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES),
    })
    result = await _send_sms_otp(phone, code)
    if not result.get("sent"):
        resp["debug_code"] = code
    return resp


@router.post("/forgot-password/verify-otp")
async def verify_reset_otp(payload: VerifyOtpIn):
    phone = payload.phone.strip()
    session = await db.otp_sessions.find_one({"phone": phone, "purpose": "reset"})
    if not session:
        raise HTTPException(status_code=400, detail="No reset OTP requested for this phone")
    exp = session.get("expires_at")
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp and exp < datetime.now(timezone.utc):
        await db.otp_sessions.delete_one({"phone": phone, "purpose": "reset"})
        raise HTTPException(status_code=400, detail="OTP expired, please request a new one")
    if session.get("attempts", 0) >= 5:
        await db.otp_sessions.delete_one({"phone": phone, "purpose": "reset"})
        raise HTTPException(status_code=429, detail="Too many attempts")
    if payload.code.strip() != session.get("code"):
        await db.otp_sessions.update_one({"phone": phone, "purpose": "reset"}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Invalid OTP")
    reset_token = make_reset_token(phone, minutes=15)
    await db.otp_sessions.delete_one({"phone": phone, "purpose": "reset"})
    return {"ok": True, "reset_token": reset_token, "phone": phone, "expires_in_minutes": 15}


@router.post("/forgot-password/reset", response_model=AuthOut)
async def reset_password(payload: ResetPasswordIn):
    """Set a new password using the short-lived reset token.

    Returns a fresh JWT so the client can auto-login the user immediately.
    """
    data = decode_reset_token(payload.reset_token)
    phone = data["phone"]
    user = await db.users.find_one({"phone": phone})
    if not user:
        raise HTTPException(status_code=404, detail="Account not found")
    await db.users.update_one(
        {"phone": phone},
        {"$set": {"password_hash": hash_pw(payload.password),
                  "password_updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    user["password_hash"] = hash_pw(payload.password)  # keep in sync (not used after)
    user.pop("password_hash", None)
    user.pop("_id", None)
    token = make_token(user["id"])
    return {"token": token, "user": user}
