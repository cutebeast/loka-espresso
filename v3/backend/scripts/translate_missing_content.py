#!/usr/bin/env python3
"""Translate ALL translatable content that has no translations yet.

Iterates every table in TRANSLATABLE_ENTITIES, loads active records, and
auto-translates missing texts into all supported locales via DeepSeek. The
translation cache means unchanged texts are free on re-runs — only new or
edited content hits the API. Also purges translation rows pointing at
deleted records (stale refs).

Runs daily via cron (04:23):
    23 4 * * * cd /root/fnb-super-app/v3/backend && .venv/bin/python3 scripts/translate_missing_content.py --yes --force-prod >> logs/translate_missing_cron.log 2>&1

Manual usage:
    cd v3/backend && python3 scripts/translate_missing_content.py --yes --force-prod [--purge-only] [--dry-run]
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select, text

from app.core.database import AsyncSessionLocal
from app.models.base import SoftDeleteMixin
from app.models.bundle_product import BundleCategory, BundleProduct
from app.models.help import HelpArticle
from app.models.info_card import EventCard, InformationCard, ProductCard, PromoBanner, SplashScreen, SystemPage
from app.models.inventory import InventoryCategory, InventoryItem
from app.models.loyalty import LoyaltyTier
from app.models.marketing import MarketingCampaign
from app.models.menu import (
    Allergen,
    DietaryTag,
    EventCategory,
    MenuCategory,
    MenuItem,
    MenuModifierGroup,
    MenuModifierOption,
    TaxCategory,
)
from app.models.notification import AdminNotification, NotificationTemplate
from app.models.reward import RewardCatalog
from app.models.store import Store
from app.models.survey import SurveyDefinition, SurveyQuestion
from app.models.translation import Translation
from app.models.voucher import VoucherDefinition
from app.services.translation import TRANSLATABLE_ENTITIES, auto_translate_record
from scripts._db_utils import confirm, guard_production

MODEL_MAP = {
    "menu_items": MenuItem,
    "menu_categories": MenuCategory,
    "menu_modifier_groups": MenuModifierGroup,
    "menu_modifier_options": MenuModifierOption,
    "allergens": Allergen,
    "dietary_tags": DietaryTag,
    "tax_categories": TaxCategory,
    "loyalty_tiers": LoyaltyTier,
    "reward_catalog": RewardCatalog,
    "voucher_definitions": VoucherDefinition,
    "stores": Store,
    "inventory_items": InventoryItem,
    "inventory_categories": InventoryCategory,
    "information_cards": InformationCard,
    "product_cards": ProductCard,
    "event_cards": EventCard,
    "promo_banners": PromoBanner,
    "marketing_campaigns": MarketingCampaign,
    "notification_templates": NotificationTemplate,
    "admin_notifications": AdminNotification,
    "splash_screens": SplashScreen,
    "system_pages": SystemPage,
    "help_articles": HelpArticle,
    "survey_definitions": SurveyDefinition,
    "survey_questions": SurveyQuestion,
    "bundle_products": BundleProduct,
    "bundle_categories": BundleCategory,
    "event_categories": EventCategory,
}


async def _purge_stale(db, table: str, dry_run: bool) -> int:
    """Delete translation rows whose record_id no longer exists in the table."""
    kwargs = {"table": table}
    stmt = text(
        f"""
        DELETE FROM translations
        WHERE table_name = :table
          AND record_id <> 0
          AND NOT EXISTS (SELECT 1 FROM {table} r WHERE r.id = translations.record_id)
        """
    )
    if dry_run:
        count_stmt = text(
            f"""
            SELECT count(*) FROM translations
            WHERE table_name = :table
              AND record_id <> 0
              AND NOT EXISTS (SELECT 1 FROM {table} r WHERE r.id = translations.record_id)
            """
        )
        result = await db.execute(count_stmt, kwargs)
        return result.scalar() or 0
    result = await db.execute(stmt, kwargs)
    return result.rowcount or 0


async def main():
    parser = argparse.ArgumentParser(description="Translate all untranslated content via DeepSeek")
    parser.add_argument("--yes", action="store_true")
    parser.add_argument("--force-prod", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--purge-only", action="store_true", help="Only purge stale translation rows")
    args = parser.parse_args()

    guard_production(args.force_prod)
    if not confirm("Translate all missing content and purge stale translations?", args.yes):
        print("Aborted.")
        return

    async with AsyncSessionLocal() as db:
        total_written = 0
        for table, model in MODEL_MAP.items():
            # Purge stale translation refs first
            purged = await _purge_stale(db, table, args.dry_run)
            if purged:
                print(f"  [{table}] purged {purged} stale translation rows")
                total_written += 0 if args.dry_run else 0
            if not args.dry_run:
                await db.commit()

            if args.purge_only:
                continue

            columns = TRANSLATABLE_ENTITIES.get(table, [])
            if not columns:
                continue
            stmt = select(model)
            if issubclass(model, SoftDeleteMixin):
                stmt = stmt.where(model.deleted_at.is_(None))
            records = (await db.execute(stmt)).scalars().all()
            written = 0
            for rec in records:
                fields = {}
                for col in columns:
                    val = getattr(rec, col, None)
                    if isinstance(val, str) and val.strip():
                        fields[col] = val
                if not fields:
                    continue
                if not args.dry_run:
                    written += await auto_translate_record(db, table, rec.id, fields)
            print(f"  [{table}] {len(records)} records, {written} translations written")
            total_written += written

        if not args.dry_run:
            await db.commit()
        print(f"Done — {total_written} translations written{' (dry-run)' if args.dry_run else ''}")


if __name__ == "__main__":
    asyncio.run(main())
