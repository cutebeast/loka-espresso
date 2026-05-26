"""
Sync DB translations to PWA static JSON locale files.

Usage:
   cd v3/backend && python scripts/sync_translations_to_json.py

Reads all pwa-ui translations from the database and writes them to
customer-pwa/src/locales/{locale}.json with proper nested structure.
EN is skipped (en.json is the source/baseline — kept as-is).
"""
import json
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.database import AsyncSessionLocal
from app.models.translation import Translation
from sqlalchemy import select
import asyncio

CUSTOMER_PWA_LOCALES = os.path.join(
    os.path.dirname(__file__), "..", "..", "customer-pwa", "src", "locales"
)

LOCALES = ["ms", "zh", "ta", "tr"]


def set_nested(d: dict, key: str, value: str):
    """Set a dot-notation key into a nested dict: 'common.save' -> d['common']['save']."""
    parts = key.split(".")
    current = d
    for part in parts[:-1]:
        if part not in current:
            current[part] = {}
        current = current[part]
    current[parts[-1]] = value


async def main():
    async with AsyncSessionLocal() as db:
        for locale in LOCALES:
            result = await db.execute(
                select(Translation.translation_key, Translation.translated_text)
                .where(
                    Translation.namespace == "pwa-ui",
                    Translation.locale == locale,
                    Translation.translated_text.isnot(None),
                    Translation.translated_text != "",
                )
            )
            rows = result.all()

            # Build nested dict from flat keys
            nested: dict = defaultdict(dict)
            for key, text in rows:
                set_nested(nested, key, text)

            # Sort keys at each level for consistent output
            def sort_dict(d: dict) -> dict:
                return {k: sort_dict(v) if isinstance(v, dict) else v for k, v in sorted(d.items())}

            sorted_nested = sort_dict(dict(nested))

            out_path = os.path.join(CUSTOMER_PWA_LOCALES, f"{locale}.json")
            os.makedirs(os.path.dirname(out_path), exist_ok=True)

            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(sorted_nested, f, ensure_ascii=False, indent=2)
                f.write("\n")

            print(f"[{locale}] {len(rows)} keys → {out_path}")

    # Bump version.json so PWA service worker detects update
    import time
    version_path = os.path.join(CUSTOMER_PWA_LOCALES, "..", "..", "public", "version.json")
    version_path = os.path.abspath(version_path)
    try:
        with open(version_path, "r") as f:
            info = json.load(f)
        info["builtAt"] = int(time.time() * 1000)
        from datetime import datetime, timezone
        info["updatedAt"] = datetime.now(timezone.utc).isoformat()
        with open(version_path, "w") as f:
            json.dump(info, f, indent=2)
            f.write("\n")
        print(f"Version bumped: {info.get('version')} → builtAt={info['builtAt']}")
    except Exception as e:
        print(f"Version bump failed: {e}")

    print("\nDone. Rebuild customer-pwa for changes to take effect.")

    # Auto-rebuild PWA
    import subprocess
    pwa_dir = os.path.abspath(os.path.join(CUSTOMER_PWA_LOCALES, "..", ".."))
    print(f"\nRebuilding PWA at {pwa_dir}...")
    build = subprocess.run(["npm", "run", "build"], cwd=pwa_dir, capture_output=True, text=True)
    if build.returncode == 0:
        print("PWA rebuild OK")
        # Restart PM2
        subprocess.run(["pm2", "restart", "customer-pwa-v3"], capture_output=True)
        print("PWA restarted")
    else:
        print(f"Rebuild failed: {build.stderr[-300:]}")


if __name__ == "__main__":
    asyncio.run(main())
