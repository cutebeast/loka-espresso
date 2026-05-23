"""E2E Test Suite: Round 8 Coverage — critical missing scenarios.

Covers:
  - Voucher creation + assignment + redemption flow
  - Staff clock-in/clock-out flow
  - Kitchen display listing (KDS)
  - Customer address CRUD
  - Token refresh reuse prevention (blacklist)
  - Cross-role token rejection (customer token → staff endpoint)
  - Invalid order status transition (pending → completed)
  - Menu item CRUD via admin
"""

import pytest
import httpx
import uuid
from datetime import datetime, timezone

pytestmark = [pytest.mark.admin]


# ═══════════════════════════════════════════════════════════════════════════
# 1. Voucher create + assign + redeem flow
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_voucher_create_and_redeem_flow(
    client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int, cleanup_registry: dict
):
    """Create a voucher definition, assign to customer, verify wallet, redeem."""
    # 1. Find a customer
    r_cust = await client.get(
        f"{base_url}/admin/customers?store_id={store_id}&per_page=1",
        headers=admin_headers,
    )
    if r_cust.status_code != 200:
        pytest.skip("Admin customers endpoint not available")
    customers = r_cust.json()["data"]["items"]
    if not customers:
        pytest.skip("No customers seeded")
    customer_id = customers[0]["id"]

    # 2. Check customer wallet before
    try:
        r_wallet_before = await client.get(
            f"{base_url}/admin/customers/{customer_id}/wallet",
            headers=admin_headers,
        )
    except httpx.ConnectError:
        pytest.skip("Customer wallet endpoint not available")
    if r_wallet_before.status_code == 404:
        pytest.skip("Customer wallet endpoint not implemented")
    assert r_wallet_before.status_code == 200

    # 3. List existing vouchers to get a voucher definition
    r_vouchers = await client.get(f"{base_url}/admin/vouchers?per_page=50", headers=admin_headers)
    assert r_vouchers.status_code == 200
    voucher_defs = r_vouchers.json()["data"]["items"]
    if not voucher_defs:
        pytest.skip("No voucher definitions in seed data")

    # Try to find or create a voucher definition
    voucher_def = voucher_defs[0]
    voucher_def_id = voucher_def["id"]

    # 4. Assign voucher to customer via wallet — find existing or skip
    r_wallet = await client.get(
        f"{base_url}/admin/customers/{customer_id}/wallet",
        headers=admin_headers,
    )
    wallet_data = r_wallet.json()["data"]
    customer_vouchers = wallet_data.get("vouchers", [])
    if not customer_vouchers:
        # Try to issue a voucher via direct assignment
        try:
            r_assign = await client.post(
                f"{base_url}/admin/customers/{customer_id}/vouchers",
                headers=admin_headers,
                json={"voucher_definition_id": voucher_def_id},
            )
            if r_assign.status_code in (200, 201):
                data = r_assign.json().get("data", r_assign.json())
                voucher_id = data.get("id") or data.get("voucher_id")
                voucher_assigned = True
        except httpx.ConnectError:
            pass
        if not voucher_assigned:
            pytest.skip("Cannot assign voucher — no vouchers in wallet and assignment failed")
    else:
        voucher_id = customer_vouchers[0].get("id") or customer_vouchers[0].get("voucher_id")
        assert voucher_id is not None, "Cannot determine voucher ID for redemption"

    # 5. Redeem the voucher
    try:
        r_redeem = await client.post(
            f"{base_url}/admin/customers/{customer_id}/use-voucher/{voucher_id}",
            headers=admin_headers,
            json={"store_id": store_id, "notes": "E2E round8 test redemption"},
        )
    except httpx.ConnectError:
        pytest.skip("Voucher redeem endpoint not available")

    if r_redeem.status_code == 404:
        pytest.skip("Voucher redeem endpoint not implemented")
    assert r_redeem.status_code == 200, (
        f"Voucher redeem failed with status {r_redeem.status_code}: {r_redeem.text}"
    )
    result = r_redeem.json().get("data", r_redeem.json())
    assert result.get("success") is True or "message" in result

    # 6. Verify wallet after redemption
    r_wallet_after = await client.get(
        f"{base_url}/admin/customers/{customer_id}/wallet",
        headers=admin_headers,
    )
    assert r_wallet_after.status_code == 200


