"""Staff-facing operational endpoints (POS, dashboard, clock-in, PIN verify)."""

import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.v1.deps import CurrentAdmin, DBDependency
from app.models.customer import Customer
from app.models.iam import RolePermission
from app.models.inventory import InventoryItem
from app.models.menu import MenuItem, MenuModifierGroup, MenuModifierOption
from app.models.order import Order, OrderLineItem
from app.models.payment import Payment
from app.models.staff import StaffProfile, StaffTimeEvent, TipAllocation
from app.models.store import Store, DiningTable, StoreConfiguration, TableStatusSnapshot
from app.schemas.base import APIResponse, PaginatedResponse

router = APIRouter(tags=["staff — operations"])


# ── Helper ──


# ── Staff Auth (login, verify) ──

@router.get("/staff/auth/names")
async def staff_name_list(db: DBDependency):
    """List staff display names for the login dropdown."""
    result = await db.execute(
        select(StaffProfile.id, StaffProfile.display_name, Store.store_name)
        .join(Store, StaffProfile.store_id == Store.id)
        .where(StaffProfile.deleted_at.is_(None), StaffProfile.is_active.is_(True))
        .order_by(StaffProfile.display_name)
    )
    items = [{"id": r[0], "display_name": r[1], "store_name": r[2]} for r in result.all()]
    return APIResponse(data=items)


@router.post("/staff/auth/login")
async def staff_login(db: DBDependency, data: dict):
    """Staff portal login using email + password from staff_profiles."""
    email = (data.get("email") or "").strip()
    password = (data.get("password") or "").strip()
    if not email or not password:
        raise HTTPException(status_code=422, detail="Email and password required")

    # Support login by staff ID (from name dropdown) + PIN
    result = None
    if email.isdigit():
        # Login by staff ID + PIN
        result = await db.execute(
            select(StaffProfile).where(
                StaffProfile.id == int(email),
                StaffProfile.deleted_at.is_(None),
                StaffProfile.is_active.is_(True),
            )
        )
        staff = result.scalar_one_or_none()
        if not staff or not staff.pin_hash:
            raise HTTPException(status_code=401, detail="Invalid PIN")
        import bcrypt
        try:
            ok = bcrypt.checkpw(password.encode(), staff.pin_hash.encode() if isinstance(staff.pin_hash, str) else staff.pin_hash)
        except Exception:
            ok = False
        if not ok:
            raise HTTPException(status_code=401, detail="Invalid PIN")
    else:
        # Login by email + password
        result = await db.execute(
            select(StaffProfile).where(
                StaffProfile.email_address == email,
                StaffProfile.deleted_at.is_(None),
                StaffProfile.is_active.is_(True),
            )
        )
        staff = result.scalar_one_or_none()
        if not staff or not staff.password_hash:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        import bcrypt
        try:
            ok = bcrypt.checkpw(password.encode(), staff.password_hash.encode() if isinstance(staff.password_hash, str) else staff.password_hash)
        except Exception:
            ok = False
        if not ok:
            raise HTTPException(status_code=401, detail="Invalid credentials")

    from datetime import timedelta
    import jwt, os
    secret = os.environ.get("JWT_SECRET", "fnb-super-app-dev-secret")
    payload = {"sub": str(staff.principal_id), "type": "staff", "staff_id": staff.id, "store_id": staff.store_id, "exp": datetime.now(timezone.utc) + timedelta(hours=8)}
    access_token = jwt.encode(payload, secret, algorithm="HS256")
    return {"tokens": {"access_token": access_token}, "profile": {"email": staff.email_address, "display_name": staff.display_name, "store_id": staff.store_id, "staff_id": staff.id}}


# ── Helper ──

async def _get_staff_profile(db, admin) -> StaffProfile:
    result = await db.execute(
        select(StaffProfile).where(StaffProfile.principal_id == admin.principal_id, StaffProfile.deleted_at.is_(None))
    )
    staff = result.scalar_one_or_none()
    if not staff:
        raise HTTPException(status_code=403, detail="No staff profile found")
    if not staff.is_active:
        raise HTTPException(status_code=403, detail="Staff account is inactive")
    return staff


# ── Dashboard ──

