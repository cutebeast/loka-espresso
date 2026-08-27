"""Profit & margin (COGS) report computation.

Read-only reporting over paid orders + menu item recipes. Never mutates
orders or stock.

Definitions (aligned with admin dashboard revenue):
- Paid population: orders with at least one payment in
  captured/partially_refunded/refunded (same net-revenue subquery the
  dashboard uses).
- Revenue: Σ OrderLineItem.line_total for paid orders in scope.
- Estimated COGS per unit: Σ recipe (quantity_required × (1 + waste_factor))
  × ingredient unit cost. Ingredient cost = weighted-average
  unit_cost_at_movement from that store's order-deduction movements in the
  period when available (and > 0), else InventoryItem.unit_cost when > 0.
- Untracked: a line whose menu item has no recipe rows, or whose recipe has a
  component with no positive known cost (e.g. auto 1:1 LNK- links are seeded
  with unit_cost 0 — treating them as cost 0 would fabricate a 100% margin,
  so the revenue is reported in a separate untracked bucket instead).
"""

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.business_time import BUSINESS_TZ
from app.models.inventory import InventoryItem, InventoryMovementLog
from app.models.menu import MenuItem, MenuItemRecipe
from app.models.order import Order, OrderLineItem
from app.models.payment import Payment

# Same "paid" payment statuses as admin dashboard revenue.
PAID_PAYMENT_STATUSES = ("captured", "partially_refunded", "refunded")


def _d(value: Any) -> Decimal:
    return Decimal(str(value or 0))