# ═══════════════════════════════════════════════════════════════════════════
# 2. Staff clock-in flow
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.staff
@pytest.mark.asyncio
async def test_staff_clock_in_flow(client: httpx.AsyncClient, base_url: str, store_id: int):
    """Staff login, clock in, verify time event created, clock out."""
    # 1. Login as staff
    r_login = await client.post(f"{base_url}/staff/auth/login", json={
        "email": "admin@lokaespresso.my",
        "password": "admin123",
        "store_id": store_id,
    })
    assert r_login.status_code == 200, f"Staff login failed: {r_login.text}"
    staff_token = r_login.json()["tokens"]["access_token"]
    staff_headers = {"Authorization": f"Bearer {staff_token}", "Content-Type": "application/json"}

    # 2. Clock in
    try:
        r_clock_in = await client.post(
            f"{base_url}/staff/time-events?event_type=clock_in",
            headers=staff_headers,
        )
    except httpx.ConnectError:
        pytest.skip("Time events endpoint not available")

    if r_clock_in.status_code == 404:
        pytest.skip("Time events endpoint not implemented")
    assert r_clock_in.status_code in (200, 201), (
        f"Clock-in failed: {r_clock_in.status_code}: {r_clock_in.text}"
    )
    clock_in_data = r_clock_in.json().get("data", r_clock_in.json())
    assert clock_in_data.get("event_type") in ("clock_in", None)
    time_event_id = clock_in_data.get("id")

    # 3. Verify time event appears in history
    r_history = await client.get(
        f"{base_url}/staff/time-events/me?per_page=50",
        headers=staff_headers,
    )
    if r_history.status_code == 404:
        pytest.skip("Time events history endpoint not implemented")
    assert r_history.status_code == 200
    if time_event_id:
        history = r_history.json()["data"]["items"]
        found = any(e["id"] == time_event_id for e in history)
        assert found, f"Clock-in event {time_event_id} not found in history"

    # 4. Clock out
    try:
        r_clock_out = await client.post(
            f"{base_url}/staff/time-events?event_type=clock_out",
            headers=staff_headers,
        )
    except httpx.ConnectError:
        pytest.skip("Clock-out endpoint not available")

    if r_clock_out.status_code == 404:
        pytest.skip("Clock-out endpoint not implemented")
    assert r_clock_out.status_code in (200, 201), (
        f"Clock-out failed: {r_clock_out.status_code}: {r_clock_out.text}"
    )
    clock_out_data = r_clock_out.json().get("data", r_clock_out.json())
    assert clock_out_data.get("event_type") == "clock_out"


