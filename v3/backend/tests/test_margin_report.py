"""Unit tests for the profit & margin (COGS) report computation."""

from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services.margin_report import compute_margin_report

DFROM = datetime(2026, 8, 1, 0, 0, tzinfo=timezone.utc)
DTO = datetime(2026, 8, 31, 23, 59, tzinfo=timezone.utc)


class _FakeScalars:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeResult:
    def __init__(self, rows=None):
        self._rows = rows or []

    def all(self):
        return self._rows

    def scalars(self):
        return _FakeScalars(self._rows)


def _line(menu_item_id, variant_id, name, day, qty, revenue):
    return SimpleNamespace(
        menu_item_id=menu_item_id,
        menu_variant_id=variant_id,
        item_name=name,
        day=day,
        qty=qty,
        revenue=revenue,
    )


def _recipe(menu_item_id, variant_id, inv_id, qty_required, waste=0):
    return SimpleNamespace(
        menu_item_id=menu_item_id,
        menu_variant_id=variant_id,
        inventory_item_id=inv_id,
        quantity_required=Decimal(str(qty_required)),
        waste_factor=Decimal(str(waste)),
    )


@pytest.mark.asyncio
async def test_margin_math_recipe_linked_item():
    """COGS = qty × Σ(qty_required × (1+waste)) × movement avg unit cost."""
    db = AsyncMock()
    db.execute.side_effect = [
        # Paid line aggregates: 2 lattes @ RM10.
        _FakeResult(rows=[_line(1, None, "Latte", date(2026, 8, 10), 2, "20.00")]),
        # Recipe: 1.5 units of milk per latte, no waste.
        _FakeResult(rows=[_recipe(1, None, 10, "1.5")]),
        # Movement-weighted cost: RM6 over 3 units -> RM2.00/unit.
        _FakeResult(rows=[SimpleNamespace(inventory_item_id=10, cost=Decimal("6.00"), qty=Decimal("3"))]),
        # Master fallback (unused here).
        _FakeResult(rows=[(10, Decimal("1.00"))]),
    ]

    report = await compute_margin_report(db, store_id=None, dfrom=DFROM, dto=DTO)

    row = report["rows"][0]
    assert row["item_name"] == "Latte"
    assert row["quantity"] == Decimal("2")
    assert row["revenue"] == Decimal("20.00")
    assert row["cogs"] == Decimal("6.0000")  # 2 × 1.5 × RM2
    assert row["margin"] == Decimal("14.0000")
    assert row["margin_pct"] == pytest.approx(70.0)
    assert row["tracked"] is True

    totals = report["totals"]
    assert totals["revenue"] == Decimal("20.00")
    assert totals["tracked_revenue"] == Decimal("20.00")
    assert totals["untracked_revenue"] == 0
    assert totals["cogs"] == Decimal("6.0000")
    assert totals["margin_pct"] == pytest.approx(70.0)

    assert report["daily"] == [
        {
            "date": "2026-08-10",
            "revenue": Decimal("20.00"),
            "cogs": Decimal("6.0000"),
            "untracked_revenue": Decimal(0),
            "margin": Decimal("14.0000"),
        }
    ]


@pytest.mark.asyncio
async def test_master_cost_fallback_and_waste_factor():
    """Without movement costs, InventoryItem.unit_cost applies; waste factor
    inflates consumption."""
    db = AsyncMock()
    db.execute.side_effect = [
        _FakeResult(rows=[_line(1, None, "Croissant", date(2026, 8, 11), 4, "40.00")]),
        # 1 unit butter per croissant, 10% waste.
        _FakeResult(rows=[_recipe(1, None, 10, "1", waste="0.10")]),
        _FakeResult(rows=[]),  # no movement costs in period
        _FakeResult(rows=[(10, Decimal("2.00"))]),
    ]

    report = await compute_margin_report(db, store_id=None, dfrom=DFROM, dto=DTO)

    row = report["rows"][0]
    # 4 × 1 × 1.1 × RM2 = RM8.80
    assert row["cogs"] == Decimal("8.8000")
    assert row["margin"] == Decimal("31.2000")
    assert row["margin_pct"] == pytest.approx(78.0)


