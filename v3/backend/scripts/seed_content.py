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
        "eco-campaign-byot",
        "Eco-Campaign (BYOT)",
        "promotional",
        "in_app",
        "active",
        "Bring your own tumbler and earn bonus points on every order! Bloom & Origin members earn 2x points, Reserve members earn 3x points. Better for the planet, better for you.",
    ),
]

PROMO_BANNERS = [
    ("Welcome Reward — RM5 Off", "New member? Enjoy RM5 off your first purchase with your welcome voucher!", "read_claim", None),
    ("Eco-Campaign: BYOT & Earn", "Bring your own tumbler — earn 2x points (3x for Reserve members) on every order.", "read_claim", None),
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
            text("SELECT id FROM voucher_definitions WHERE voucher_code = 'WELCOME-RM5' LIMIT 1")
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

        # Event cards — discovery/marketing for the paid classes (bookable as
        # menu items under "Experiences & Workshops"; payment via checkout).
        EVENT_CARDS = [
            {
                "slug": "coffee-omakase-experience",
                "title": "Coffee Omakase Experience",
                "short_description": "A curated multi-course coffee tasting guided by our baristas — from RM 299/pax.",
                "long_description": "Full multi-course coffee tasting with standard food pairing. 2-pax package (RM 399/pax) includes FREE single-origin beans, limited edition mugs and exclusive vouchers. 1-pax VIP (RM 488) includes upgraded premium food pairing, limited edition beans and an exclusive gift pack. Reserve members can also redeem this experience for 5,980 points.",
                "image_url": "/uploads/images/menu/experiences/kahve-i-turk.jpg",
                "location": "Loka Espresso (PKL)",
                "position": 1,
            },
            {
                "slug": "turkish-sand-brew-workshop",
                "title": "Turkish Sand Brew Workshop",
                "short_description": "Hands-on sand brewing class with Turkish delight tasting — RM 199/pax (4-pax package).",
                "long_description": "Learn the art of traditional Turkish sand brewing in a guided hands-on session, with food tasting of Turkish delights. 4-pax package at RM 199 per person. Reserve members can also redeem this workshop for 3,980 points.",
                "image_url": "/uploads/images/menu/experiences/gozleme.jpg",
                "location": "Loka Espresso (PKL)",
                "position": 2,
            },
            {
                "slug": "roastery-workshop",
                "title": "Roastery Workshop",
                "short_description": "Roastery demo, equipment experience and coffee tasting — RM 199/pax (4-pax package).",
                "long_description": "Go behind the scenes with a roastery demonstration, hands-on equipment experience and guided coffee tasting. 4-pax package at RM 199 per person.",
                "image_url": "/uploads/images/menu/experiences/espresso.jpg",
                "location": "Loka Espresso (PKL)",
                "position": 3,
            },
        ]
        for card in EVENT_CARDS:
            await db.execute(
                text("""
                    INSERT INTO event_cards (slug, title, short_description, long_description, image_url,
                                             action_url, action_label, is_active, position, location, rsvp_enabled)
                    VALUES (:slug, :title, :short_description, :long_description, :img, '#menu?cat=experiences', 'Book Now', true, :position, :location, false)
                    ON CONFLICT (slug) DO UPDATE SET
                        title = EXCLUDED.title,
                        short_description = EXCLUDED.short_description,
                        long_description = EXCLUDED.long_description,
                        image_url = EXCLUDED.image_url,
                        action_url = EXCLUDED.action_url,
                        action_label = EXCLUDED.action_label,
                        is_active = true,
                        position = EXCLUDED.position,
                        location = EXCLUDED.location
                """),
                {**card, "img": card["image_url"]},
            )
        print(f"  Upserted {len(EVENT_CARDS)} event card(s)")

        # System pages (legal content served on the PWA #legal page)
        SYSTEM_PAGES = [
            {
                "page_key": "terms",
                "title": "Terms & Conditions",
                "body_text": """Welcome to Loka Espresso. By using our app and services, you agree to these terms.

1. General
Loka Espresso ("we", "us") operates this mobile application and loyalty programme for our cafés. By creating an account, you confirm the information you provide is accurate.

2. Loyalty Programme
- Membership is free. Tiers (Bloom, Origin, Reserve) are awarded based on eligible spending within a rolling 12-month period and reviewed every 12 months.
- Points are earned on eligible purchases only and may exclude gift cards, vouchers and selected promotions.
- Points can be redeemed for rewards listed in the app's Rewards Marketplace while stocks last.
- Birthday rewards are available once per calendar year and are non-transferable.
- Unless otherwise stated, member promotions cannot be combined with other discounts or vouchers.
- We may amend tier benefits, qualifying spend and programme terms with prior notice.

3. Orders & Payment
- Prices are in Ringgit Malaysia (RM) and may change without notice. Unless stated otherwise, prices exclude taxes.
- Orders placed through the app are subject to acceptance and availability. Class/workshop bookings are subject to session capacity.
- Refunds are handled per store policy; contact the store for assistance.

4. Wallet
- Wallet credit is non-refundable, non-transferable and not redeemable for cash.

5. Acceptable Use
- Do not misuse the app, attempt fraud, or interfere with our systems. Accounts involved in abuse may be suspended.

6. Liability
- The app is provided "as is". To the extent permitted by law, we are not liable for indirect losses arising from its use.

7. Contact
Loka Espresso, Pavilion Kuala Lumpur. Reach us via the Help & Support section in the app.""",
            },
            {
                "page_key": "privacy",
                "title": "Privacy Policy",
                "body_text": """Your privacy matters to us. This policy explains what Loka Espresso collects and why.

1. What We Collect
- Account details: name, phone number, email (if provided), date of birth (for birthday rewards).
- Order and transaction history, loyalty activity, wallet transactions.
- Device information and push-notification tokens.
- Approximate location (only when you grant permission, for store services).

2. How We Use It
- To operate your account, orders, reservations, class bookings, wallet and loyalty rewards.
- To send service messages (order updates) and, with your consent, marketing communications.
- To improve our menu, stores and app experience.

3. Sharing
- We do not sell your personal data. It is shared only with service providers that operate our platform (payment, messaging, hosting) under confidentiality obligations.

4. Retention & Security
- Data is kept only as long as needed for the purposes above and protected with industry-standard safeguards.

5. Your Rights
- You may access, correct or request deletion of your personal data, and opt out of marketing at any time via the app settings or Help & Support.

6. Contact
For privacy questions, contact us via the Help & Support section in the app.""",
            },
        ]
        for page in SYSTEM_PAGES:
            await db.execute(
                text("""
                    INSERT INTO system_pages (page_key, title, body_text, is_active)
                    VALUES (:page_key, :title, :body, true)
                    ON CONFLICT (page_key) DO UPDATE SET
                        title = EXCLUDED.title,
                        body_text = EXCLUDED.body_text,
                        is_active = true
                """),
                {"page_key": page["page_key"], "title": page["title"], "body": page["body_text"]},
            )
        print(f"  Upserted {len(SYSTEM_PAGES)} system page(s)")

        # PWA splash screen (no unique constraint on screen_name — lookup-then-write)
        existing = await db.execute(
            text("SELECT id FROM splash_screens WHERE screen_name = 'welcome-splash' AND deleted_at IS NULL")
        )
        splash_id = existing.scalar_one_or_none()
        if splash_id:
            await db.execute(
                text("""
                    UPDATE splash_screens SET title = 'Welcome to Loka Espresso',
                        subtitle = 'Specialty coffee, Turkish flavours, and rewards in every cup.',
                        image_url = '/uploads/images/menu/cafe-specialty-coffee/kahve-i-turk.jpg',
                        is_active = true, deleted_at = NULL
                    WHERE id = :id
                """),
                {"id": splash_id},
            )
        else:
            await db.execute(
                text("""
                    INSERT INTO splash_screens (screen_name, title, subtitle, image_url, show_frequency, dismissible, is_active)
                    VALUES ('welcome-splash', 'Welcome to Loka Espresso', 'Specialty coffee, Turkish flavours, and rewards in every cup.', '/uploads/images/menu/cafe-specialty-coffee/kahve-i-turk.jpg', 'once_per_session', true, true)
                """),
            )
        print("  Upserted 1 splash screen")

        # Information cards
        INFO_CARDS = [
            {
                "title": "Our Story",
                "short_description": "Specialty coffee meets Turkish hospitality — right here in Kuala Lumpur.",
                "long_description": "Loka Espresso began with a simple idea: great coffee brings people together. From our signature espresso to Turkish sand brews, pide, meze and baklava, everything we serve is crafted with care — and everything is halal. Join our loyalty family and let every cup count.",
                "position": 1,
            },
            {
                "title": "100% Halal, Always",
                "short_description": "Every item on our menu is halal — no compromises.",
                "long_description": "From chicken sausage to chicken bacon bits, every ingredient is sourced and prepared to halal standards. If you have allergies or dietary needs, tell our staff — we are happy to help.",
                "position": 2,
            },
        ]
        for card in INFO_CARDS:
            existing = await db.execute(
                text("SELECT id FROM information_cards WHERE title = :title"),
                {"title": card["title"]},
            )
            if existing.scalar_one_or_none():
                await db.execute(
                    text("UPDATE information_cards SET short_description = :short, long_description = :long, is_active = true, position = :position WHERE title = :title"),
                    {"short": card["short_description"], "long": card["long_description"], "position": card["position"], "title": card["title"]},
                )
            else:
                await db.execute(
                    text("""
                        INSERT INTO information_cards (title, short_description, long_description, is_active, position)
                        VALUES (:title, :short, :long, true, :position)
                    """),
                    {"title": card["title"], "short": card["short_description"], "long": card["long_description"], "position": card["position"]},
                )
        print(f"  Upserted {len(INFO_CARDS)} information card(s)")

        # Product cards (featured on the PWA home page)
        PRODUCT_CARDS = [
            {"slug": "kahve-i-turk", "title": "Kahve-i Türk", "short_description": "Our specialty Turkish brew — rich, smooth, unforgettable.", "image_url": "/uploads/images/menu/cafe-specialty-coffee/kahve-i-turk.jpg", "price": 24.00, "position": 1},
            {"slug": "mother-earth", "title": "Mother Earth", "short_description": "The Loka signature layered specialty drink.", "image_url": "/uploads/images/menu/loka-specialty/mother-earth.jpg", "price": 26.00, "position": 2},
            {"slug": "baklava-sets", "title": "Baklava Sets", "short_description": "Layered filo with pistachio or walnut — gift-ready boxes from RM 24.", "image_url": "/uploads/images/menu/baklava/pistachio-baklava.jpg", "price": 24.00, "position": 3},
        ]
        for card in PRODUCT_CARDS:
            await db.execute(
                text("""
                    INSERT INTO product_cards (slug, title, short_description, image_url, price, action_url, action_label, is_active, position)
                    VALUES (:slug, :title, :short, :img, :price, '#menu', 'Order Now', true, :position)
                    ON CONFLICT (slug) DO UPDATE SET
                        title = EXCLUDED.title,
                        short_description = EXCLUDED.short_description,
                        image_url = EXCLUDED.image_url,
                        price = EXCLUDED.price,
                        action_url = EXCLUDED.action_url,
                        action_label = EXCLUDED.action_label,
                        is_active = true,
                        position = EXCLUDED.position
                """),
                {"slug": card["slug"], "title": card["title"], "short": card["short_description"], "img": card["image_url"], "price": card["price"], "position": card["position"]},
            )
        print(f"  Upserted {len(PRODUCT_CARDS)} product card(s)")


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