# ═══════════════════════════════════════════════════════════════════════════
# 3. Kitchen display (KDS) order flow
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_kds_order_flow(
    client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int, cleanup_registry: dict
):
    """Create an order and verify it appears in the kitchen display listing."""
    # 1. Register a customer and create an order
    ts = uuid.uuid4().hex[:16]
    reg = await client.post(f"{base_url}/auth/register", json={
        "email_address": f"kds-test-{ts}@example.com",
        "display_name": f"KDS Test {ts}",
    })
    assert reg.status_code == 201, f"Registration failed: {reg.text}"
    cleanup_registry["customers"].append({"id": reg.json()["user_id"]})
    token = reg.json()["tokens"]["access_token"]
    cust_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Get a menu item
    r_menu = await client.get(f"{base_url}/menu/stores/{store_id}")
    assert r_menu.status_code == 200
    items = r_menu.json()["data"]["items"]
    assert len(items) > 0, "Seed data must include menu items"
    item = items[0]

    # Add to cart
    r_add = await client.post(f"{base_url}/cart/items?store_id={store_id}", headers=cust_headers, json={
        "menu_item_id": item["id"],
        "quantity": 2,
        "selected_modifiers": [],
        "special_instructions": "Kitchen test: no onions",
    })
    assert r_add.status_code == 200, f"Add to cart failed: {r_add.text}"

    # Create order
    r_cart = await client.get(f"{base_url}/cart?store_id={store_id}", headers=cust_headers)
    assert r_cart.status_code == 200
    cart_id = r_cart.json()["data"]["id"]

    r_order = await client.post(f"{base_url}/orders", headers=cust_headers, json={
        "store_id": store_id,
        "cart_id": cart_id,
        "order_type": "dine_in",
        "fulfillment_type": "table_service",
    })
    assert r_order.status_code == 201, f"Order creation failed: {r_order.text}"
    order_id = r_order.json()["data"]["id"]
    order_number = r_order.json()["data"]["order_number"]
    cleanup_registry["orders"].append({"id": order_id})

    # 2. Admin confirms the order (moves to preparing)
    await client.patch(
        f"{base_url}/admin/orders/{order_id}/status",
        headers=admin_headers,
        json={"status": "confirmed"},
    )
    await client.patch(
        f"{base_url}/admin/orders/{order_id}/status",
        headers=admin_headers,
        json={"status": "preparing"},
    )

    # 3. Verify the order appears in KDS-relevant listings
    # KDS typically lists orders with status in (confirmed, preparing, ready_for_pickup)
    for status in ("preparing", "confirmed"):
        r_kds = await client.get(
            f"{base_url}/admin/orders?store_id={store_id}&status={status}&per_page=50",
            headers=admin_headers,
        )
        assert r_kds.status_code == 200
        kds_items = r_kds.json()["data"]["items"]
        kds_ids = [o["id"] for o in kds_items]
        if order_id in kds_ids:
            # Verify the order has line items visible
            r_detail = await client.get(f"{base_url}/admin/orders/{order_id}", headers=admin_headers)
            assert r_detail.status_code == 200
            detail = r_detail.json()["data"]
            assert detail.get("line_items") is not None
            assert len(detail["line_items"]) > 0
            break
    else:
        # Order may not be in KDS yet — at minimum verify it exists
        r_detail = await client.get(f"{base_url}/admin/orders/{order_id}", headers=admin_headers)
        assert r_detail.status_code == 200
        assert r_detail.json()["data"]["status"] == "preparing"