@router.get("/staff/dashboard")
async def staff_dashboard(db: DBDependency, admin: CurrentAdmin):
    staff = await _get_staff_profile(db, admin)
    store_id = staff.store_id

    pending = (await db.execute(
        select(func.count(Order.id)).where(
            Order.store_id == store_id,
            Order.status.in_(["pending", "confirmed", "preparing"]),
            Order.deleted_at.is_(None),
        )
    )).scalar() or 0

    occupied = (await db.execute(
        select(func.count(TableStatusSnapshot.table_id)).where(
            TableStatusSnapshot.store_id == store_id,
            TableStatusSnapshot.status.in_(["occupied", "reserved"]),
        )
    )).scalar() or 0

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_resv = (await db.execute(
        select(func.count(DiningTable.id)).where(
            DiningTable.store_id == store_id,
            DiningTable.deleted_at.is_(None),
        )
    )).scalar() or 0

    # Check clock status
    clock = await db.execute(
        select(StaffTimeEvent).where(
            StaffTimeEvent.staff_id == staff.id,
        ).order_by(StaffTimeEvent.id.desc()).limit(1)
    )
    last_event = clock.scalar_one_or_none()
    clock_status = "out"
    shift_start = None
    if last_event:
        if last_event.event_type == "clock_in":
            clock_status = "in"
            shift_start = last_event.created_at
        elif last_event.event_type == "start_break":
            clock_status = "break"
            shift_start = last_event.created_at

    return APIResponse(data={
        "pending_orders": pending,
        "occupied_tables": occupied,
        "today_reservations": 0,
        "clock_status": clock_status,
        "current_shift_start": shift_start.isoformat() if shift_start else None,
        "store_name": staff.store.store_name if staff.store else "",
        "staff_name": staff.display_name,
        "store_id": store_id,
    })


# ── Customer Search ──

@router.get("/staff/customers/search")
async def staff_customer_search(db: DBDependency, admin: CurrentAdmin, q: str = Query(..., min_length=1)):
    await _get_staff_profile(db, admin)

    q_clean = q.strip()
    result = await db.execute(
        select(Customer).where(
            Customer.deleted_at.is_(None),
            (Customer.phone_number.ilike(f"%{q_clean}%")) |
            (Customer.display_name.ilike(f"%{q_clean}%")) |
            (Customer.id == int(q_clean) if q_clean.isdigit() else False)
        ).limit(20)
    )
    items = []
    for c in result.scalars().all():
        items.append({
            "id": c.id, "display_name": c.display_name or f"Customer #{c.id}",
            "phone_number": c.phone_number or "",
            "loyalty_tier": "Standard",
        })
    return APIResponse(data={"items": items})


# ── PIN Verify ──

@router.post("/staff/auth/verify-pin")
async def staff_verify_pin(db: DBDependency, admin: CurrentAdmin, data: dict):
    staff = await _get_staff_profile(db, admin)

    pin = str(data.get("pin", "")).strip()
    if not pin or len(pin) < 4:
        raise HTTPException(status_code=400, detail="PIN must be at least 4 digits")

    import bcrypt
    if not staff.pin_hash:
        return APIResponse(data={"valid": False, "message": "No PIN set"})

    try:
        valid = bcrypt.checkpw(pin.encode(), staff.pin_hash.encode() if isinstance(staff.pin_hash, str) else staff.pin_hash)
    except Exception:
        valid = False

    if not valid:
        return APIResponse(data={"valid": False, "message": "Invalid PIN"})

    return APIResponse(data={"valid": True, "message": "PIN verified"})


# ── Staff Auth (portal access check) ──

@router.get("/staff/auth/me")
async def staff_auth_me(db: DBDependency, admin: CurrentAdmin):
    """Check if the current user has staff portal access (permission 26)."""
    from app.models.iam import RoleAssignment
    # Get admin's role IDs
    role_result = await db.execute(
        select(RoleAssignment.role_id).where(RoleAssignment.assignee_id == admin.id)
    )
    admin_role_ids = {r[0] for r in role_result.all()}
    if not admin_role_ids:
        raise HTTPException(status_code=403, detail="No roles assigned")
    # Check if any role has staff_portal access (permission 26)
    perm_result = await db.execute(
        select(RolePermission.role_id).where(
            RolePermission.role_id.in_(admin_role_ids),
            RolePermission.permission_id == 26,
        )
    )
    if not perm_result.first():
        raise HTTPException(status_code=403, detail="No staff portal access")

    staff = await _get_staff_profile(db, admin)
    return APIResponse(data={
        "staff_id": staff.id,
        "display_name": staff.display_name,
        "store_id": staff.store_id,
        "has_staff_access": True,
    })


# ── POS Order Create ──

