#!/usr/bin/env python3
"""Seed content/marketing data required by the E2E suite.

Covers: allergens, dietary tags, equipment + maintenance logs, POS terminals,
marketing campaigns, promo banners, surveys and notification templates.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text

from scripts._db_utils import confirm, get_db, guard_production


ALLERGENS = [
    ("peanuts", "Peanuts", "high"),
    ("gluten", "Gluten", "medium"),
    ("dairy", "Dairy", "medium"),
    ("shellfish", "Shellfish", "high"),
]

DIETARY_TAGS = [
    ("vegetarian", "Vegetarian", "#22C55E"),
    ("vegan", "Vegan", "#10B981"),
    ("halal", "Halal", "#3B82F6"),
    ("gluten_free", "Gluten Free", "#F59E0B"),
]

EQUIPMENT = [
    ("La Marzocco Linea", "espresso_machine", "SN-ESP-001", "La Marzocco", "Linea PB", "Counter A"),
    ("Mazzer Grinder", "grinder", "SN-GRD-001", "Mazzer", "Major E", "Counter A"),
    ("Blast Chiller", "refrigeration", "SN-REF-001", "Foster", "Xtra", "Back Kitchen"),
]

POS_TERMINALS = [
    ("POS-001", "Main Counter Terminal", "Counter"),
    ("POS-002", "DriveThru Terminal", "Drive Thru"),
]

CAMPAIGNS = [
    (
        "summer-promo-2026",
        "Summer Promo 2026",
        "promotional",
        "in_app",
        "draft",
        "Enjoy 10% off all drinks this summer!",
    ),
]

PROMO_BANNERS = [
    ("Welcome Offer", "Get 10% off your first order", "read_claim", None),
]

SURVEYS = [
    (
        "post-order-feedback",
        "Post-Order Feedback",
        "Help us improve your experience",
        "How satisfied were you with your order?",
        "single_choice",
        ["Very satisfied", "Satisfied", "Neutral", "Dissatisfied"],
    ),
]

NOTIFICATION_TEMPLATES = [
    ("Order Ready", "Your order is ready for pickup", "order", "all_users"),
    ("Welcome", "Welcome to LOKA Espresso", "general", "new_users"),
]


async def _upsert_allergen(db, data):
    existing = await db.execute(
        text("SELECT id FROM allergens WHERE allergen_key = :key"),
        {"key": data["allergen_key"]},
    )
    if existing.scalar_one_or_none():
        await db.execute(
            text("""
                UPDATE allergens
                SET display_name = :display_name,
                    severity = :severity,
                    is_active = true
                WHERE allergen_key = :key
            """),
            data,
        )
        return
    await db.execute(
        text("""
            INSERT INTO allergens (allergen_key, display_name, severity, is_active)
            VALUES (:allergen_key, :display_name, :severity, true)
        """),
        data,
    )


async def _upsert_dietary_tag(db, data):
    existing = await db.execute(
        text("SELECT id FROM dietary_tags WHERE tag_key = :key"),
        {"key": data["tag_key"]},
    )
    if existing.scalar_one_or_none():
        await db.execute(
            text("""
                UPDATE dietary_tags
                SET display_name = :display_name,
                    color_hex = :color_hex,
                    is_active = true
                WHERE tag_key = :key
            """),
            data,
        )
        return
    await db.execute(
        text("""
            INSERT INTO dietary_tags (tag_key, display_name, color_hex, is_active)
            VALUES (:tag_key, :display_name, :color_hex, true)
        """),
        data,
    )


async def _upsert_campaign(db, data):
    existing = await db.execute(
        text("SELECT id FROM marketing_campaigns WHERE campaign_key = :key"),
        {"key": data["campaign_key"]},
    )
    if existing.scalar_one_or_none():
        await db.execute(
            text("""
                UPDATE marketing_campaigns
                SET campaign_name = :campaign_name,
                    channel = :channel,
                    campaign_type = :campaign_type,
                    status = :status,
                    body_content = :body_content,
                    created_by = COALESCE(created_by, 1)
                WHERE campaign_key = :campaign_key
            """),
            data,
        )
        return
    await db.execute(
        text("""
            INSERT INTO marketing_campaigns
                (campaign_key, campaign_name, channel, campaign_type, status, body_content, created_by)
            VALUES (:campaign_key, :campaign_name, :channel, :campaign_type, :status, :body_content, 1)
        """),
        data,
    )


async def _upsert_survey(db, data, questions):
    existing = await db.execute(
        text("SELECT id FROM survey_definitions WHERE survey_key = :key"),
        {"key": data["survey_key"]},
    )
    survey_id = existing.scalar_one_or_none()
    if survey_id:
        await db.execute(
            text("""
                UPDATE survey_definitions
                SET survey_name = :survey_name,
                    description = :description,
                    is_active = true
                WHERE id = :id
            """),
            {"id": survey_id, **data},
        )
        await db.execute(
            text("DELETE FROM survey_questions WHERE survey_id = :survey_id"),
            {"survey_id": survey_id},
        )
    else:
        result = await db.execute(
            text("""
                INSERT INTO survey_definitions (survey_key, survey_name, description, is_active)
                VALUES (:survey_key, :survey_name, :description, true)
                RETURNING id
            """),
            data,
        )
        survey_id = result.scalar_one()

    for idx, question in enumerate(questions):
        await db.execute(
            text("""
                INSERT INTO survey_questions
                    (survey_id, question_text, question_type, answer_options, is_required, display_order)
                VALUES (:survey_id, :question_text, :question_type, CAST(:answer_options AS jsonb), true, :display_order)
            """),
            {
                "survey_id": survey_id,
                "question_text": question["question_text"],
                "question_type": question["question_type"],
                "answer_options": json.dumps(question["answer_options"]),
                "display_order": idx,
            },
        )


async def seed():
    async with get_db() as db:
        store_result = await db.execute(text("SELECT id FROM stores WHERE deleted_at IS NULL ORDER BY id"))
        store_ids = [row[0] for row in store_result.all()]
        if not store_ids:
            print("  No active store found. Run seed_stores.py first.")
            return

        # Allergens
        for key, name, severity in ALLERGENS:
            await _upsert_allergen(
                db,
                {"allergen_key": key, "display_name": name, "severity": severity, "key": key},
            )
        print(f"  Upserted {len(ALLERGENS)} allergens")

        # Dietary tags
        for key, name, color in DIETARY_TAGS:
            await _upsert_dietary_tag(
                db,
                {"tag_key": key, "display_name": name, "color_hex": color, "key": key},
            )
        print(f"  Upserted {len(DIETARY_TAGS)} dietary tags")

        # Equipment + maintenance logs per store
        for store_id in store_ids:
            for name, eq_type, serial, manufacturer, model, location in EQUIPMENT:
                result = await db.execute(
                    text("""
                        SELECT id FROM equipment
                        WHERE store_id = :store_id AND serial_number = :serial
                    """),
                    {"store_id": store_id, "serial": serial},
                )
                eq_id = result.scalar_one_or_none()
                if eq_id:
                    await db.execute(
                        text("""
                            UPDATE equipment
                            SET name = :name,
                                equipment_type = :equipment_type,
                                manufacturer = :manufacturer,
                                model = :model,
                                location = :location,
                                status = 'operational',
                                is_active = true
                            WHERE id = :id
                        """),
                        {
                            "id": eq_id,
                            "name": name,
                            "equipment_type": eq_type,
                            "manufacturer": manufacturer,
                            "model": model,
                            "location": location,
                        },
                    )
                else:
                    result = await db.execute(
                        text("""
                            INSERT INTO equipment
                                (store_id, name, equipment_type, serial_number, manufacturer, model, location, status, is_active)
                            VALUES (:store_id, :name, :equipment_type, :serial, :manufacturer, :model, :location, 'operational', true)
                            RETURNING id
                        """),
                        {
                            "store_id": store_id,
                            "name": name,
                            "equipment_type": eq_type,
                            "serial": serial,
                            "manufacturer": manufacturer,
                            "model": model,
                            "location": location,
                        },
                    )
                    eq_id = result.scalar_one()

                # Add a maintenance log if none exists
                log_check = await db.execute(
                    text("SELECT id FROM equipment_maintenance_logs WHERE equipment_id = :eq_id LIMIT 1"),
                    {"eq_id": eq_id},
                )
                if not log_check.scalar_one_or_none():
                    await db.execute(
                        text("""
                            INSERT INTO equipment_maintenance_logs
                                (equipment_id, maintenance_type, status, description, performed_by, cost, started_at, completed_at)
                            VALUES (:eq_id, 'preventive', 'completed', 'Routine monthly check', 'Engineer', 50.00, now() - interval '7 days', now() - interval '7 days')
                        """),
                        {"eq_id": eq_id},
                    )
        print(f"  Upserted {len(EQUIPMENT)} equipment item(s) across {len(store_ids)} store(s)")

        # POS terminals per store (terminal_code is globally unique)
        for store_id in store_ids:
            for code, name, location in POS_TERMINALS:
                store_code = f"{code}-S{store_id}"
                existing = await db.execute(
                    text("SELECT id FROM pos_terminals WHERE terminal_code = :code"),
                    {"code": store_code},
                )
                if existing.scalar_one_or_none():
                    await db.execute(
                        text("""
                            UPDATE pos_terminals
                            SET store_id = :store_id,
                                name = :name,
                                location_label = :location,
                                is_active = true
                            WHERE terminal_code = :code
                        """),
                        {"store_id": store_id, "name": name, "location": location, "code": store_code},
                    )
                else:
                    await db.execute(
                        text("""
                            INSERT INTO pos_terminals (store_id, name, terminal_code, location_label, is_active, created_at, updated_at)
                            VALUES (:store_id, :name, :code, :location, true, now(), now())
                        """),
                        {"store_id": store_id, "name": name, "location": location, "code": store_code},
                    )
        print(f"  Upserted {len(POS_TERMINALS)} POS terminal(s) across {len(store_ids)} store(s)")

        # Marketing campaigns
        for key, name, ctype, channel, status, body in CAMPAIGNS:
            await _upsert_campaign(
                db,
                {
                    "campaign_key": key,
                    "campaign_name": name,
                    "campaign_type": ctype,
                    "channel": channel,
                    "status": status,
                    "body_content": body,
                },
            )
        print(f"  Upserted {len(CAMPAIGNS)} campaign(s)")

        # Promo banners
        voucher_row = await db.execute(
            text("SELECT id FROM voucher_definitions WHERE voucher_code = 'WELCOME10' LIMIT 1")
        )
        welcome_voucher_id = voucher_row.scalar_one_or_none()

        for title, desc, action_type, _ in PROMO_BANNERS:
            existing = await db.execute(
                text("SELECT id FROM promo_banners WHERE title = :title"),
                {"title": title},
            )
            if existing.scalar_one_or_none():
                await db.execute(
                    text("""
                        UPDATE promo_banners
                        SET short_description = :description,
                            action_type = :action_type,
                            voucher_id = :voucher_id,
                            is_active = true
                        WHERE title = :title
                    """),
                    {"title": title, "description": desc, "action_type": action_type, "voucher_id": welcome_voucher_id},
                )
            else:
                await db.execute(
                    text("""
                        INSERT INTO promo_banners (title, short_description, action_type, voucher_id, is_active)
                        VALUES (:title, :description, :action_type, :voucher_id, true)
                    """),
                    {"title": title, "description": desc, "action_type": action_type, "voucher_id": welcome_voucher_id},
                )
        print(f"  Upserted {len(PROMO_BANNERS)} promo banner(s)")

        # Surveys
        for key, name, desc, question_text, qtype, options in SURVEYS:
            await _upsert_survey(
                db,
                {"survey_key": key, "survey_name": name, "description": desc},
                [
                    {
                        "question_text": question_text,
                        "question_type": qtype,
                        "answer_options": {"options": options},
                    }
                ],
            )
        print(f"  Upserted {len(SURVEYS)} survey(s)")

        # Notification templates
        for name, title, ntype, audience in NOTIFICATION_TEMPLATES:
            existing = await db.execute(
                text("SELECT id FROM notification_templates WHERE name = :name"),
                {"name": name},
            )
            if existing.scalar_one_or_none():
                await db.execute(
                    text("""
                        UPDATE notification_templates
                        SET title = :title,
                            body = :body,
                            notification_type = :notification_type,
                            audience_segment = :audience
                        WHERE name = :name
                    """),
                    {
                        "name": name,
                        "title": title,
                        "body": title,
                        "notification_type": ntype,
                        "audience": audience,
                    },
                )
            else:
                await db.execute(
                    text("""
                        INSERT INTO notification_templates (name, title, body, notification_type, audience_segment)
                        VALUES (:name, :title, :body, :notification_type, :audience)
                    """),
                    {
                        "name": name,
                        "title": title,
                        "body": title,
                        "notification_type": ntype,
                        "audience": audience,
                    },
                )
        print(f"  Upserted {len(NOTIFICATION_TEMPLATES)} notification template(s)")


async def main():
    parser = argparse.ArgumentParser(description="Seed content/marketing data")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation")
    parser.add_argument("--force-prod", action="store_true", help="Allow running in production")
    args = parser.parse_args()

    guard_production(args.force_prod)
    if not confirm("Seed content/marketing data?", args.yes):
        print("Aborted.")
        return

    await seed()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