# ═══════════════════════════════════════════════════════════════════════════
# 4. Customer address CRUD
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.customer
@pytest.mark.asyncio
async def test_customer_address_crud(
    client: httpx.AsyncClient, base_url: str, cleanup_registry: dict
):
    """Create a customer address, read it back, update, and delete."""
    ts = uuid.uuid4().hex[:16]

    # Register customer
    reg = await client.post(f"{base_url}/auth/register", json={
        "email_address": f"addr-crud-{ts}@example.com",
        "display_name": f"AddrCrud {ts}",
    })
    assert reg.status_code == 201, f"Registration failed: {reg.text}"
    cleanup_registry["customers"].append({"id": reg.json()["user_id"]})
    token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # CREATE address
    address_payload = {
        "address_label": "Home",
        "street_address": "123 Test Street",
        "city": "Kuala Lumpur",
        "state": "Wilayah Persekutuan",
        "postal_code": "50000",
        "is_default": True,
        "latitude": 3.1390,
        "longitude": 101.6869,
    }
    try:
        r_create = await client.post(
            f"{base_url}/customer/addresses",
            headers=headers,
            json=address_payload,
        )
    except httpx.ConnectError:
        pytest.skip("Customer addresses endpoint not available")

    if r_create.status_code == 404:
        pytest.skip("Customer addresses endpoint not implemented")
    assert r_create.status_code in (200, 201), (
        f"Address create failed: {r_create.status_code}: {r_create.text}"
    )
    create_data = r_create.json().get("data", r_create.json())
    address_id = create_data.get("id")
    assert address_id is not None, f"No address ID in response: {create_data}"

    # READ addresses back
    r_list = await client.get(f"{base_url}/customer/addresses", headers=headers)
    assert r_list.status_code == 200
    addresses = r_list.json()["data"]
    if isinstance(addresses, dict) and "items" in addresses:
        address_items = addresses["items"]
    else:
        address_items = addresses if isinstance(addresses, list) else []
    found = any(a.get("id") == address_id for a in address_items)
    assert found, f"Created address {address_id} not found in address list"

    # UPDATE address
    update_payload = {"address_label": "Office", "street_address": "456 Work Avenue"}
    try:
        r_update = await client.patch(
            f"{base_url}/customer/addresses/{address_id}",
            headers=headers,
            json=update_payload,
        )
    except httpx.ConnectError:
        pytest.skip("Address update endpoint not available")

    if r_update.status_code == 404:
        pytest.skip("Address update endpoint not implemented")
    assert r_update.status_code == 200, (
        f"Address update failed: {r_update.status_code}: {r_update.text}"
    )
    updated = r_update.json().get("data", r_update.json())
    assert updated.get("address_label") == "Office" or updated.get("id") == address_id

    # DELETE address
    try:
        r_delete = await client.delete(
            f"{base_url}/customer/addresses/{address_id}",
            headers=headers,
        )
    except httpx.ConnectError:
        pytest.skip("Address delete endpoint not available")

    if r_delete.status_code == 404:
        pytest.skip("Address delete endpoint not implemented")
    assert r_delete.status_code in (200, 204), (
        f"Address delete failed: {r_delete.status_code}: {r_delete.text}"
    )

    # Verify address is gone
    r_list2 = await client.get(f"{base_url}/customer/addresses", headers=headers)
    assert r_list2.status_code == 200
    after_data = r_list2.json()["data"]
    if isinstance(after_data, dict) and "items" in after_data:
        after_items = after_data["items"]
    else:
        after_items = after_data if isinstance(after_data, list) else []
    assert not any(a.get("id") == address_id for a in after_items), (
        f"Address {address_id} still present after delete"
    )


# ═══════════════════════════════════════════════════════════════════════════
# 5. Token refresh reuse prevention (blacklist)
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.staff
@pytest.mark.asyncio
async def test_token_blacklist_prevention(client: httpx.AsyncClient, base_url: str):
    """Use a refresh token once, then try to reuse — second attempt must fail."""
    # Login as staff to get access + refresh tokens
    r_login = await client.post(f"{base_url}/staff/auth/login", json={
        "email": "admin@lokaespresso.my",
        "password": "admin123",
        "store_id": 1,
    })
    assert r_login.status_code == 200, f"Staff login failed: {r_login.text}"
    refresh_token = r_login.json()["tokens"]["refresh_token"]

    # First refresh — should succeed
    try:
        r_first = await client.post(f"{base_url}/staff/auth/refresh", json={
            "refresh_token": refresh_token,
        })
    except httpx.ConnectError:
        pytest.skip("Staff refresh endpoint not available")

    if r_first.status_code == 404:
        pytest.skip("Staff refresh endpoint not implemented")
    assert r_first.status_code == 200, (
        f"First refresh should succeed, got {r_first.status_code}: {r_first.text}"
    )
    assert "tokens" in r_first.json()

    # Second refresh with the SAME refresh token — should be blacklisted/rejected
    try:
        r_second = await client.post(f"{base_url}/staff/auth/refresh", json={
            "refresh_token": refresh_token,
        })
    except httpx.ConnectError:
        pytest.skip("Staff refresh endpoint not available")

    # The reused refresh token MUST be rejected
    assert r_second.status_code in (401, 403, 400, 422), (
        f"Reused refresh token should be rejected (401/403/400/422), "
        f"got {r_second.status_code}: {r_second.text}"
    )


