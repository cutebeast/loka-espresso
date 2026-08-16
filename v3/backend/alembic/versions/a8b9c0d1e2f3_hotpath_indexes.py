"""Add missing hot-path indexes + drop a redundant one.

Dev-DB schema audit (2026-08-16): 94 FK columns have no leading index and one
index pair on einvoice_documents is fully redundant. This migration adds the
high-value lookup indexes (per-customer ledger/voucher/reward reads, menu
modifier joins, store-scoped ops reads) and drops the redundant plain index
(uq_einvoice_order_type01 already covers order_id lookups).

Revision ID: a8b9c0d1e2f3
Revises: y4z5a6b7c8d9
Create Date: 2026-08-16
"""
from alembic import op

revision = "a8b9c0d1e2f3"
down_revision = "y4z5a6b7c8d9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Wallet / loyalty hot reads (per-customer pages, checkout, refunds)
    op.create_index("ix_wallet_ledger_entries_wallet_id", "wallet_ledger_entries", ["wallet_id"])
    op.create_index("ix_loyalty_points_ledger_customer_id", "loyalty_points_ledger", ["customer_id"])
    op.create_index("ix_loyalty_points_ledger_loyalty_account_id", "loyalty_points_ledger", ["loyalty_account_id"])
    op.create_index("ix_customer_vouchers_customer_id", "customer_vouchers", ["customer_id"])
    op.create_index("ix_customer_rewards_customer_id", "customer_rewards", ["customer_id"])
    op.create_index("ix_customer_consents_customer_id", "customer_consents", ["customer_id"])
    op.create_index("ix_customer_devices_customer_id", "customer_devices", ["customer_id"])

    # Order/cart lines — menu sales analytics + cart hydration
    op.create_index("ix_order_line_items_menu_item_id", "order_line_items", ["menu_item_id"])
    op.create_index("ix_cart_line_items_menu_item_id", "cart_line_items", ["menu_item_id"])
    op.create_index("ix_payment_line_allocations_order_line_item_id", "payment_line_allocations", ["order_line_item_id"])

    # Menu joins (item pages, cart pricing, kiosk catalogs)
    op.create_index("ix_menu_modifier_groups_menu_item_id", "menu_modifier_groups", ["menu_item_id"])
    op.create_index("ix_menu_modifier_options_modifier_group_id", "menu_modifier_options", ["modifier_group_id"])
    op.create_index("ix_menu_variants_parent_item_id", "menu_variants", ["parent_item_id"])

    # Store-scoped ops reads (tables page, POS floor, time clock, inventory)
    op.create_index("ix_table_status_snapshot_store_id", "table_status_snapshot", ["store_id"])
    op.create_index("ix_staff_profiles_store_id", "staff_profiles", ["store_id"])
    op.create_index("ix_staff_time_events_staff_id", "staff_time_events", ["staff_id"])
    op.create_index("ix_staff_time_events_store_id", "staff_time_events", ["store_id"])
    op.create_index("ix_inventory_movement_log_store_id", "inventory_movement_log", ["store_id"])
    op.create_index("ix_purchase_orders_store_id", "purchase_orders", ["store_id"])
    op.create_index("ix_audit_log_store_id", "audit_log", ["store_id"])

    # Tips / referrals / RSVPs / surveys
    op.create_index("ix_tip_allocations_order_id", "tip_allocations", ["order_id"])
    op.create_index("ix_referral_events_invitee_customer_id", "referral_events", ["invitee_customer_id"])
    op.create_index("ix_event_rsvps_event_id", "event_rsvps", ["event_id"])
    op.create_index("ix_event_rsvps_customer_id", "event_rsvps", ["customer_id"])
    op.create_index("ix_event_invites_event_id", "event_invites", ["event_id"])
    op.create_index("ix_survey_responses_customer_id", "survey_responses", ["customer_id"])

    # Pre-existing model drift (models declared these, DB never had them)
    op.create_index("ix_suppliers_store_id", "suppliers", ["store_id"])

    # Redundant: unique index already leads with order_id
    op.drop_index("ix_einvoice_documents_order_id", table_name="einvoice_documents")


def downgrade() -> None:
    op.create_index("ix_einvoice_documents_order_id", "einvoice_documents", ["order_id"])
    for name in (
        "ix_suppliers_store_id",
        "ix_survey_responses_customer_id",
        "ix_event_invites_event_id",
        "ix_event_rsvps_customer_id",
        "ix_event_rsvps_event_id",
        "ix_referral_events_invitee_customer_id",
        "ix_tip_allocations_order_id",
        "ix_audit_log_store_id",
        "ix_purchase_orders_store_id",
        "ix_inventory_movement_log_store_id",
        "ix_staff_time_events_store_id",
        "ix_staff_time_events_staff_id",
        "ix_staff_profiles_store_id",
        "ix_table_status_snapshot_store_id",
        "ix_menu_variants_parent_item_id",
        "ix_menu_modifier_options_modifier_group_id",
        "ix_menu_modifier_groups_menu_item_id",
        "ix_payment_line_allocations_order_line_item_id",
        "ix_cart_line_items_menu_item_id",
        "ix_order_line_items_menu_item_id",
        "ix_customer_devices_customer_id",
        "ix_customer_consents_customer_id",
        "ix_customer_rewards_customer_id",
        "ix_customer_vouchers_customer_id",
        "ix_loyalty_points_ledger_loyalty_account_id",
        "ix_loyalty_points_ledger_customer_id",
        "ix_wallet_ledger_entries_wallet_id",
    ):
        op.execute(f"DROP INDEX IF EXISTS {name}")
