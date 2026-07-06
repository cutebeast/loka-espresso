#!/usr/bin/env python3
"""Replace hardcoded 'Loading...' in admin portal pages with translation key."""

import re
from pathlib import Path

ROOT = Path("/root/fnb-super-app/v3/admin-portal/src/app")
TARGET = "Loading..."
KEY = "admin.common.loading"

DEFAULT_FN_RE = re.compile(r"(export default function \w+\([^)]*\)\s*\{)")


def process_file(path: Path) -> bool:
    content = path.read_text()
    if TARGET not in content:
        return False

    if "useTranslation" not in content:
        lines = content.splitlines()
        last_import = -1
        for i, line in enumerate(lines):
            if re.match(r"^\s*import\s", line):
                last_import = i
        lines.insert(last_import + 1, 'import { useTranslation } from "@/lib/i18n";')
        content = "\n".join(lines)

    content = content.replace(f">{TARGET}<", f">{{t(\"{KEY}\")}}<")

    if "const { t } = useTranslation()" not in content:
        m = DEFAULT_FN_RE.search(content)
        if not m:
            print(f"SKIP (no default function): {path}")
            return False
        insert_pos = m.end()
        content = content[:insert_pos] + '\n  const { t } = useTranslation();' + content[insert_pos:]

    path.write_text(content)
    print(f"Updated {path}")
    return True


def main():
    for f in ROOT.rglob("*.tsx"):
        process_file(f)


if __name__ == "__main__":
    main()
