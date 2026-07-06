#!/usr/bin/env python3
"""Fix broken JSX tag boundaries introduced by bulk string replacement."""

import re
from pathlib import Path

ROOT = Path("/root/fnb-super-app/v3/admin-portal/src/app")


def fix_file(path: Path) -> bool:
    content = path.read_text()
    original = content
    content = re.sub(r"<([a-zA-Z][a-zA-Z0-9]*)\{t\(", r"<\1>{t(", content)
    content = re.sub(r"\)\}/([a-zA-Z][a-zA-Z0-9]*)>", r")}</\1>", content)
    # Fix cases where the closing brace was stripped by the first fix pass
    content = re.sub(r"\{t\(\"([^\"]+)\"\)</([a-zA-Z][a-zA-Z0-9]*)>", r'{t("\1")}</\2>', content)
    if content != original:
        path.write_text(content)
        return True
    return False


def main():
    for f in ROOT.rglob("*.tsx"):
        if fix_file(f):
            print(f"Fixed {f}")


if __name__ == "__main__":
    main()
