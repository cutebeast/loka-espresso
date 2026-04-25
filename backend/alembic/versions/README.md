# Alembic Migrations

## Current Active Chain

All current migrations are in this directory (`versions/`). The chain is linear — no branches.

| Revision | File | Description |
|----------|------|-------------|
| `apr2026_fixes_v1` | `apr2026_fixes_v1.py` | Base: checkout_tokens, dietary_tags, referral tracking, composite indexes |
| `apr2026_optimizations_v2` | `apr2026_optimizations_v2.py` | Phase 2: constraints, remove deprecated loyalty_discount |
| `apr2026_constraints_v3` | `apr2026_constraints_v3.py` | DB constraints, robustness checks |
| `apr2026_cart_identity_v4` | `apr2026_cart_identity_v4.py` | customization_hash for cart item deduplication |
| `apr2026_content_actions_v5` | `apr2026_content_actions_v5.py` | action_url, action_type, action_label on information_cards |
| `apr2026_audit_metadata_v6` | `apr2026_audit_metadata_v6.py` | Audit log request metadata (method, path, status_code, user_agent, request_id) |
| `daa03ba00ba7` | `daa03ba00ba7_universal_menu_v7.py` | Remove store_id from menu_categories and menu_items |
| `f05d0a608a23` | `f05d0a608a23_content_type_check_v8.py` | CHECK constraint on information_cards.content_type |

**Head:** `f05d0a608a23`

## Archived Migrations

Historical migrations (37 files from earlier development) are preserved in `alembic/_archived/` for reference. They are not part of the active chain and should not be restored unless specifically needed for historical database recovery.

## Running Migrations

```bash
cd /root/fnb-super-app/backend
.venv/bin/alembic upgrade head       # Upgrade to latest
.venv/bin/alembic downgrade -1       # Downgrade one step
.venv/bin/alembic history            # View full chain
.venv/bin/alembic current            # Show current revision
```

## Creating a New Migration

```bash
cd /root/fnb-super-app/backend
.venv/bin/alembic revision -m "description" --head=$(.venv/bin/alembic current)
```

Edit the generated file to add your `upgrade()` and `downgrade()` operations.

## For Fresh Database Setup

For a brand-new PostgreSQL instance, run migrations in order:

```bash
cd /root/fnb-super-app/backend
.venv/bin/alembic upgrade head
```

Then seed the database using the seed scripts:

```bash
cd /root/fnb-super-app/scripts/seed
python3 verify_master_base_seed.py
```

## Rules

1. **Never modify an already-run migration** — create a new one instead.
2. **Keep the chain linear** — avoid branches unless absolutely necessary.
3. **Document the purpose** in the migration docstring.
4. **Include both upgrade and downgrade** functions.
5. **Test downgrade** before committing.
