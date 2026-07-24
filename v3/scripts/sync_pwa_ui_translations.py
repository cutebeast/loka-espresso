#!/usr/bin/env python3
"""Seed pwa-ui translations from the customer PWA's static locale JSON files.

The /translations page (PWA tab) edits the pwa-ui namespace, and the
sync-to-json button writes those back to the JSON files the PWA serves — so
the DB namespace must be seeded first. Flattens nested JSON keys
({"menu": {"cart": "Cart"}} -> "menu.cart") and upserts all 5 locales.

Usage: cd v3/backend && python3 ../scripts/sync_pwa_ui_translations.py [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import psycopg2

from seed_admin_ui_translations import _db_url

LOCALES_DIR = Path(__file__).resolve().parent.parent / "customer-pwa" / "src" / "locales"
NAMESPACE = "pwa-ui"
LOCALES = ["en", "ms", "zh", "ta", "tr"]


def flatten(obj: dict, prefix: str = "") -> dict[str, str]:
    out: dict[str, str] = {}
    for key, value in obj.items():
        full = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            out.update(flatten(value, full))
        else:
            out[full] = str(value)
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    conn = psycopg2.connect(_db_url())
    conn.autocommit = True
    cur = conn.cursor()

    en_strings = flatten(json.loads((LOCALES_DIR / "en.json").read_text(encoding="utf-8")))

    for locale in LOCALES:
        path = LOCALES_DIR / f"{locale}.json"
        strings = flatten(json.loads(path.read_text(encoding="utf-8")))
        cur.execute(
            "SELECT translation_key FROM translations WHERE namespace = %s AND locale = %s",
            (NAMESPACE, locale),
        )
        existing = {r[0] for r in cur.fetchall()}
        added = 0
        for key, value in sorted(strings.items()):
            if key in existing:
                continue
            if args.dry_run:
                continue
            cur.execute(
                """
                INSERT INTO translations (namespace, translation_key, locale, translated_text, source_text, is_auto_translated)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (NAMESPACE, key, locale, value, en_strings.get(key, value), locale != "en"),
            )
            added += 1
        print(f"[{locale}] {len(strings)} keys in file, {len(existing)} in DB, added {added}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
