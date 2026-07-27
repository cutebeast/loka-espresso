"""Unit tests for the LHDN MyInvois e-invoice service."""

from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.einvoice import EinvoiceDocument
from app.services.einvoice import build_ubl_invoice, issue_einvoice


EINVOICE_CONFIG_VALUES = {
    "einvoice.tin": "C12345678901",
    "einvoice.brn": "200001000001",
    "einvoice.msic": "56101",
    "einvoice.supplier_name": "Loka Espresso",
    "einvoice.sst_number": "SST-99887766",
    "einvoice.default_classification": "999",
    "einvoice.base_url": "https://preprod-api.myinvois.hasil.gov.my",
    "einvoice.client_id": "",
    "einvoice.client_secret": "",
    "app.support_phone": "+60123456789",
    "app.support_email": "support@lokaespresso.my",
}


@pytest.fixture
def fake_config(monkeypatch):
    """Patch PlatformConfigService so e-invoice tests do not hit the DB."""
    config = MagicMock()
    values = dict(EINVOICE_CONFIG_VALUES)
    config.values = values
    config.get_bool = AsyncMock(return_value=False)
    config.get = AsyncMock(return_value=None)
    config.get_int = AsyncMock(return_value=2)
    config.get_accounting_precision = AsyncMock(return_value=2)
    config.get_accounting_rounding = AsyncMock(return_value="ROUND_HALF_UP")
    config.get_str = AsyncMock(side_effect=lambda key, default="": values.get(key, default))
    monkeypatch.setattr(
        "app.services.einvoice.PlatformConfigService",
        lambda db: config,
    )
    return config


class _FakeResult:
    def __init__(self, items=None, one=None):
        self._items = items
        self._one = one

    def scalars(self):
        return self

    def all(self):
        return self._items or []

    def scalar_one_or_none(self):
        return self._one


def _async_db():
    db = AsyncMock()
    db.add = MagicMock()
    return db


def _leaf(node_list):
    return node_list[0]["_"]


