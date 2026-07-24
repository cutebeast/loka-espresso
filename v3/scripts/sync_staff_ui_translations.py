#!/usr/bin/env python3
"""Sync staff-ui translations from the staff portal's static translations.ts.

The staff portal fetches translations from /public/translations/ui (namespace
staff-ui) and falls back to its bundled English dict — so the DB namespace is
the master for all 5 locales. This script parses translations.ts directly and
upserts every English key (keeps existing/manual rows; is_auto_translated only
for new inserts).

Usage: cd v3/backend && python3 ../scripts/sync_staff_ui_translations.py [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import psycopg2

from seed_admin_ui_translations import _db_url

TS_FILE = Path(__file__).resolve().parent.parent / "staff-portal" / "src" / "lib" / "translations.ts"
NAMESPACE = "staff-ui"

# entries look like:  "some.key": "Some text",
ENTRY_RE = re.compile(r'^\s*"([a-zA-Z0-9_.-]+)":\s*"((?:[^"\\]|\\.)*)"\s*,?\s*$', re.M)


def parse_translations_ts() -> dict[str, str]:
    text = TS_FILE.read_text(encoding="utf-8")
    out: dict[str, str] = {}
    for key, raw in ENTRY_RE.findall(text):
        try:
            value = json.loads(f'"{raw}"')
        except json.JSONDecodeError:
            value = raw
        out[key] = value
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    strings = parse_translations_ts()
    print(f"Parsed {len(strings)} keys from {TS_FILE}")

    conn = psycopg2.connect(_db_url())
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("SELECT translation_key FROM translations WHERE namespace = %s AND locale = 'en'", (NAMESPACE,))
    existing = {r[0] for r in cur.fetchall()}
    print(f"DB has {len(existing)} staff-ui/en keys")

    added = 0
    for key, value in sorted(strings.items()):
        if key in existing:
            continue
        if args.dry_run:
            print(f"  ADD {key} = {value!r}")
        else:
            cur.execute(
                """
                INSERT INTO translations (namespace, translation_key, locale, translated_text, source_text, is_auto_translated)
                VALUES (%s, %s, 'en', %s, %s, true)
                ON CONFLICT DO NOTHING
                """,
                (NAMESPACE, key, value, value),
            )
        added += 1
    print(f"Added {added} keys{' (dry-run)' if args.dry_run else ''}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
