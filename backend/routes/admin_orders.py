"""Admin: orders CRUD + dashboard KPIs."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from config import ORDER_STATUSES
from db import db
from models import AdminOrderPatch
from security import require_admin
from services.notifications import notify_order_status
from services.webhooks import emit_event

logger = logging.getLogger("bharat_bazaar")

router = APIRouter(prefix="/admin")


@router.get("/orders")
async def admin_list_orders(
    status: Optional[str] = Query(None, description="Filter by status"),
    q: Optional[str] = Query(None, description="Search by order id or customer phone"),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    _: dict = Depends(require_admin),
):
    query: dict = {}
    if status and status != "all":
        query["status"] = status
    if from_date:
        query.setdefault("placed_at", {})["$gte"] = f"{from_date}T00:00:00+00:00"
    if to_date:
        query.setdefault("placed_at", {})["$lte"] = f"{to_date}T23:59:59+00:00"
    if q:
        rx = {"$regex": q.strip(), "$options": "i"}
        query["$or"] = [{"id": rx}, {"address.phone": rx}, {"address.whatsapp": rx}]
    orders = await db.orders.find(query, {"_id": 0}).sort("placed_at", -1).limit(limit).to_list(limit)
    user_ids = list({o.get("user_id") for o in orders if o.get("user_id")})
    users = {}
    if user_ids:
        cursor = db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "full_name": 1, "phone": 1})
        async for u in cursor:
            users[u["id"]] = u
    for o in orders:
        u = users.get(o.get("user_id")) or {}
        o["customer_name"] = u.get("full_name") or ""
        o["customer_phone"] = u.get("phone") or o.get("address", {}).get("phone") or ""
    return {"orders": orders, "count": len(orders)}


@router.get("/orders/{order_id}")
async def admin_get_order(order_id: str, _: dict = Depends(require_admin)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("user_id"):
        u = await db.users.find_one({"id": order["user_id"]}, {"_id": 0, "full_name": 1, "phone": 1, "email": 1})
        if u:
            order["customer_name"] = u.get("full_name") or ""
            order["customer_phone"] = u.get("phone") or ""
            order["customer_email"] = u.get("email") or ""
    return order


@router.patch("/orders/{order_id}")
async def admin_update_order(order_id: str, payload: AdminOrderPatch, admin: dict = Depends(require_admin)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    updates: dict = {}
    push: dict = {}
    now = datetime.now(timezone.utc).isoformat()
    if payload.status:
        if payload.status not in ORDER_STATUSES:
            raise HTTPException(status_code=400, detail=f"status must be one of {ORDER_STATUSES}")
        updates["status"] = payload.status
        push["status_history"] = {"status": payload.status, "at": now, "by": admin.get("id")}
        if payload.status == "delivered":
            updates["delivered_at"] = now
        if payload.status == "cancelled":
            updates["cancelled_at"] = now
    if payload.delivery_person_name is not None:
        updates["delivery_person_name"] = payload.delivery_person_name
    if payload.delivery_person_phone is not None:
        updates["delivery_person_phone"] = payload.delivery_person_phone
    if payload.admin_note is not None:
        updates["admin_note"] = payload.admin_note
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    updates["updated_at"] = now
    mongo_ops: dict = {"$set": updates}
    if push:
        mongo_ops["$push"] = push
    await db.orders.update_one({"id": order_id}, mongo_ops)
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if updated and updated.get("user_id"):
        u = await db.users.find_one({"id": updated["user_id"]}, {"_id": 0, "full_name": 1, "phone": 1, "email": 1})
        if u:
            updated["customer_name"] = u.get("full_name") or ""
            updated["customer_phone"] = u.get("phone") or ""
            updated["customer_email"] = u.get("email") or ""
    # SMS the customer whenever the order status changes.
    if payload.status and payload.status != order.get("status"):
        prev_status = order.get("status") or "placed"
        try:
            seq = ORDER_STATUSES.index(payload.status) + 1
        except ValueError:
            seq = 0
        # order.status_updated webhook event (best-effort, non-blocking).
        emit_event(
            "order.status_updated",
            {
                "orderId": order_id,
                "previousStatus": prev_status,
                "currentStatus": payload.status,
                "statusReason": payload.admin_note or "Status updated by store",
                "updatedBy": "store",
                "statusSequence": seq,
            },
            actor={"customerId": (updated or {}).get("user_id")},
            correlation_id=f"corr_order_{order_id}",
        )
        # COD is collected on delivery — emit payment.completed at that point.
        if payload.status == "delivered":
            emit_event(
                "payment.completed",
                {
                    "paymentId": f"cod_{order_id}",
                    "orderId": order_id,
                    "paymentProvider": "cod",
                    "paymentMethod": "cod",
                    "amount": float((updated or {}).get("total_lek") or 0.0),
                    "currency": "LEK",
                    "paymentStatus": "captured",
                    "transactionReference": f"cod_{order_id}",
                },
                actor={"customerId": (updated or {}).get("user_id")},
                correlation_id=f"corr_order_{order_id}",
            )
        cust_phone = (updated or {}).get("customer_phone") or (updated or {}).get("address", {}).get("phone") or ""
        cust_name = (updated or {}).get("customer_name") or ""
        try:
            sms = notify_order_status(updated, cust_phone, payload.status, customer_name=cust_name)
            await db.orders.update_one(
                {"id": order_id},
                {"$set": {"notification_status_update": {"status": payload.status, "result": sms, "at": now}}},
            )
        except Exception as exc:
            logger.warning("Status-update SMS failed for %s: %s", order_id, exc)
    return updated


@router.get("/dashboard/summary")
async def admin_dashboard_summary(_: dict = Depends(require_admin)):
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    week_ago = (now - timedelta(days=7)).isoformat()
    today_start = f"{today}T00:00:00+00:00"

    today_orders = await db.orders.count_documents({"placed_at": {"$gte": today_start}})
    pipe = [
        {"$match": {"placed_at": {"$gte": today_start}, "status": {"$ne": "cancelled"}}},
        {"$group": {"_id": None, "sum": {"$sum": "$total_lek"}}},
    ]
    today_revenue = 0.0
    async for doc in db.orders.aggregate(pipe):
        today_revenue = float(doc.get("sum") or 0.0)
    pending_orders = await db.orders.count_documents(
        {"status": {"$in": ["placed", "confirmed", "packed", "out_for_delivery"]}}
    )
    total_orders = await db.orders.count_documents({})
    total_customers = await db.users.count_documents({"is_admin": {"$ne": True}})

    breakdown_cursor = db.orders.aggregate([{"$group": {"_id": "$status", "count": {"$sum": 1}}}])
    status_breakdown = {s: 0 for s in ORDER_STATUSES}
    async for row in breakdown_cursor:
        status_breakdown[row["_id"] or "placed"] = row["count"]

    top_pipe = [
        {"$match": {"placed_at": {"$gte": week_ago}, "status": {"$ne": "cancelled"}}},
        {"$unwind": "$items"},
        {"$group": {
            "_id": "$items.product_id",
            "name": {"$first": "$items.name"},
            "qty": {"$sum": "$items.qty"},
            "revenue": {"$sum": {"$multiply": ["$items.qty", "$items.price_lek"]}},
        }},
        {"$sort": {"qty": -1}},
        {"$limit": 5},
    ]
    top_products = []
    async for row in db.orders.aggregate(top_pipe):
        top_products.append({
            "product_id": row["_id"],
            "name": row.get("name") or "",
            "qty": int(row.get("qty") or 0),
            "revenue_lek": float(row.get("revenue") or 0.0),
        })

    recent_orders = await (
        db.orders.find({}, {"_id": 0, "id": 1, "status": 1, "total_lek": 1, "placed_at": 1, "address": 1})
        .sort("placed_at", -1)
        .limit(5)
        .to_list(5)
    )
    return {
        "today_orders": today_orders,
        "today_revenue_lek": round(today_revenue, 2),
        "pending_orders": pending_orders,
        "total_orders": total_orders,
        "total_customers": total_customers,
        "status_breakdown": status_breakdown,
        "top_products": top_products,
        "recent_orders": recent_orders,
        "order_statuses": ORDER_STATUSES,
    }
