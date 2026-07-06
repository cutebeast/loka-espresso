"""Seed English staff-ui translations so the staff portal login page renders labels.

Run after migrations:
    cd v3/backend && python3 scripts/seed_staff_ui_translations.py
"""

import asyncio
from datetime import datetime, timezone
import sys

sys.path.insert(0, ".")

from sqlalchemy.dialects.postgresql import insert

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.models.translation import Translation


STAFF_UI_EN = {
    "login.title": "Staff Portal",
    "login.subtitle": "Sign in to your store account",
    "login.email_label": "Email",
    "login.pin_label": "PIN",
    "login.store_label": "Store",
    "login.name_label": "Staff Name",
    "login.signin": "Sign In",
    "login.signing_in": "Signing in...",
    "login.store_placeholder": "Select a store",
    "login.name_placeholder": "Select your name",
    "login.select_store_first": "Select a store first",
    "login.loading_staff": "Loading staff...",
    "login.mode_email": "Use email",
    "login.mode_name": "Use staff name",
    "login.error_no_store": "Please select a store",
    "login.error_too_many": "Too many attempts. Try again in {seconds}s",
    "login.error_select_name": "Please select your name",
    "login.error_enter_email": "Please enter your email",
    "login.error_enter_pin": "Please enter your PIN",
}


async def main() -> None:
    settings = get_settings()
    if not settings.database_url:
        raise RuntimeError("database_url is not configured")

    async with AsyncSessionLocal() as db:
        for key, text in STAFF_UI_EN.items():
            stmt = (
                insert(Translation)
                .values(
                    namespace="staff-ui",
                    translation_key=key,
                    locale="en",
                    translated_text=text,
                    source_text=text,
                    is_auto_translated=False,
                )
                .on_conflict_do_update(
                    index_elements=["translation_key", "locale"],
                    set_={
                        "translated_text": text,
                        "source_text": text,
                        "namespace": "staff-ui",
                        "updated_at": datetime.now(timezone.utc),
                    },
                )
            )
            await db.execute(stmt)
        await db.commit()
    print(f"Seeded {len(STAFF_UI_EN)} staff-ui English translations.")


if __name__ == "__main__":
    asyncio.run(main())