def _order(**overrides):
    base = dict(
        id=11,
        order_number="ORD-1001",
        store_id=3,
        customer_id=42,
        items_subtotal=Decimal("20.00"),
        tax_amount=Decimal("1.20"),
        service_charge=Decimal("2.00"),
        discount_amount=Decimal("3.00"),
        total_amount=Decimal("20.20"),
        created_at=datetime(2026, 7, 27, 10, 30, tzinfo=timezone.utc),
        deleted_at=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def _store():
    return SimpleNamespace(
        id=3,
        city="Kuala Lumpur",
        postal_code="50480",
        state_province="14",
        phone_number="+60312345678",
        email_address="store@lokaespresso.my",
    )


def _line_item(item_name="Latte", qty=2, unit_price="10.00", line_total="20.00"):
    return SimpleNamespace(
        id=1,
        menu_item_id=7,
        item_snapshot={"item_name": item_name},
        quantity=qty,
        unit_price=Decimal(unit_price),
        line_total=Decimal(line_total),
    )


# ---------------------------------------------------------------------------
# build_ubl_invoice
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_build_ubl_invoice_totals_and_allowance_charges(fake_config):
    """Monetary totals and allowance/charge indicators must mirror the order."""
    db = _async_db()
    db.execute.side_effect = [
        _FakeResult(items=[_line_item()]),  # order line items
        _FakeResult(one=None),              # customer lookup → walk-in
    ]

    ubl = await build_ubl_invoice(db, _order(), _store())
    invoice = ubl["Invoice"][0]

    totals = invoice["LegalMonetaryTotal"][0]
    assert _leaf(totals["LineExtensionAmount"]) == 20.0
    assert _leaf(totals["TaxExclusiveAmount"]) == 19.0  # 20.00 - 3.00 + 2.00
    assert _leaf(totals["TaxInclusiveAmount"]) == 20.2
    assert _leaf(totals["PayableAmount"]) == 20.2

    assert _leaf(invoice["TaxTotal"][0]["TaxAmount"]) == 1.2
    subtotal = invoice["TaxTotal"][0]["TaxSubtotal"][0]
    assert _leaf(subtotal["TaxableAmount"]) == 20.0
    assert _leaf(subtotal["TaxAmount"]) == 1.2

    # Discount → ChargeIndicator false, service charge → true
    charges = invoice["AllowanceCharge"]
    assert len(charges) == 2
    assert _leaf(charges[0]["ChargeIndicator"]) is False
    assert _leaf(charges[0]["Amount"]) == 3.0
    assert _leaf(charges[1]["ChargeIndicator"]) is True
    assert _leaf(charges[1]["Amount"]) == 2.0

    line = invoice["InvoiceLine"][0]
    assert _leaf(line["InvoicedQuantity"]) == 2.0
    assert _leaf(line["LineExtensionAmount"]) == 20.0
    assert _leaf(line["Item"][0]["Name"]) == "Latte"
    classification = line["Item"][0]["CommodityClassification"][0]["ItemClassificationCode"]
    assert _leaf(classification) == "999"
    assert classification[0]["listID"] == "CLASS"

    assert _leaf(invoice["InvoiceTypeCode"]) == "01"
    assert _leaf(invoice["DocumentCurrencyCode"]) == "MYR"
    assert _leaf(invoice["ID"]) == "EINV-ORD-1001-01"


@pytest.mark.asyncio
async def test_build_ubl_invoice_walkin_buyer(fake_config):
    """The shared walk-in customer must be billed as 'General Public'."""
    db = _async_db()
    walkin = SimpleNamespace(
        display_name="Walk-in", phone_number="+0000000000", email_address=None
    )
    db.execute.side_effect = [
        _FakeResult(items=[_line_item()]),
        _FakeResult(one=walkin),
    ]

    ubl = await build_ubl_invoice(db, _order(), _store())
    party = ubl["Invoice"][0]["AccountingCustomerParty"][0]["Party"][0]

    assert _leaf(party["PartyLegalEntity"][0]["RegistrationName"]) == "General Public"
    ids = party["PartyIdentification"]
    assert _leaf(ids[0]["ID"]) == "NA"
    assert ids[0]["ID"][0]["schemeID"] == "TIN"
    assert _leaf(ids[1]["ID"]) == "NA"
    assert ids[1]["ID"][0]["schemeID"] == "BRN"


@pytest.mark.asyncio
async def test_build_ubl_invoice_attached_customer(fake_config):
    """A real customer appears with their name and contact details, TIN 'NA'."""
    db = _async_db()
    customer = SimpleNamespace(
        display_name="Ahmad", phone_number="+60111234567", email_address="ahmad@example.com"
    )
    db.execute.side_effect = [
        _FakeResult(items=[_line_item()]),
        _FakeResult(one=customer),
    ]

    ubl = await build_ubl_invoice(db, _order(), _store())
    party = ubl["Invoice"][0]["AccountingCustomerParty"][0]["Party"][0]

    assert _leaf(party["PartyLegalEntity"][0]["RegistrationName"]) == "Ahmad"
    ids = party["PartyIdentification"]
    assert _leaf(ids[0]["ID"]) == "NA"
    assert ids[0]["ID"][0]["schemeID"] == "TIN"
    assert _leaf(party["Contact"][0]["Telephone"]) == "+60111234567"
    assert _leaf(party["Contact"][0]["ElectronicMail"]) == "ahmad@example.com"


@pytest.mark.asyncio
async def test_build_ubl_invoice_classification_from_config(fake_config):
    """The commodity classification code comes from platform config."""
    fake_config.values["einvoice.default_classification"] = "022"
    db = _async_db()
    db.execute.side_effect = [
        _FakeResult(items=[_line_item()]),
        _FakeResult(one=None),
    ]

    ubl = await build_ubl_invoice(db, _order(), _store())
    line = ubl["Invoice"][0]["InvoiceLine"][0]
    classification = line["Item"][0]["CommodityClassification"][0]["ItemClassificationCode"]
    assert _leaf(classification) == "022"


# ---------------------------------------------------------------------------
# issue_einvoice (simulated submit + idempotency)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_issue_einvoice_simulated_submit(fake_config):
    """With einvoice.enabled=false the doc is 'validated' with sim identifiers."""
    db = _async_db()
    db.execute.side_effect = [
        _FakeResult(one=None),              # no existing document
        _FakeResult(one=_store()),          # store lookup
        _FakeResult(items=[_line_item()]),  # order line items
        _FakeResult(one=None),              # customer lookup
    ]
    order = _order()
    payment = SimpleNamespace(id=55, order_id=order.id, status="captured")

    doc = await issue_einvoice(db, order, payment)

    assert doc.status == "validated"
    assert doc.myinvois_uuid.startswith("sim-")
    assert doc.submission_uid.startswith("simsub-")
    assert "/share/" in doc.validation_link
    assert doc.submitted_at is not None
    assert doc.error_message is None
    assert doc.code_number == "EINV-ORD-1001-01"
    assert doc.document_type == "01"
    assert doc.ubl_document["Invoice"][0]["ID"][0]["_"] == "EINV-ORD-1001-01"
    db.add.assert_called_once()
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_issue_einvoice_idempotent_returns_existing(fake_config):
    """A second issue for the same (order, payment, type) returns the same row."""
    db = _async_db()
    existing = EinvoiceDocument(
        order_id=11,
        payment_id=55,
        store_id=3,
        document_type="01",
        code_number="EINV-ORD-1001-01",
        status="validated",
    )
    db.execute.return_value = _FakeResult(one=existing)

    order = _order()
    payment = SimpleNamespace(id=55, order_id=order.id, status="captured")

    doc = await issue_einvoice(db, order, payment)

    assert doc is existing
    db.add.assert_not_called()
    db.commit.assert_not_awaited()