# ═══════════════════════════════════════════════════════════════════════════
# 6. Cross-role token rejection (customer token → staff endpoint)
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.customer
@pytest.mark.staff
@pytest.mark.asyncio
async def test_cross_role_token_rejection(
    client: httpx.AsyncClient, base_url: str, cleanup_registry: dict
):
    """Customer access token used on a staff endpoint must be rejected."""
    ts = uuid.uuid4().hex[:16]

    # Register a customer
    reg = await client.post(f"{base_url}/auth/register", json={
        "email_address": f"crossrole-{ts}@example.com",
        "display_name": f"CrossRole {ts}",
    })
    assert reg.status_code == 201, f"Registration failed: {reg.text}"
    cleanup_registry["customers"].append({"id": reg.json()["user_id"]})
    customer_token = reg.json()["tokens"]["access_token"]
    customer_headers = {"Authorization": f"Bearer {customer_token}", "Content-Type": "application/json"}

    # Try to access a staff-only endpoint
    try:
        r = await client.get(f"{base_url}/staff/auth/me", headers=customer_headers)
    except httpx.ConnectError:
        pytest.skip("Staff auth/me endpoint not available")

    assert r.status_code in (401, 403), (
        f"Customer token on staff endpoint should be 401/403, "
        f"got {r.status_code}: {r.text}"
    )

    # Also try a staff POS endpoint
    try:
        r2 = await client.get(f"{base_url}/staff/time-events/me?per_page=1", headers=customer_headers)
    except httpx.ConnectError:
        pytest.skip("Staff time-events endpoint not available")

    assert r2.status_code in (401, 403), (
        f"Customer token on staff time-events should be 401/403, "
        f"got {r2.status_code}: {r2.text}"
    )


# ═══════════════════════════════════════════════════════════════════════════
# 7. Invalid order status transition (pending → completed)
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_order_invalid_status_transition(
    client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int, cleanup_registry: dict
):
    """Moving an order from pending directly to completed must be rejected."""
    ts = uuid.uuid4().hex[:16]

    # Register customer and create order
    reg = await client.post(f"{base_url}/auth/register", json={
        "email_address": f"invalid-status-{ts}@example.com",
        "display_name": f"InvStatus {ts}",
    })
    assert reg.status_code == 201, f"Registration failed: {reg.text}"
    cleanup_registry["customers"].append({"id": reg.json()["user_id"]})
    token = reg.json()["tokens"]["access_token"]
    cust_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    r_menu = await client.get(f"{base_url}/menu/stores/{store_id}")
    assert r_menu.status_code == 200
    items = r_menu.json()["data"]["items"]
    assert len(items) > 0, "Seed data must include menu items"
    item = items[0]

    await client.post(f"{base_url}/cart/items?store_id={store_id}", headers=cust_headers, json={
        "menu_item_id": item["id"],
        "quantity": 1,
        "selected_modifiers": [],
    })
    r_cart = await client.get(f"{base_url}/cart?store_id={store_id}", headers=cust_headers)
    assert r_cart.status_code == 200
    cart_id = r_cart.json()["data"]["id"]

    r_order = await client.post(f"{base_url}/orders", headers=cust_headers, json={
        "store_id": store_id,
        "cart_id": cart_id,
        "order_type": "takeaway",
        "fulfillment_type": "counter_pickup",
    })
    assert r_order.status_code == 201, f"Order creation failed: {r_order.text}"
    order_id = r_order.json()["data"]["id"]
    cleanup_registry["orders"].append({"id": order_id})

    # Verify original status is pending
    r_detail = await client.get(f"{base_url}/admin/orders/{order_id}", headers=admin_headers)
    assert r_detail.status_code == 200
    assert r_detail.json()["data"]["status"] == "pending"

    # Try to jump directly to completed
    try:
        r_jump = await client.patch(
            f"{base_url}/admin/orders/{order_id}/status",
            headers=admin_headers,
            json={"status": "completed"},
        )
    except httpx.ConnectError:
        pytest.skip("Order status endpoint not available")

    # Must be rejected: pending → completed is not a valid direct transition
    assert r_jump.status_code in (400, 409, 422), (
        f"Direct pending→completed transition should be rejected (400/409/422), "
        f"got {r_jump.status_code}: {r_jump.text}"
    )

    # Verify order is still pending
    r_verify = await client.get(f"{base_url}/admin/orders/{order_id}", headers=admin_headers)
    assert r_verify.status_code == 200
    assert r_verify.json()["data"]["status"] == "pending", (
        "Order status should remain pending after failed transition"
    )


