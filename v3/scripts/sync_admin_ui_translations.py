#!/usr/bin/env python3
"""Sync admin-ui translation keys from the admin portal source code.

Scans src/**/*.{ts,tsx} for t("key") / t('key') / t(key) calls (including the
t(key, "Default") fallback form) and:
- INSERTS missing keys into the admin-ui namespace (en) with the inline
  default text, or a humanized version of the key tail
- DELETES stale auto-seeded keys no longer used anywhere in source
  (keys with is_auto_translated=false — manual edits — are NEVER touched)

Idempotent — safe to run after any admin portal change.

Usage:
    cd v3/backend && python3 ../scripts/sync_admin_ui_translations.py [--prune] [--dry-run]
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import psycopg2

from seed_admin_ui_translations import _db_url

PORTAL_SRC = Path(__file__).resolve().parent.parent / "admin-portal" / "src"
NAMESPACE = "admin-ui"

# t("some.key") / t('some.key') / t("some.key", ...) / t(some.key)
# NOTE: key chars include [ ] — dynamic-route namespaces like content_events_[id].*
CALL_RE = re.compile(r"""\bt\(\s*["']([a-zA-Z0-9_.\[\]-]+)["']""")
# t("some.key", "Inline default")
DEFAULT_RE = re.compile(r"""\bt\(\s*["']([a-zA-Z0-9_.\[\]-]+)["']\s*,\s*["']([^"']+)["']""")
# translation keys look like dotted paths, not single words or junk
# (brackets allowed in ANY segment: dynamic-route namespaces join as
# "content_events_[id].title" — no dot before the bracket)
KEY_RE = re.compile(r"^[a-z][a-zA-Z0-9_\[\]-]*(\.[a-zA-Z0-9_\[\]-]+)+$")


_ACRONYMS = {"rsvp", "otp", "pos", "sku", "qr", "url", "api", "id", "pdf", "csv", "pwa", "byot", "sst", "rm", "kds", "en", "ms", "zh", "ta", "tr"}


def humanize(key: str) -> str:
    tail = key.split(".")[-1].replace("-", " ").replace("_", " ").strip()
    # split camelCase humps: "addLog" -> "add Log"
    tail = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", tail)
    # keep known acronyms/locale codes uppercase: "enable rsvp" -> "Enable RSVP"
    tail = " ".join(w.upper() if w.lower() in _ACRONYMS else w for w in tail.split(" "))
    return tail[:1].upper() + tail[1:] if tail else key


def scan_source() -> dict[str, str]:
    """key -> best source text (inline default wins, else humanized)."""
    keys: dict[str, str] = {}
    for path in sorted(PORTAL_SRC.rglob("*.ts*")):
        text = path.read_text(encoding="utf-8", errors="ignore")
        defaults = dict(DEFAULT_RE.findall(text))
        for key in CALL_RE.findall(text):
            if not KEY_RE.match(key):
                continue
            if key not in keys:
                keys[key] = defaults.get(key, "").strip() or humanize(key)
    return keys


def main():
    parser = argparse.ArgumentParser(description="Sync admin-ui translation keys from portal source")
    parser.add_argument("--prune", action="store_true", help="Delete stale auto-seeded keys not found in source")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    conn = psycopg2.connect(_db_url())
    conn.autocommit = True
    cur = conn.cursor()

    used = scan_source()
    print(f"Scanned {len(used)} keys in {PORTAL_SRC}")

    cur.execute(
        "SELECT id, translation_key, translated_text, is_auto_translated FROM translations WHERE namespace = %s AND locale = 'en'",
        (NAMESPACE,),
    )
    existing = {row[1]: (row[0], row[2], row[3]) for row in cur.fetchall()}
    print(f"DB has {len(existing)} admin-ui/en keys")

    added = 0
    for key, text in sorted(used.items()):
        if key in existing:
            continue
        if args.dry_run:
            print(f"  ADD {key} = {text!r}")
        else:
            cur.execute(
                """
                INSERT INTO translations (namespace, translation_key, locale, translated_text, source_text, is_auto_translated)
                VALUES (%s, %s, 'en', %s, %s, true)
                ON CONFLICT DO NOTHING
                """,
                (NAMESPACE, key, text, text),
            )
        added += 1
    print(f"Added {added} missing keys{' (dry-run)' if args.dry_run else ''}")

    if args.prune:
        stale = [(row[0], k) for k, row in existing.items() if k not in used and row[2]]
        for row_id, key in stale:
            if args.dry_run:
                print(f"  PRUNE {key}")
            else:
                cur.execute("DELETE FROM translations WHERE id = %s", (row_id,))
        print(f"Pruned {len(stale)} stale auto-seeded keys{' (dry-run)' if args.dry_run else ''}")
    else:
        stale_count = sum(1 for k, row in existing.items() if k not in used and row[2])
        print(f"(stale auto-seeded keys present: {stale_count} — run with --prune to remove)")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
