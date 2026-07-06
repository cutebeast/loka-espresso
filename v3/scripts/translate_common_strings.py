#!/usr/bin/env python3
"""Bulk-replace common hardcoded UI strings in admin portal page files with t() calls."""

import re
from pathlib import Path

ROOT = Path("/root/fnb-super-app/v3/admin-portal/src/app")

# source text -> replacement JSX expression fragment
REPLACEMENTS = {
    ">Save<": '{t("admin.common.save")}',
    ">Cancel<": '{t("admin.common.cancel")}',
    ">Create<": '{t("admin.common.create")}',
    ">Update<": '{t("admin.common.update")}',
    ">Delete<": '{t("admin.common.delete")}',
    ">Edit<": '{t("admin.common.edit")}',
    ">Add<": '{t("admin.common.add")}',
    ">Remove<": '{t("admin.common.remove")}',
    ">Close<": '{t("admin.common.close")}',
    ">Back<": '{t("admin.common.back")}',
    ">Submit<": '{t("admin.common.submit")}',
    ">Actions<": '{t("admin.common.actions")}',
    ">Status<": '{t("admin.common.status")}',
    ">Name<": '{t("admin.common.name")}',
    ">Description<": '{t("admin.common.description")}',
    ">Email<": '{t("admin.common.email")}',
    ">Phone<": '{t("admin.common.phone")}',
    ">Created<": '{t("admin.common.created")}',
    ">No results<": '{t("admin.common.noResults")}',
    ">No data<": '{t("admin.common.noData")}',
    ">Yes<": '{t("admin.common.yes")}',
    ">No<": '{t("admin.common.no")}',
    ">Confirm<": '{t("admin.common.confirm")}',
    ">Active<": '{t("admin.common.active")}',
    ">Inactive<": '{t("admin.common.inactive")}',
    ">Enabled<": '{t("admin.common.enabled")}',
    ">Disabled<": '{t("admin.common.disabled")}',
    ">Required<": '{t("admin.common.required")}',
    'placeholder="Search..."': 'placeholder={t("admin.common.searchPlaceholder")}',
    'placeholder="Search"': 'placeholder={t("admin.common.searchPlaceholder")}',
    'placeholder="Search..."': 'placeholder={t("admin.common.searchPlaceholder")}',
    'aria-label="Search"': 'aria-label={t("admin.common.search")}',
}

DEFAULT_FN_RE = re.compile(r"(export default function \w+\([^)]*\)\s*\{)")


def process_file(path: Path) -> bool:
    content = path.read_text()
    original = content

    # Skip files that already import useTranslation (avoid double injection)
    has_translation = "useTranslation" in content

    replaced = False
    for src, repl in REPLACEMENTS.items():
        if src in content:
            content = content.replace(src, repl)
            replaced = True

    if not replaced:
        return False

    if not has_translation:
        # Add import after last import
        lines = content.splitlines()
        last_import = -1
        for i, line in enumerate(lines):
            if re.match(r"^\s*import\s", line):
                last_import = i
        lines.insert(last_import + 1, 'import { useTranslation } from "@/lib/i18n";')
        content = "\n".join(lines)

    # Ensure const { t } = useTranslation() exists in default export function
    if "const { t } = useTranslation()" not in content:
        m = DEFAULT_FN_RE.search(content)
        if not m:
            # Can't safely inject; skip to avoid breaking file
            print(f"SKIP (no default function): {path}")
            path.write_text(original)
            return False
        insert_pos = m.end()
        content = content[:insert_pos] + '\n  const { t } = useTranslation();' + content[insert_pos:]

    path.write_text(content)
    print(f"Updated {path}")
    return True


def main():
    for f in sorted(ROOT.rglob("*.tsx")):
        if "node_modules" in str(f):
            continue
        process_file(f)


if __name__ == "__main__":
    main()