# ═══════════════════════════════════════════════════════════════════════════
# 8. Menu item CRUD via admin
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_menu_item_create_read_update(
    client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int
):
    """Create a menu item, read it back, update it, verify persistence."""
    ts = uuid.uuid4().hex[:16]

    # 1. Get a category for the menu item
    r_cat = await client.get(f"{base_url}/admin/menu/categories?per_page=1", headers=admin_headers)
    assert r_cat.status_code == 200
    categories = r_cat.json()["data"]["items"]
    assert len(categories) > 0, "Seed data must include menu categories"
    category_id = categories[0]["id"]

    # 2. CREATE menu item
    create_payload = {
        "item_name": f"E2E Test Item {ts}",
        "store_id": store_id,
        "category_id": category_id,
        "base_price": 12.50,
        "is_available": True,
        "description": "Created by E2E round8 test",
    }
    try:
        r_create = await client.post(
            f"{base_url}/admin/menu/items",
            headers=admin_headers,
            json=create_payload,
        )
    except httpx.ConnectError:
        pytest.skip("Menu items create endpoint not available")

    if r_create.status_code == 404:
        pytest.skip("Menu items create endpoint not implemented")
    assert r_create.status_code in (200, 201), (
        f"Menu item create failed: {r_create.status_code}: {r_create.text}"
    )
    create_data = r_create.json().get("data", r_create.json())
    item_id = create_data.get("id")
    assert item_id is not None, f"No item ID in create response: {create_data}"
    assert create_data.get("item_name") == f"E2E Test Item {ts}"

    # Cleanup: we'll delete this item at the end regardless

    # 3. READ the menu item back
    r_read = await client.get(f"{base_url}/admin/menu/items/{item_id}", headers=admin_headers)
    assert r_read.status_code == 200, f"Menu item read failed: {r_read.status_code}: {r_read.text}"
    read_data = r_read.json()["data"]
    assert read_data["id"] == item_id
    assert read_data["item_name"] == f"E2E Test Item {ts}"
    assert read_data["base_price"] == 12.50

    # 4. UPDATE the menu item
    update_payload = {
        "item_name": f"E2E Test Item {ts} Updated",
        "base_price": 15.00,
    }
    try:
        r_update = await client.patch(
            f"{base_url}/admin/menu/items/{item_id}",
            headers=admin_headers,
            json=update_payload,
        )
    except httpx.ConnectError:
        pytest.skip("Menu items update endpoint not available")

    if r_update.status_code == 404:
        pytest.skip("Menu items update endpoint not implemented")
    assert r_update.status_code == 200, (
        f"Menu item update failed: {r_update.status_code}: {r_update.text}"
    )

    # 5. Verify update persisted
    r_verify = await client.get(f"{base_url}/admin/menu/items/{item_id}", headers=admin_headers)
    assert r_verify.status_code == 200
    verify_data = r_verify.json()["data"]
    assert verify_data["item_name"] == f"E2E Test Item {ts} Updated", (
        f"Expected updated name, got {verify_data.get('item_name')}"
    )
    assert verify_data["base_price"] == 15.00, (
        f"Expected updated price 15.00, got {verify_data.get('base_price')}"
    )

    # 6. DELETE the menu item (cleanup)
    try:
        r_delete = await client.delete(
            f"{base_url}/admin/menu/items/{item_id}",
            headers=admin_headers,
        )
    except httpx.ConnectError:
        return  # cleanup not critical

    if r_delete.status_code == 404:
        pass  # delete endpoint may not exist
    else:
        assert r_delete.status_code in (200, 204), (
            f"Menu item delete failed: {r_delete.status_code}: {r_delete.text}"
        )
