#!/usr/bin/env python3
"""Form ↔ schema contract check (round 35 prevention).

Catches the silent-drop bug class: an admin/staff form sends a field the
backend request schema does not declare — pydantic's extra="ignore" silently
discards it and the data never lands (allergen color_hex, table section,
employee_id, store special_hours...).

How it works:
1. Imports the FastAPI app and maps POST/PATCH/PUT routes to their request-body
   pydantic model fields (names + aliases).
2. Statically scans portal form pages for api.post/patch calls and extracts
   the payload keys they send: spread state objects ({...form} → state keys)
   plus explicit `payload.key =` assignments and object-literal bodies.
3. Reports payload keys missing from the route's schema.

Not a proof — a lint. Some findings are intentional client-only state; tune
ALLOWLIST below. Exit 1 on findings (wired into check-all.sh).

Usage: v3/scripts/check_form_schema_contract.py [--portal admin-portal|staff-portal]
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

BACKEND = Path("/root/fnb-super-app/v3/backend")
PORTALS = {
    "admin-portal": Path("/root/fnb-super-app/v3/admin-portal/src/app"),
    "staff-portal": Path("/root/fnb-super-app/v3/staff-portal/src/app"),
}

# Client-only state keys that legitimately never belong to a payload.
ALLOWLIST_KEYS = {
    "saving", "loading", "error", "msg", "message", "isError", "uploading",
    "showModal", "replyModal", "replyText", "replySubmitting", "replyError",
    "imagePreview", "previewUrl", "confirmDelete", "searchQuery", "activeTab",
    "activeLocale", "tr", "translations", "stores", "categories", "menuItems",
    "bundles", "vouchers", "modifiers", "allergens", "dietaryTags",
    "inventoryItems", "tierOptions", "staffRoles", "selectedStore",
}
# Route+key pairs verified intentional (extend after review, with a comment).
ALLOWLIST_PAIRS: set[tuple[str, str]] = {
    # content/products/new posts dead start_date/end_date state (no UI inputs) — benign
    ("POST /admin/product-cards", "start_date"),
    ("POST /admin/product-cards", "end_date"),
    # lucky-draw page reuses one `body` variable for campaign+segment calls — static
    # analysis merges them; both payloads verified correct by hand
    ("POST /admin/lucky-draw/campaign", "color_hex"),
    ("POST /admin/lucky-draw/campaign", "label"),
    ("POST /admin/lucky-draw/campaign", "probability_weight"),
    ("POST /admin/lucky-draw/campaign", "sort_order"),
    ("POST /admin/lucky-draw/campaign", "voucher_definition_id"),
    ("PUT /admin/lucky-draw/campaign/{id}", "color_hex"),
    ("PUT /admin/lucky-draw/campaign/{id}", "label"),
    ("PUT /admin/lucky-draw/campaign/{id}", "probability_weight"),
    ("PUT /admin/lucky-draw/campaign/{id}", "sort_order"),
    ("PUT /admin/lucky-draw/campaign/{id}", "voucher_definition_id"),
    ("POST /admin/lucky-draw/campaigns/{id}/segments", "description"),
    ("POST /admin/lucky-draw/campaigns/{id}/segments", "draw_type"),
    ("POST /admin/lucky-draw/campaigns/{id}/segments", "end_date"),
    ("POST /admin/lucky-draw/campaigns/{id}/segments", "max_segments"),
    ("POST /admin/lucky-draw/campaigns/{id}/segments", "spend_per_ticket_cents"),
    ("POST /admin/lucky-draw/campaigns/{id}/segments", "spin_interval_days"),
    ("POST /admin/lucky-draw/campaigns/{id}/segments", "spins_per_day"),
    ("POST /admin/lucky-draw/campaigns/{id}/segments", "start_date"),
    ("POST /admin/lucky-draw/campaigns/{id}/segments", "title"),
    ("PUT /admin/lucky-draw/segments/{id}", "description"),
    ("PUT /admin/lucky-draw/segments/{id}", "draw_type"),
    ("PUT /admin/lucky-draw/segments/{id}", "end_date"),
    ("PUT /admin/lucky-draw/segments/{id}", "max_segments"),
    ("PUT /admin/lucky-draw/segments/{id}", "spend_per_ticket_cents"),
    ("PUT /admin/lucky-draw/segments/{id}", "spin_interval_days"),
    ("PUT /admin/lucky-draw/segments/{id}", "spins_per_day"),
    ("PUT /admin/lucky-draw/segments/{id}", "start_date"),
    ("PUT /admin/lucky-draw/segments/{id}", "title"),
    # equipment page has two `const payload` (equipment save + maintenance log) —
    # merged by static analysis; both payloads verified correct by hand
    ("PATCH /admin/equipment/{id}", "started_at"),
    ("PATCH /admin/equipment/{id}", "completed_at"),
    # equipment page: two `const payload` (equipment save + maintenance log form
    # with its own cost) — static analysis merges them; log fields go to
    # /maintenance-logs (verified). cost lives on equipment_maintenance_logs.
    ("PATCH /admin/equipment/{id}", "cost"),
}

STATE_OBJ_RE = re.compile(
    r"const \[(?P<var>[A-Za-z_$][\w$]*)\s*,\s*[\w$]+\]\s*=\s*useState(?:<[^>]*>)?\(\{(?P<body>.*?)\}\s*(?:as\s+[\w<>\[\]]+)?\)\s*;",
    re.S,
)
KEY_RE = re.compile(r"^\s*(?:(?:\.\.\.[\w$]+)|([A-Za-z_$][\w$]*)\s*:|([A-Za-z_$][\w$]*)\s*,)", re.M)
CALL_RE = re.compile(r"api\.(?P<method>post|patch|put)\s*(?:<[^>]*>)?\(")


def _balanced(src: str, start: int) -> str:
    """Return the balanced-paren expression starting at src[start] ('(')."""
    depth = 0
    for i in range(start, len(src)):
        ch = src[i]
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return src[start + 1 : i]
    return src[start + 1 :]


def _top_split(args: str) -> list[str]:
    """Split an argument list on top-level commas."""
    parts, depth, cur = [], 0, ""
    for ch in args:
        if ch in "{[(":
            depth += 1
        elif ch in "}])":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    if cur.strip():
        parts.append(cur)
    return parts


def _object_keys(obj_src: str) -> set[str]:
    """Top-level keys of an object literal."""
    keys: set[str] = set()
    depth = 0
    top = ""
    for ch in obj_src:
        if ch in "{[(":
            depth += 1
        elif ch in "}])":
            depth -= 1
        top += ch if depth >= 0 else " "
    for km in KEY_RE.finditer(top):
        k = km.group(1) or km.group(2)
        if k:
            keys.add(k)
    return keys


def _resolve_var_keys(src: str, var: str) -> set[str]:
    """Resolve the keys a variable contributes to a payload."""
    keys: set[str] = set()
    # state variable?
    if re.search(rf"const \[{re.escape(var)}\s*,", src):
        keys |= state_keys(src, var)
    # alias/custom object: const X = { ...form, k: v }  or  const X = {k: v}
    for m in re.finditer(rf"const {re.escape(var)}[^=]*=\s*\{{(?P<body>.*?)\}}\s*;", src, re.S):
        body = m.group("body")
        keys |= _object_keys(body)
        for sm in re.finditer(r"\.\.\.(\w+)", body):
            keys |= _resolve_var_keys(src, sm.group(1))
    # later assignments: X.key = ...
    keys |= set(re.findall(rf"\b{re.escape(var)}\.([A-Za-z_$][\w$]*)\s*=", src))
    return keys


def call_payload_keys(src: str, call_start: int) -> set[str]:
    """Extract the payload keys for ONE api call at src[call_start]."""
    args = _balanced(src, call_start)
    parts = _top_split(args)
    if len(parts) < 2:
        return set()
    body = parts[1].strip()
    keys: set[str] = set()
    if body.startswith("{"):
        keys |= _object_keys(body)
        for sm in re.finditer(r"\.\.\.(\w+)", body):
            keys |= _resolve_var_keys(src, sm.group(1))
    else:
        m = re.match(r"^([A-Za-z_$][\w$]*)$", body)
        if m:
            keys |= _resolve_var_keys(src, m.group(1))
    return keys


def route_schemas() -> dict[tuple[str, str], set[str]]:
    """Map (method, path) → request-body field names (+aliases) from the app."""
    import os
    os.chdir(BACKEND)  # settings.upload_dir is relative to backend/
    sys.path.insert(0, str(BACKEND))
    from app.main import app  # noqa: E402

    out: dict[tuple[str, str], set[str]] = {}
    for route in app.routes:
        methods = getattr(route, "methods", None)
        path = getattr(route, "path", "")
        if not methods or not path.startswith("/api/"):
            continue
        body_field = getattr(route, "body_field", None)
        model = getattr(body_field, "type_", None) if body_field else None
        if model is None or model is dict or not hasattr(model, "model_fields"):
            continue  # free-form body (e.g. PUT /admin/config accepts any keys)
        fields: set[str] = set()
        if model is not None and hasattr(model, "model_fields"):
            for name, f in model.model_fields.items():
                fields.add(name)
                if f.alias:
                    fields.add(f.alias)
                va = getattr(f, "validation_alias", None)
                if isinstance(va, str):
                    fields.add(va)
        for m in methods:
            if m in ("POST", "PATCH", "PUT"):
                out[(m, path.removeprefix("/api"))] = fields
    return out


def state_keys(src: str, var: str) -> set[str]:
    """Keys of the useState object belonging to *var* only."""
    keys: set[str] = set()
    for m in STATE_OBJ_RE.finditer(src):
        if m.group("var") != var:
            continue
        keys |= _object_keys(m.group("body"))
    return keys


def file_payload_keys(src: str) -> set[str]:
    keys: set[str] = set()
    spreads = set(re.findall(r"\.\.\.(\w+)\s*[,}\)]", src))
    for var in spreads:
        if var in ("arguments", "args"):
            continue
        m = re.search(rf"const \[{var}\s*,", src)
        if m:
            keys |= state_keys(src, var)
        # alias vars: const pl: any = { ...form }  → treat as form's keys
        for am in re.finditer(rf"const {var}[:=\w\s]*=\s*{{\s*\.\.\.(\w+)", src):
            keys |= state_keys(src, am.group(1))
        keys |= set(re.findall(ASSIGN_RE_TEMPLATE.format(var=re.escape(var)), src))
    # direct object-literal bodies
    for om in OBJ_LITERAL_RE.finditer(src):
        keys |= set(k for k in re.findall(r"^\s*([A-Za-z_$][\w$]*)\s*:", om.group("body"), re.M))
    return keys


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--portal", choices=list(PORTALS), default="admin-portal")
    args = ap.parse_args()

    schemas = route_schemas()
    # index schemas by path for quick lookup across methods
    findings: list[str] = []
    checked = 0

    for page in sorted(PORTALS[args.portal].rglob("*.tsx")):
        if page.name != "page.tsx":
            continue
        src = page.read_text(encoding="utf-8")
        calls = list(CALL_RE.finditer(src))
        if not calls:
            continue
        for call in calls:
            method = call.group("method").upper()
            call_args = _balanced(src, call.end() - 1)
            first = _top_split(call_args)[0].strip() if call_args else ""
            url_m = re.search(r"`([^`]+)`|\"([^\"]+)\"|'([^']+)'", first)
            if not url_m:
                continue
            url = next(g for g in url_m.groups() if g)
            url = re.sub(r"\$\{[^}]+\}", "{id}", url)
            payload_keys = call_payload_keys(src, call.end() - 1)
            if not payload_keys:
                continue
            matched_fields: set[str] | None = None
            for (m, path), fields in schemas.items():
                if m != method:
                    continue
                tmpl = re.sub(r"\{[^}]+\}", "{id}", path)
                if tmpl == url:
                    matched_fields = fields
                    break
            if matched_fields is None:
                continue
            checked += 1
            for key in sorted(payload_keys - matched_fields - ALLOWLIST_KEYS):
                if (f"{method} {url}", key) in ALLOWLIST_PAIRS:
                    continue
                findings.append(
                    f"{page.relative_to(PORTALS[args.portal])}: `{key}` sent to "
                    f"{method} {url} but not in the request schema"
                )

    for f in findings:
        print("DROP?", f)
    print(f"\n{checked} form calls checked against backend schemas; {len(findings)} potential drops")
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