@router.post("/staff/pos/orders", status_code=status.HTTP_201_CREATED)
async def staff_pos_create_order(db: DBDependency, admin: CurrentAdmin, data: dict):
    staff = await _get_staff_profile(db, admin)
    store_id = data.get("store_id", staff.store_id)

    # Validate store
    store_r = await db.execute(select(Store).where(Store.id == store_id, Store.deleted_at.is_(None)))
    store = store_r.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    customer_id = data.get("customer_id")
    dining_table_id = data.get("dining_table_id")
    order_type = data.get("order_type", "dine_in")
    line_items_data = data.get("line_items", [])
    payment_data = data.get("payment", {})

    if not line_items_data:
        raise HTTPException(status_code=400, detail="At least one line item required")

    # Resolve prices and build line items
    subtotal = 0.0
    line_items = []

    for li in line_items_data:
        menu_item_id = li.get("menu_item_id")
        qty = max(1, int(li.get("quantity", 1)))
        special = li.get("special_instructions", "")

        item_r = await db.execute(select(MenuItem).where(MenuItem.id == menu_item_id, MenuItem.deleted_at.is_(None)))
        menu_item = item_r.scalar_one_or_none()
        if not menu_item:
            raise HTTPException(status_code=400, detail=f"Menu item {menu_item_id} not found")
        if not menu_item.is_available:
            raise HTTPException(status_code=400, detail=f"{menu_item.item_name} is currently unavailable")

        unit_price = float(menu_item.price or 0)
        modifier_total = 0.0

        modifier_ids = li.get("modifier_ids", [])
        if modifier_ids:
            mod_r = await db.execute(
                select(MenuModifierOption).where(MenuModifierOption.id.in_(modifier_ids))
            )
            for mod in mod_r.scalars().all():
                modifier_total += float(mod.price_adjustment or 0)
            unit_price += modifier_total

        total_price = round(unit_price * qty, 2)
        subtotal += total_price

        line_items.append(OrderLineItem(
            menu_item_id=menu_item_id,
            item_name=menu_item.item_name,
            quantity=qty,
            unit_price=unit_price,
            total_price=total_price,
            modifier_total=modifier_total,
            special_instructions=special,
        ))

    # Compute fees from store config
    config_r = await db.execute(
        select(StoreConfiguration).where(
            StoreConfiguration.store_id == store_id,
            StoreConfiguration.config_key.in_(["order.service_charge", "order.tax_rate"]),
        )
    )
    config_map = {c.config_key: c.config_value for c in config_r.scalars().all()}
    service_charge = float(config_map.get("order.service_charge", 0) or 0)
    tax_rate = float(config_map.get("order.tax_rate", 0) or 0)
    tax_amount = round(subtotal * tax_rate, 2)
    total = round(subtotal + service_charge + tax_amount, 2)

    # Generate order number
    from uuid import uuid4
    order_number = f"POS-{datetime.now(timezone.utc).strftime('%m%d')}-{uuid4().hex[:4].upper()}"

    order = Order(
        customer_id=customer_id,
        store_id=store_id,
        dining_table_id=dining_table_id,
        order_number=order_number,
        order_type=order_type,
        order_channel="pos_counter",
        fulfillment_type="dine_in",
        status="confirmed",
        payment_status="paid" if payment_data else "initiated",
        item_count=len(line_items),
        items_subtotal=round(subtotal, 2),
        service_charge=service_charge,
        tax_amount=tax_amount,
        total_amount=total,
        total_amount_currency=store.currency_code or "MYR",
    )
    db.add(order)
    await db.flush()

    for li in line_items:
        li.order_id = order.id
        db.add(li)

    # Create payment
    change = 0.0
    if payment_data:
        amount_tendered = float(payment_data.get("amount_tendered", 0) or 0)
        change = round(max(0, amount_tendered - total), 2)
        payment = Payment(
            order_id=order.id,
            provider="internal",
            payment_method_type=payment_data.get("method", "cash"),
            amount=total,
            currency_code=store.currency_code or "MYR",
            status="completed",
            net_amount=total,
        )
        db.add(payment)

    # Update table status if dine-in
    if dining_table_id and order_type == "dine_in":
        existing = await db.execute(
            select(TableStatusSnapshot).where(TableStatusSnapshot.table_id == dining_table_id)
        )
        snap = existing.scalar_one_or_none()
        if snap:
            snap.status = "occupied"
            snap.current_order_id = order.id

    await db.commit()
    await db.refresh(order)

    return APIResponse(data={
        "order_id": order.id,
        "order_number": order.order_number,
        "status": order.status,
        "total": total,
        "change": change,
        "created_at": order.created_at.isoformat(),
    })