async def compute_margin_report(
    db: AsyncSession,
    store_id: int | None,
    dfrom: datetime,
    dto: datetime,
) -> dict:
    """Compute per-item revenue / COGS / margin for paid orders in scope."""
    net_rev = (
        select(
            Payment.order_id.label("order_id"),
            func.sum(Payment.captured_amount - Payment.refunded_amount).label("net"),
        )
        .where(Payment.status.in_(PAID_PAYMENT_STATUSES))
        .group_by(Payment.order_id)
        .subquery()
    )
    # Business-day bucket (Asia/Kuala_Lumpur) for the daily breakdown.
    day_col = func.date(func.timezone(BUSINESS_TZ.key, Order.created_at))

    # 1. Sold-line aggregates for paid orders, per item / variant / day.
    line_stmt = (
        select(
            OrderLineItem.menu_item_id,
            OrderLineItem.menu_variant_id,
            MenuItem.item_name,
            day_col.label("day"),
            func.sum(OrderLineItem.quantity).label("qty"),
            func.sum(OrderLineItem.line_total).label("revenue"),
        )
        .select_from(OrderLineItem)
        .join(Order, Order.id == OrderLineItem.order_id)
        .join(net_rev, net_rev.c.order_id == Order.id)
        .join(MenuItem, MenuItem.id == OrderLineItem.menu_item_id)
        .where(
            Order.deleted_at.is_(None),
            Order.created_at >= dfrom,
            Order.created_at <= dto,
        )
        .group_by(
            OrderLineItem.menu_item_id,
            OrderLineItem.menu_variant_id,
            MenuItem.item_name,
            day_col,
        )
    )
    if store_id:
        line_stmt = line_stmt.where(Order.store_id == store_id)

    line_rows = (await db.execute(line_stmt)).all()
    if not line_rows:
        return {
            "rows": [],
            "untracked": {"quantity": Decimal(0), "revenue": Decimal(0), "items": 0},
            "totals": {
                "quantity": Decimal(0),
                "revenue": Decimal(0),
                "tracked_revenue": Decimal(0),
                "untracked_revenue": Decimal(0),
                "cogs": Decimal(0),
                "margin": Decimal(0),
                "margin_pct": None,
            },
            "daily": [],
        }

    menu_item_ids = {row.menu_item_id for row in line_rows}
    variant_ids = {row.menu_variant_id for row in line_rows if row.menu_variant_id is not None}

    # 2. Recipes for the sold items (variant-specific + generic rows).
    recipe_stmt = select(MenuItemRecipe).where(
        MenuItemRecipe.menu_item_id.in_(menu_item_ids),
        (
            MenuItemRecipe.menu_variant_id.in_(variant_ids)
            | MenuItemRecipe.menu_variant_id.is_(None)
        ),
    )
    recipes = (await db.execute(recipe_stmt)).scalars().all()

    recipe_map: dict[tuple[int, int | None], list[MenuItemRecipe]] = {}
    for rc in recipes:
        recipe_map.setdefault((rc.menu_item_id, rc.menu_variant_id), []).append(rc)

    inv_ids = {rc.inventory_item_id for rc in recipes}

    # 3. Ingredient unit cost: weighted average unit_cost_at_movement from
    # order-deduction movements in scope, falling back to the item master.
    movement_cost: dict[int, Decimal] = {}
    if inv_ids:
        mov_stmt = (
            select(
                InventoryMovementLog.inventory_item_id,
                func.sum(InventoryMovementLog.movement_cost).label("cost"),
                func.sum(-InventoryMovementLog.quantity_delta).label("qty"),
            )
            .where(
                InventoryMovementLog.reference_type == "order",
                InventoryMovementLog.movement_type == "out",
                InventoryMovementLog.inventory_item_id.in_(inv_ids),
                InventoryMovementLog.unit_cost_at_movement.isnot(None),
                InventoryMovementLog.unit_cost_at_movement > 0,
                InventoryMovementLog.created_at >= dfrom,
                InventoryMovementLog.created_at <= dto,
            )
            .group_by(InventoryMovementLog.inventory_item_id)
        )
        if store_id:
            mov_stmt = mov_stmt.where(InventoryMovementLog.store_id == store_id)
        for row in (await db.execute(mov_stmt)).all():
            qty = _d(row.qty)
            if qty > 0:
                movement_cost[row.inventory_item_id] = _d(row.cost) / qty

    master_cost: dict[int, Decimal] = {}
    if inv_ids:
        inv_stmt = select(InventoryItem.id, InventoryItem.unit_cost).where(
            InventoryItem.id.in_(inv_ids)
        )
        for inv_id, unit_cost in (await db.execute(inv_stmt)).all():
            if unit_cost is not None:
                master_cost[inv_id] = _d(unit_cost)

    def ingredient_cost(inv_id: int) -> Decimal | None:
        """Positive known unit cost, else None (never guess 0)."""
        cost = movement_cost.get(inv_id)
        if cost is None or cost <= 0:
            cost = master_cost.get(inv_id)
        if cost is None or cost <= 0:
            return None
        return cost

    def unit_cogs(menu_item_id: int, variant_id: int | None) -> Decimal | None:
        """COGS per unit sold; None when the item is untracked."""
        item_recipes = recipe_map.get((menu_item_id, variant_id), [])
        if variant_id is not None and not item_recipes:
            item_recipes = recipe_map.get((menu_item_id, None), [])
        if not item_recipes:
            return None
        total = Decimal(0)
        for rc in item_recipes:
            cost = ingredient_cost(rc.inventory_item_id)
            if cost is None:
                return None
            qty = _d(rc.quantity_required) * (Decimal(1) + _d(rc.waste_factor))
            total += qty * cost
        return total

    # 4. Aggregate per menu item and per day.
    items: dict[int, dict] = {}
    daily: dict[Any, dict] = {}
    for row in line_rows:
        qty = _d(row.qty)
        revenue = _d(row.revenue)
        cogs_unit = unit_cogs(row.menu_item_id, row.menu_variant_id)
        cogs = cogs_unit * qty if cogs_unit is not None else None

        entry = items.setdefault(
            row.menu_item_id,
            {
                "menu_item_id": row.menu_item_id,
                "item_name": row.item_name,
                "quantity": Decimal(0),
                "revenue": Decimal(0),
                "tracked_revenue": Decimal(0),
                "untracked_revenue": Decimal(0),
                "cogs": Decimal(0),
                "tracked": False,
            },
        )
        entry["quantity"] += qty
        entry["revenue"] += revenue
        if cogs is None:
            entry["untracked_revenue"] += revenue
        else:
            entry["tracked"] = True
            entry["tracked_revenue"] += revenue
            entry["cogs"] += cogs

        day_key = row.day.isoformat() if hasattr(row.day, "isoformat") else str(row.day)
        day_entry = daily.setdefault(
            day_key,
            {"date": day_key, "revenue": Decimal(0), "cogs": Decimal(0), "untracked_revenue": Decimal(0)},
        )
        day_entry["revenue"] += revenue
        if cogs is None:
            day_entry["untracked_revenue"] += revenue
        else:
            day_entry["cogs"] += cogs

    def pct(margin: Decimal, revenue: Decimal) -> float | None:
        if revenue <= 0:
            return None
        return float((margin / revenue) * 100)

    rows = []
    untracked_qty = Decimal(0)
    untracked_revenue = Decimal(0)
    untracked_item_count = 0
    for entry in items.values():
        margin = entry["tracked_revenue"] - entry["cogs"]
        untracked_revenue += entry["untracked_revenue"]
        if not entry["tracked"]:
            untracked_qty += entry["quantity"]
            untracked_item_count += 1
        rows.append(
            {
                "menu_item_id": entry["menu_item_id"],
                "item_name": entry["item_name"],
                "quantity": entry["quantity"],
                "revenue": entry["revenue"],
                "cogs": entry["cogs"] if entry["tracked"] else None,
                "margin": margin if entry["tracked"] else None,
                "margin_pct": pct(margin, entry["tracked_revenue"]) if entry["tracked"] else None,
                "tracked": entry["tracked"],
                "tracked_revenue": entry["tracked_revenue"],
                "untracked_revenue": entry["untracked_revenue"],
            }
        )
    rows.sort(key=lambda r: r["revenue"], reverse=True)

    total_qty = sum((r["quantity"] for r in rows), Decimal(0))
    total_revenue = sum((r["revenue"] for r in rows), Decimal(0))
    total_tracked = sum((r["tracked_revenue"] for r in rows if r["tracked"]), Decimal(0))
    total_cogs = sum((r["cogs"] or Decimal(0) for r in rows), Decimal(0))
    total_margin = total_tracked - total_cogs

    for day_entry in daily.values():
        day_entry["margin"] = day_entry["revenue"] - day_entry["untracked_revenue"] - day_entry["cogs"]

    return {
        "rows": rows,
        "untracked": {
            "quantity": untracked_qty,
            "revenue": untracked_revenue,
            "items": untracked_item_count,
        },
        "totals": {
            "quantity": total_qty,
            "revenue": total_revenue,
            "tracked_revenue": total_tracked,
            "untracked_revenue": untracked_revenue,
            "cogs": total_cogs,
            "margin": total_margin,
            "margin_pct": pct(total_margin, total_tracked),
        },
        "daily": [daily[k] for k in sorted(daily)],
    }
