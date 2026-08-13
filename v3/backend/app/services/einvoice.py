"""LHDN MyInvois e-invoice service.

Config-gated provider integration following the stripe/hitpay pattern: while
``einvoice.enabled`` is false (the dev default) submissions are SIMULATED —
the document row is still created and is marked ``validated`` with synthetic
UUIDs, so the whole flow (build UBL → issue → admin review) is exercisable
without real MyInvois credentials. Flip ``einvoice.enabled`` plus
``einvoice.client_id``/``einvoice.client_secret`` in platform_config for the
real preprod/production API.

Nothing in this module raises to its callers: e-invoicing must never break a
payment flow. Failures are recorded on the document row (status ``failed`` +
``error_message``) and logged.

References:
- Login:   POST {base_url}/connect/token (client_credentials, scope InvoicingAPI)
- Submit:  POST {base_url}/api/v1.0/documentsubmissions
- Document JSON: UBL 2.1 in the MyInvois JSON form (``_D``/``_A``/``_B`` urn
  markers, arrays of objects, ``{"_": value}`` leaves).
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
from datetime import datetime, timezone
from uuid import uuid4

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.money import money_round, to_decimal
from app.models.customer import Customer
from app.models.einvoice import EinvoiceDocument
from app.models.order import Order, OrderLineItem
from app.models.payment import Payment
from app.models.store import Store
from app.services.platform_config import PlatformConfigService

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://preprod-api.myinvois.hasil.gov.my"
PREPROD_PORTAL_BASE = "https://preprod-myinvois.hasil.gov.my"
PROD_PORTAL_BASE = "https://myinvois.hasil.gov.my"

# Placeholder phone of the shared kiosk/POS walk-in customer record
# (see public/kiosk.py::_get_or_create_walkin_customer).
WALKIN_PHONE = "+0000000000"

DOC_TYPE_INVOICE = "01"
DOC_TYPE_REFUND_NOTE = "04"


# ---------------------------------------------------------------------------
# UBL 2.1 document building
# ---------------------------------------------------------------------------

def _node(value, **attrs) -> list[dict]:
    """One UBL leaf: a single-element array of ``{"_": value, ...attrs}``."""
    node = {"_": value}
    node.update(attrs)
    return [node]


def _money_node(value, precision: int, rounding_mode: str) -> list[dict]:
    """Money leaf: rounded via money_round, emitted as float at the JSON edge."""
    return _node(float(money_round(value, precision, rounding_mode)), currencyID="MYR")


def _code_number(order: Order, document_type: str, payment: Payment | None = None) -> str:
    base = f"EINV-{order.order_number}-{document_type}"
    # Refund notes are keyed per payment (an order can be refunded in several
    # payments) — suffix the payment id so each codeNumber stays unique.
    if document_type == DOC_TYPE_REFUND_NOTE and payment is not None:
        base += f"-P{payment.id}"
    return base


def _is_walkin_customer(customer: Customer | None) -> bool:
    if customer is None:
        return True
    if (customer.phone_number or "") == WALKIN_PHONE:
        return True
    return (customer.display_name or "").strip().lower() in ("", "walk-in")


def _portal_base(base_url: str) -> str:
    return PREPROD_PORTAL_BASE if "preprod" in base_url else PROD_PORTAL_BASE


async def build_ubl_invoice(
    db: AsyncSession,
    order: Order,
    store: Store | None,
    document_type: str = DOC_TYPE_INVOICE,
    payment: Payment | None = None,
) -> dict:
    """Build the MyInvois UBL 2.1 JSON document for an order.

    ``document_type`` is "01" (invoice) or "04" (refund note); it drives the
    Invoice ID / code number and the InvoiceTypeCode. Refund notes also carry
    a BillingReference back to the order's original type-01 document when one
    exists (``payment`` scopes the code number to the refunded payment).
    """
    config = PlatformConfigService(db)
    precision = await config.get_accounting_precision()
    rounding_mode = await config.get_accounting_rounding()

    tin = await config.get_str("einvoice.tin", "C00000000000")
    brn = await config.get_str("einvoice.brn", "200001000001")
    msic = await config.get_str("einvoice.msic", "56101")
    supplier_name = await config.get_str("einvoice.supplier_name", "Loka Espresso")
    sst_number = await config.get_str("einvoice.sst_number", "SST-123456789")
    classification = await config.get_str("einvoice.default_classification", "999")
    support_phone = await config.get_str("app.support_phone", "")
    support_email = await config.get_str("app.support_email", "")

    li_result = await db.execute(
        select(OrderLineItem).where(OrderLineItem.order_id == order.id).order_by(OrderLineItem.id)
    )
    line_items = li_result.scalars().all()

    customer = None
    if order.customer_id:
        cust_result = await db.execute(select(Customer).where(Customer.id == order.customer_id))
        customer = cust_result.scalar_one_or_none()

    items_subtotal = to_decimal(order.items_subtotal)
    tax_amount = to_decimal(order.tax_amount)
    discount_amount = to_decimal(order.discount_amount)
    service_charge = to_decimal(order.service_charge)
    total_amount = to_decimal(order.total_amount)
    tax_exclusive = money_round(items_subtotal - discount_amount + service_charge, precision, rounding_mode)

    issue_dt = order.created_at or datetime.now(timezone.utc)
    if issue_dt.tzinfo is None:
        issue_dt = issue_dt.replace(tzinfo=timezone.utc)
    issue_dt = issue_dt.astimezone(timezone.utc)

    supplier_party = {
        "PartyIdentification": [
            {"ID": _node(tin, schemeID="TIN")},
            {"ID": _node(sst_number, schemeID="SST")},
            {"ID": _node(brn, schemeID="BRN")},
        ],
        "IndustryClassificationCode": _node(msic, name="Food and beverage services"),
        "PartyLegalEntity": [{"RegistrationName": _node(supplier_name)}],
        "PostalAddress": [
            {
                "CityName": _node(getattr(store, "city", None) or ""),
                "PostalZone": _node(getattr(store, "postal_code", None) or ""),
                "CountrySubentityCode": _node(getattr(store, "state_province", None) or ""),
                "Country": [{"IdentificationCode": _node("MYS", listID="ISO3166-1", listAgencyID="6")}],
            }
        ],
        "PartyTaxScheme": [
            {
                "CompanyID": _node(sst_number),
                "TaxScheme": [{"ID": _node("01")}],
            }
        ],
        "Contact": [
            {
                "Telephone": _node(getattr(store, "phone_number", None) or support_phone or "NA"),
                "ElectronicMail": _node(getattr(store, "email_address", None) or support_email or "NA"),
            }
        ],
    }

    if _is_walkin_customer(customer):
        customer_party = {
            "PartyIdentification": [
                {"ID": _node("NA", schemeID="TIN")},
                {"ID": _node("NA", schemeID="BRN")},
            ],
            "PartyLegalEntity": [{"RegistrationName": _node("General Public")}],
        }
    else:
        customer_party = {
            "PartyIdentification": [
                {"ID": _node("NA", schemeID="TIN")},
            ],
            "PartyLegalEntity": [{"RegistrationName": _node(customer.display_name or "Customer")}],
            "Contact": [
                {
                    "Telephone": _node(customer.phone_number or "NA"),
                    "ElectronicMail": _node(customer.email_address or "NA"),
                }
            ],
        }

    invoice_lines = []
    for seq, li in enumerate(line_items, start=1):
        snapshot = li.item_snapshot or {}
        item_name = snapshot.get("item_name") or snapshot.get("name") or f"Item {li.menu_item_id}"
        invoice_lines.append(
            {
                "ID": _node(str(seq)),
                "InvoicedQuantity": _node(float(to_decimal(li.quantity)), unitCode="C62"),
                "LineExtensionAmount": _money_node(li.line_total, precision, rounding_mode),
                "Item": [
                    {
                        "Name": _node(item_name),
                        "CommodityClassification": [
                            {"ItemClassificationCode": _node(classification, listID="CLASS")}
                        ],
                    }
                ],
                "Price": [{"PriceAmount": _money_node(li.unit_price, precision, rounding_mode)}],
                "ItemPriceExtension": [{"Amount": _money_node(li.line_total, precision, rounding_mode)}],
            }
        )

    allowance_charges = []
    if discount_amount > 0:
        allowance_charges.append(
            {
                "ChargeIndicator": _node(False),
                "Amount": _money_node(discount_amount, precision, rounding_mode),
            }
        )
    if service_charge > 0:
        allowance_charges.append(
            {
                "ChargeIndicator": _node(True),
                "Amount": _money_node(service_charge, precision, rounding_mode),
            }
        )

    invoice = {
        "ID": _node(_code_number(order, document_type, payment)),
        "IssueDate": _node(issue_dt.strftime("%Y-%m-%d")),
        "IssueTime": _node(issue_dt.strftime("%H:%M:%SZ")),
        "InvoiceTypeCode": _node(document_type, listVersionID="1.0"),
        "DocumentCurrencyCode": _node("MYR"),
        "TaxCurrencyCode": _node("MYR"),
        "AccountingSupplierParty": [{"Party": [supplier_party]}],
        "AccountingCustomerParty": [{"Party": [customer_party]}],
        "TaxTotal": [
            {
                "TaxAmount": _money_node(tax_amount, precision, rounding_mode),
                "TaxSubtotal": [
                    {
                        "TaxableAmount": _money_node(items_subtotal, precision, rounding_mode),
                        "TaxAmount": _money_node(tax_amount, precision, rounding_mode),
                        "TaxCategory": [
                            {
                                "ID": _node("01"),
                                "TaxScheme": [{"ID": _node("01")}],
                            }
                        ],
                    }
                ],
            }
        ],
        "LegalMonetaryTotal": [
            {
                "LineExtensionAmount": _money_node(items_subtotal, precision, rounding_mode),
                "TaxExclusiveAmount": _node(float(tax_exclusive), currencyID="MYR"),
                "TaxInclusiveAmount": _money_node(total_amount, precision, rounding_mode),
                "AllowanceTotalAmount": _money_node(discount_amount, precision, rounding_mode),
                "ChargeTotalAmount": _money_node(service_charge, precision, rounding_mode),
                "PayableAmount": _money_node(total_amount, precision, rounding_mode),
            }
        ],
        "InvoiceLine": invoice_lines,
    }
    if allowance_charges:
        invoice["AllowanceCharge"] = allowance_charges

    if document_type == DOC_TYPE_REFUND_NOTE:
        # MyInvois requires refund notes to reference the original invoice.
        ref_result = await db.execute(
            select(EinvoiceDocument)
            .where(
                EinvoiceDocument.order_id == order.id,
                EinvoiceDocument.document_type == DOC_TYPE_INVOICE,
                EinvoiceDocument.status.in_(("submitted", "validated")),
            )
            .order_by(EinvoiceDocument.id.desc())
            .limit(1)
        )
        original = ref_result.scalar_one_or_none()
        if original is not None:
            invoice["BillingReference"] = [
                {
                    "InvoiceDocumentReference": [
                        {"ID": _node(original.myinvois_uuid or original.code_number)}
                    ]
                }
            ]

    return {
        "_D": "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
        "_A": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
        "_B": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
        "Invoice": [invoice],
    }


# ---------------------------------------------------------------------------
# Issue + submit
# ---------------------------------------------------------------------------

async def issue_einvoice(
    db: AsyncSession,
    order: Order,
    payment: Payment,
    document_type: str = DOC_TYPE_INVOICE,
) -> EinvoiceDocument:
    """Create (idempotently) and submit an e-invoice document for an order.

    Type-01 invoices are keyed per ORDER: one order gets exactly one invoice
    for its full totals, no matter how many split-bill payments settled it
    (per-payment documents would duplicate the same codeNumber/totals, which
    real MyInvois rejects). Refund notes stay keyed per (order, payment,
    document_type). If a matching row already exists it is returned unchanged
    — issuance is safe to retry.
    """
    if document_type == DOC_TYPE_INVOICE:
        existing = await db.execute(
            select(EinvoiceDocument).where(
                EinvoiceDocument.order_id == order.id,
                EinvoiceDocument.document_type == document_type,
            )
        )
    else:
        existing = await db.execute(
            select(EinvoiceDocument).where(
                EinvoiceDocument.order_id == order.id,
                EinvoiceDocument.payment_id == payment.id,
                EinvoiceDocument.document_type == document_type,
            )
        )
    doc = existing.scalar_one_or_none()
    if doc is not None:
        return doc

    store_result = await db.execute(select(Store).where(Store.id == order.store_id))
    store = store_result.scalar_one_or_none()

    ubl = await build_ubl_invoice(db, order, store, document_type=document_type, payment=payment)

    doc = EinvoiceDocument(
        order_id=order.id,
        payment_id=payment.id,
        store_id=order.store_id,
        document_type=document_type,
        code_number=_code_number(order, document_type, payment),
        status="pending",
        ubl_document=ubl,
    )
    db.add(doc)
    await db.flush()

    await _submit(db, doc)
    await db.commit()
    return doc


async def _submit(db: AsyncSession, doc: EinvoiceDocument) -> None:
    """Submit a document to MyInvois (or simulate it). Never raises."""
    config = PlatformConfigService(db)
    enabled = await config.get_bool("einvoice.enabled", default=False)
    base_url = (await config.get_str("einvoice.base_url", DEFAULT_BASE_URL) or DEFAULT_BASE_URL).rstrip("/")
    now = datetime.now(timezone.utc)

    if not enabled:
        # Simulated submission (dev default): mirror a successful MyInvois
        # round-trip with synthetic identifiers.
        uuid_hex = uuid4().hex
        doc.myinvois_uuid = f"sim-{uuid_hex}"
        doc.submission_uid = f"simsub-{uuid4().hex[:12]}"
        doc.status = "validated"
        doc.submitted_at = now
        doc.error_message = None
        doc.validation_link = (
            f"{_portal_base(base_url)}/{doc.myinvois_uuid}/share/sim-{uuid4().hex[:24]}"
        )
        return

    try:
        client_id = await config.get_str("einvoice.client_id", "")
        client_secret = await config.get_str("einvoice.client_secret", "")

        raw = json.dumps(doc.ubl_document, separators=(",", ":")).encode("utf-8")
        payload = {
            "documents": [
                {
                    "format": "JSON",
                    "documentHash": hashlib.sha256(raw).hexdigest(),
                    "codeNumber": doc.code_number,
                    "document": base64.b64encode(raw).decode("ascii"),
                }
            ]
        }

        async with httpx.AsyncClient(timeout=20) as client:
            token_resp = await client.post(
                f"{base_url}/connect/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "scope": "InvoicingAPI",
                },
            )
            token_resp.raise_for_status()
            access_token = token_resp.json().get("access_token")

            submit_resp = await client.post(
                f"{base_url}/api/v1.0/documentsubmissions",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            submit_resp.raise_for_status()
            body = submit_resp.json()

        accepted = body.get("acceptedDocuments") or []
        rejected = body.get("rejectedDocuments") or []
        if accepted:
            entry = accepted[0]
            doc.myinvois_uuid = entry.get("uuid")
            doc.submission_uid = body.get("submissionUID") or body.get("submissionUid")
            doc.status = "submitted"
            doc.submitted_at = now
            doc.error_message = None
            long_id = entry.get("longId")
            doc.validation_link = (
                f"{_portal_base(base_url)}/{doc.myinvois_uuid}/share/{long_id}" if long_id else None
            )
        elif rejected:
            entry = rejected[0]
            doc.status = "rejected"
            doc.error_message = json.dumps(entry.get("error", entry), default=str)
        else:
            doc.status = "failed"
            doc.error_message = f"Unexpected MyInvois response: {json.dumps(body, default=str)[:1000]}"
    except Exception as exc:  # httpx errors, token/JSON problems — anything
        logger.warning("MyInvois submission failed for %s: %s", doc.code_number, exc, exc_info=True)
        doc.status = "failed"
        doc.error_message = f"{type(exc).__name__}: {exc}"


async def auto_issue_on_payment(db: AsyncSession, order: Order, payment: Payment) -> None:
    """Fire-and-forget issuance after a captured payment.

    Gated on ``einvoice.auto_issue``; every failure is logged and swallowed so
    the payment flow is never affected. The type-01 invoice covers the WHOLE
    order, so it is only issued once the order is fully paid — issuing on the
    first captured payment of a split bill would invoice money not yet paid.
    """
    try:
        config = PlatformConfigService(db)
        if not await config.get_bool("einvoice.auto_issue", default=False):
            return
        if payment is None or payment.status not in ("captured", "partially_refunded"):
            return
        if order.deleted_at is not None:
            return
        if order.payment_status not in ("captured", "settled"):
            return
        await issue_einvoice(db, order, payment)
    except Exception:
        logger.exception("Auto-issue e-invoice failed for order %s", getattr(order, "id", None))


async def issue_refund_note_for_payment(
    db: AsyncSession,
    payment: Payment,
    refund=None,
) -> None:
    """Fire-and-forget MyInvois refund note (type 04) after a completed refund.

    Gated on ``einvoice.auto_issue`` and on the order already having a
    submitted/validated type-01 invoice to reference. Like
    ``auto_issue_on_payment`` every failure is logged and swallowed so the
    refund flow is never affected.

    Wiring (lives in app/services/payment.py, owned by another team): call
    ``await issue_refund_note_for_payment(db, payment, refund)`` at the end of
    ``refund_payment`` right after its final ``await db.commit()``.
    """
    try:
        config = PlatformConfigService(db)
        if not await config.get_bool("einvoice.auto_issue", default=False):
            return
        if payment is None:
            return
        if refund is not None and getattr(refund, "status", None) != "completed":
            return
        order_result = await db.execute(
            select(Order).where(Order.id == payment.order_id)
        )
        order = order_result.scalar_one_or_none()
        if order is None or order.deleted_at is not None:
            return
        # A refund note is only meaningful against an issued original invoice.
        original_result = await db.execute(
            select(EinvoiceDocument.id).where(
                EinvoiceDocument.order_id == order.id,
                EinvoiceDocument.document_type == DOC_TYPE_INVOICE,
                EinvoiceDocument.status.in_(("submitted", "validated")),
            ).limit(1)
        )
        if original_result.scalar_one_or_none() is None:
            return
        await issue_einvoice(db, order, payment, document_type=DOC_TYPE_REFUND_NOTE)
    except Exception:
        logger.exception(
            "Refund-note issuance failed for payment %s", getattr(payment, "id", None)
        )
