#!/usr/bin/env python3
"""Replace hardcoded 'All Stores' with a translation call in admin portal pages."""

import re
from pathlib import Path

ROOT = Path("/root/fnb-super-app/v3/admin-portal/src")
TARGET = "All Stores"
KEY = "admin.common.allStores"


def process_file(path: Path) -> bool:
    content = path.read_text()
    if TARGET not in content:
        return False

    # Add import if missing
    if "useTranslation" not in content:
        # Insert after the last import statement
        lines = content.splitlines()
        last_import = -1
        for i, line in enumerate(lines):
            if re.match(r"^\s*import\s", line):
                last_import = i
        lines.insert(last_import + 1, 'import { useTranslation } from "@/lib/i18n";')
        content = "\n".join(lines)

    # Replace string occurrences inside JSX text nodes
    content = content.replace(f">{TARGET}<", f">{{t(\"{KEY}\")}}<")

    # Add const { t } = useTranslation(); in default export function if not present
    if "const { t } = useTranslation()" not in content:
        # Find default export function body start
        m = re.search(r"(export default function \w+\([^)]*\)\s*\{)", content)
        if m:
            insert_pos = m.end()
            content = content[:insert_pos] + f'\n  const {{ t }} = useTranslation();' + content[insert_pos:]

    path.write_text(content)
    return True


def main():
    files = [
        ROOT / "app/reports/page.tsx",
        ROOT / "app/equipment/page.tsx",
        ROOT / "app/equipment/reports/page.tsx",
        ROOT / "app/hygiene/page.tsx",
        ROOT / "app/staff/page.tsx",
        ROOT / "app/reservations/page.tsx",
        ROOT / "app/orders/page.tsx",
        ROOT / "app/inventory/purchase-orders/page.tsx",
        ROOT / "app/refunds/page.tsx",
        ROOT / "app/staff/tips/page.tsx",
    ]
    for f in files:
        if process_file(f):
            print(f"Updated {f}")


if __name__ == "__main__":
    main()
