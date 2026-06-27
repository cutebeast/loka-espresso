#!/usr/bin/env python3
"""Seed sample customers and wallets (dev/test only).

This script is intended for local development and CI; it will not run in
production unless --force-prod is supplied.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text

from scripts._db_utils import confirm, get_db, guard_production


SAMPLE_CUSTOMERS = [
    {"email": "demo@lokaespresso.my", "display_name": "Demo Customer", "wallet_balance": 50.00},
    {"email": "vip@lokaespresso.my", "display_name": "VIP Customer", "wallet_balance": 200.00},
]


async def seed():
    async with get_db() as db:
        for cust in SAMPLE_CUSTOMERS:
            existing = await db.execute(
                text("SELECT id FROM customers WHERE email_address = :email"),
                {"email": cust["email"]},
            )
            if existing.all():
                print(f"  Customer '{cust['email']}' already exists")
                continue

            result = await db.execute(
                text("""
                    INSERT INTO customers (email_address, display_name, is_active)
                    VALUES (:email, :display_name, true)
                    RETURNING id
                """),
                {"email": cust["email"], "display_name": cust["display_name"]},
            )
            customer_id = result.scalar_one()

            wallet_result = await db.execute(
                text("""
                    INSERT INTO wallets (customer_id, currency_code)
                    VALUES (:customer_id, 'MYR')
                    RETURNING id
                """),
                {"customer_id": customer_id},
            )
            wallet_id = wallet_result.scalar_one()

            if cust["wallet_balance"]:
                await db.execute(
                    text("""
                        INSERT INTO wallet_ledger_entries
                            (wallet_id, entry_type, amount, running_balance, description, reference_type)
                        VALUES (:wallet_id, 'credit', :amount, :amount, 'Seed top-up', 'topup')
                    """),
                    {"wallet_id": wallet_id, "amount": cust["wallet_balance"]},
                )

            print(f"  Created customer '{cust['display_name']}' with wallet balance {cust['wallet_balance']}")


async def main():
    parser = argparse.ArgumentParser(description="Seed sample customers")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation")
    parser.add_argument("--force-prod", action="store_true", help="Allow running in production")
    args = parser.parse_args()

    guard_production(args.force_prod)
    if not confirm("Seed sample customers and wallets?", args.yes):
        print("Aborted.")
        return

    await seed()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
