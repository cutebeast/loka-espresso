"""System info endpoint for version control."""

import subprocess
from datetime import datetime, timezone

from fastapi import APIRouter

from app.api.routes.deps import CurrentAdmin
from app.schemas.base import APIResponse

router = APIRouter(prefix="/admin/system", tags=["admin — system"])


def _git_info() -> dict:
    try:
        hash_short = (
            subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True).strip()
        )
        branch = (
            subprocess.check_output(["git", "rev-parse", "--abbrev-ref", "HEAD"], text=True).strip()
        )
        timestamp = int(
            subprocess.check_output(["git", "log", "-1", "--format=%ct"], text=True).strip()
        )
        return {
            "commit": hash_short,
            "branch": branch,
            "commitAt": timestamp * 1000,
        }
    except Exception:
        return {"commit": "unknown", "branch": "unknown", "commitAt": None}


@router.get("/version", response_model=APIResponse[dict])
async def get_backend_version(admin: CurrentAdmin):
    """Return backend version and build metadata."""
    git = _git_info()
    return APIResponse(
        data={
            "app": "backend",
            "name": "Backend API",
            "version": "3.0.0",
            "commit": git["commit"],
            "branch": git["branch"],
            "commitAt": git["commitAt"],
            "builtAt": int(datetime.now(timezone.utc).timestamp() * 1000),
            "environment": "production",
        }
    )