@pytest.mark.asyncio
async def test_untracked_item_without_recipe_goes_to_bucket():
    """A menu item with no recipe rows must never report a fabricated 0 COGS."""
    db = AsyncMock()
    db.execute.side_effect = [
        _FakeResult(rows=[
            _line(1, None, "Latte", date(2026, 8, 10), 1, "10.00"),
            _line(2, None, "Merch Mug", date(2026, 8, 10), 3, "90.00"),
        ]),
        _FakeResult(rows=[_recipe(1, None, 10, "1")]),
        _FakeResult(rows=[]),
        _FakeResult(rows=[(10, Decimal("2.00"))]),
    ]

    report = await compute_margin_report(db, store_id=None, dfrom=DFROM, dto=DTO)

    mug = next(r for r in report["rows"] if r["item_name"] == "Merch Mug")
    assert mug["tracked"] is False
    assert mug["cogs"] is None
    assert mug["margin"] is None
    assert mug["margin_pct"] is None
    assert mug["untracked_revenue"] == Decimal("90.00")

    untracked = report["untracked"]
    assert untracked["revenue"] == Decimal("90.00")
    assert untracked["quantity"] == Decimal("3")
    assert untracked["items"] == 1

    # Totals: revenue counts everything, margin only the tracked portion.
    assert report["totals"]["revenue"] == Decimal("100.00")
    assert report["totals"]["tracked_revenue"] == Decimal("10.00")
    assert report["totals"]["cogs"] == Decimal("2.0000")
    assert report["totals"]["margin"] == Decimal("8.0000")


@pytest.mark.asyncio
async def test_zero_cost_component_is_untracked_never_zero():
    """Auto 1:1 LNK- links carry unit_cost 0 — reporting COGS 0 would fake a
    100% margin, so the item lands in the untracked bucket instead."""
    db = AsyncMock()
    db.execute.side_effect = [
        _FakeResult(rows=[_line(1, None, "Cake", date(2026, 8, 10), 2, "30.00")]),
        _FakeResult(rows=[_recipe(1, None, 11, "1")]),
        _FakeResult(rows=[]),  # no movement costs
        _FakeResult(rows=[(11, Decimal("0"))]),  # master cost is 0
    ]

    report = await compute_margin_report(db, store_id=None, dfrom=DFROM, dto=DTO)

    row = report["rows"][0]
    assert row["tracked"] is False
    assert row["cogs"] is None
    assert report["totals"]["untracked_revenue"] == Decimal("30.00")
    assert report["totals"]["cogs"] == 0


@pytest.mark.asyncio
async def test_variant_line_falls_back_to_generic_recipe():
    """Variant-specific lines use the variant recipe when present, else the
    generic (variant NULL) recipe — mirroring stock-deduction logic."""
    db = AsyncMock()
    db.execute.side_effect = [
        _FakeResult(rows=[_line(1, 5, "Latte (Large)", date(2026, 8, 10), 2, "24.00")]),
        _FakeResult(rows=[_recipe(1, None, 10, "2")]),  # generic recipe only
        _FakeResult(rows=[]),
        _FakeResult(rows=[(10, Decimal("1.50"))]),
    ]

    report = await compute_margin_report(db, store_id=None, dfrom=DFROM, dto=DTO)

    row = report["rows"][0]
    assert row["tracked"] is True
    assert row["cogs"] == Decimal("6.0000")  # 2 × 2 × RM1.50


@pytest.mark.asyncio
async def test_paid_only_store_and_date_scoping_in_query():
    """The line query must join the paid-payments subquery and apply the
    store/date scope filters."""
    db = AsyncMock()
    db.execute.side_effect = [_FakeResult(rows=[])]

    report = await compute_margin_report(db, store_id=3, dfrom=DFROM, dto=DTO)

    raw_stmt = db.execute.call_args_list[0].args[0]
    try:
        stmt = str(raw_stmt.compile(compile_kwargs={"literal_binds": True}))
    except Exception:
        stmt = str(raw_stmt)
    # Paid population: same payment statuses as the dashboard revenue filter.
    assert "payments" in stmt
    assert "captured" in stmt and "partially_refunded" in stmt
    # Store + date scoping.
    assert "orders.store_id" in stmt
    assert "orders.created_at >=" in stmt and "orders.created_at <=" in stmt

    # Empty period returns a well-formed zero report.
    assert report["rows"] == []
    assert report["daily"] == []
    assert report["totals"]["revenue"] == 0
    assert report["totals"]["margin_pct"] is None
    assert report["untracked"]["revenue"] == 0
