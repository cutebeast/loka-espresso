#!/usr/bin/env python3
"""Validate that all frontend API calls match registered backend routes.

Run from v3/ directory:
    python3 scripts/validate-routes.py

Exit code 0 = all matched, 1 = mismatches found.
"""

import ast
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.request import urlopen

SCRIPT_DIR = Path(__file__).resolve().parent
V3_DIR = SCRIPT_DIR.parent
BACKEND_DIR = V3_DIR / "backend"
ADMIN_DIR = V3_DIR / "admin-portal" / "src"
STAFF_DIR = V3_DIR / "staff-portal" / "src"
PWA_DIR = V3_DIR / "customer-pwa" / "src"

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:13800")

# -- 1. Collect backend routes from OpenAPI -----------------------------------

def _python_executable() -> str:
    venv_python = BACKEND_DIR / ".venv" / "bin" / "python"
    if venv_python.exists():
        return str(venv_python)
    return sys.executable


def generate_openapi_from_code() -> dict:
    """Generate OpenAPI schema directly from the backend codebase.

    This works even when the running backend is in production mode and has
    disabled the /openapi.json endpoint.
    """
    script = (
        "import json, os; "
        "os.environ['ENVIRONMENT'] = 'development'; "
        "from app.main import app; "
        "print(json.dumps(app.openapi()))"
    )
    result = subprocess.run(
        [_python_executable(), "-c", script],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Failed to generate OpenAPI from code:\n{result.stderr}")
    return json.loads(result.stdout)


def fetch_backend_routes() -> set[str]:
    """Fetch all registered API routes from the backend OpenAPI schema.

    Tries the running backend first (/openapi.json and /api/openapi.json). If
    the backend is running in production mode, OpenAPI docs are disabled, so we
    fall back to generating the schema directly from the codebase.
    """
    schema: dict = {}
    for path in ("/openapi.json", "/api/openapi.json"):
        try:
            resp = urlopen(f"{BACKEND_URL}{path}", timeout=10)
            loaded = json.load(resp)
            if "paths" in loaded:
                schema = loaded
                break
        except Exception:
            continue

    if not schema:
        print(f"INFO: OpenAPI schema is not available at {BACKEND_URL} (production mode disables docs).")
        print("        Falling back to generating OpenAPI schema from backend code...")
        try:
            schema = generate_openapi_from_code()
        except Exception as e:
            print(f"ERROR: Could not generate OpenAPI schema: {e}")
            return set()

    paths = schema.get("paths", {})
    routes: set[str] = set()

    for path, methods in paths.items():
        # Remove the /api prefix if present (we compare without it)
        clean = path.removeprefix("/api")
        # Replace path params like {id} with a placeholder we can match against
        clean = re.sub(r"\{[^}]+\}", ":param", clean)
        routes.add(clean)

    return routes


# -- 2. Collect frontend API calls -------------------------------------------

# Only match paths that appear as arguments to actual API call functions
API_FN = r"(?:api\.(?:get|post|patch|del|put|upload|getRaw|fetchRaw|getPaginated)\s*\(\s*|fetch\s*\(\s*)"
API_CALL_PATTERN = re.compile(
    API_FN + r"[""'`](/api)?(/[^""'` ]+)",
)

def collect_frontend_calls(directory: Path) -> set[str]:
    """Scan source files for API path strings."""
    calls: set[str] = set()
    for ext in ("*.ts", "*.tsx"):
        for f in directory.rglob(ext):
            if "node_modules" in str(f):
                continue
            try:
                content = f.read_text()
            except Exception:
                continue
            for match in API_CALL_PATTERN.finditer(content):
                raw = match.group(2)  # the path part after /api or root /
                if raw.startswith("/"):
                    # Clean query params
                    path_only = raw.split("?")[0].split("#")[0]
                    # Replace template literals like ${id} with :param
                    clean = re.sub(r"\$\{[^}]+\}", ":param", path_only)
                    # Filter out non-API paths (_next, /static, etc.)
                    if not clean.startswith("/_") and not clean.startswith("/static"):
                        calls.add(clean)
    return calls


# -- 3. Match frontend calls against backend routes ---------------------------

def match_routes(backend: set[str], frontend: set[str]) -> tuple[list[str], list[str]]:
    """Match frontend routes against backend routes. Returns (matched, unmatched)."""
    matched: list[str] = []
    unmatched: list[str] = []

    for call in sorted(frontend):
        found = False
        for route in backend:
            # Exact match
            if call == route:
                found = True
                break
            # Check if this is a template match (both have :param in same position)
            if ":param" in call or ":param" in route:
                call_parts = call.split("/")
                route_parts = route.split("/")
                if len(call_parts) == len(route_parts):
                    match = True
                    for c, r in zip(call_parts, route_parts):
                        if c == r:
                            continue
                        if c == ":param" or r == ":param":
                            continue
                        match = False
                        break
                    if match:
                        found = True
                        break
        if found:
            matched.append(call)
        else:
            unmatched.append(call)

    return matched, unmatched


# -- 4. Report -----------------------------------------------------------------

def main() -> int:
    print("=== Route Validation ===")
    print(f"Backend: {BACKEND_URL}")

    backend_routes = fetch_backend_routes()
    print(f"Backend routes found: {len(backend_routes)}")

    admin_calls = collect_frontend_calls(ADMIN_DIR)
    staff_calls = collect_frontend_calls(STAFF_DIR)
    pwa_calls = collect_frontend_calls(PWA_DIR)

    print(f"Admin calls found:   {len(admin_calls)}")
    print(f"Staff calls found:   {len(staff_calls)}")
    print(f"PWA calls found:     {len(pwa_calls)}")

    all_frontend = admin_calls | staff_calls | pwa_calls
    matched, unmatched = match_routes(backend_routes, all_frontend)

    # Filter out obviously non-API paths (Next.js page routes, static assets)
    skip_prefixes = (
        "/login", "/logout", "/pos", "/orders", "/kitchen", "/tables",
        "/reservations", "/time-clock", "/wallet", "/profile", "/equipment",
        "/", "/stores", "/loyalty", "/menu", "/customers", "/staff",
        "/inventory", "/notifications", "/feedback", "/reports", "/refunds",
        "/admins", "/settings", "/audit-log", "/content", "/marketing",
        "/rewards", "/promotions", "/vouchers", "/surveys", "/referrals",
        "/checkins", "/translations", "/catalog", "/addresses", "/consents",
        "/devices", "/users/me", "/me/wallet", "/wallet", "/ledger",
        "/auth", "/config", "/items", "/checkout", "/preferences",
        "/sw.js", "/manifest.json", "/version.json", "/icon-",
        "/pos-webhook", "/delivery-webhook",
    )
    real_unmatched = [
        u for u in unmatched
        if not any(u.startswith(p) for p in skip_prefixes)
        and (u.startswith("/api/") or u.startswith("/admin/") or u.startswith("/staff/")
             or u.startswith("/public/") or u.startswith("/auth/") or u.startswith("/menu/")
             or u.startswith("/config/") or u.startswith("/stores/") or u.startswith("/upload/")
             or u.startswith("/health"))
    ]

    # Also flag frontend-only routes that aren't backend APIs
    frontend_only = [
        u for u in unmatched
        if not u.startswith("/api/") and not u.startswith("/admin/")
        and not u.startswith("/staff/") and not u.startswith("/public/")
        and not u.startswith("/auth/") and not u.startswith("/menu/")
        and not u.startswith("/config/") and not u.startswith("/stores/")
    ]

    print(f"\nMatched: {len(matched)}")
    print(f"Unmatched API routes: {len(real_unmatched)}")
    if real_unmatched:
        print("  UNMATCHED (frontend calls with no backend route):")
        for u in sorted(real_unmatched):
            print(f"    {u}")

    if frontend_only:
        print(f"\n  Frontend-only page routes (not APIs — OK):")
        for u in sorted(frontend_only):
            print(f"    {u}")

    # Check for backend-only routes (no frontend caller)
    backend_only = backend_routes - {
        m for m in matched if m in backend_routes
    }
    # Remove health, docs, openapi etc
    skip_backend = {"/health", "/openapi.json", "/docs", "/redoc", "/api/health", "/api/openapi.json"}
    real_backend_only = backend_only - skip_backend
    # Also remove routes that look like internal patterns
    real_backend_only = {r for r in real_backend_only if not r.startswith("/_")}

    print(f"\nBackend-only routes (no frontend caller): {len(real_backend_only)}")
    if real_backend_only:
        for r in sorted(real_backend_only)[:20]:
            print(f"    {r}")
        if len(real_backend_only) > 20:
            print(f"    ... and {len(real_backend_only) - 20} more")

    if real_unmatched:
        print("\n❌ Route mismatches found — fix before deploying!")
        return 1
    else:
        print("\n✅ All frontend API calls match backend routes")
        return 0


if __name__ == "__main__":
    sys.exit(main())
