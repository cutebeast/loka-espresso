import os
import json
import asyncio
import shutil
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import require_hq_access
from app.core.audit import log_action, get_client_ip
from app.models.user import User

router = APIRouter(tags=["Admin PWA Management"])


@router.post("/admin/pwa/rebuild")
async def pwa_rebuild(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    from app.core.config import get_settings
    settings = get_settings()
    if settings.ENVIRONMENT.lower() == "production":
        raise HTTPException(status_code=403, detail="PWA rebuild is not allowed in production")

    customer_dir = "/root/fnb-super-app/customer-app"
    manifest_path = f"{customer_dir}/public/manifest.json"
    sw_path = f"{customer_dir}/public/sw.js"

    timestamp = int(datetime.now(timezone.utc).timestamp())
    version = f"1.0.{timestamp}"
    build_date = datetime.now(timezone.utc).isoformat()

    try:
        with open(manifest_path, 'r') as f:
            manifest = json.load(f)
        manifest['version'] = version
        manifest['build_date'] = build_date
        with open(manifest_path, 'w') as f:
            json.dump(manifest, f, indent=2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update manifest: {str(e)}")

    try:
        with open(sw_path, 'r') as f:
            sw_content = f.read()
        sw_content = sw_content.replace(
            "const CACHE_VERSION = '",
            f"const CACHE_VERSION = 'v{version}'; // Updated by rebuild\n// const CACHE_VERSION = '"
        )
        with open(sw_path, 'w') as f:
            f.write(sw_content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update service worker: {str(e)}")

    next_dir = f"{customer_dir}/.next"
    if os.path.exists(next_dir):
        shutil.rmtree(next_dir)

    try:
        proc = await asyncio.create_subprocess_exec(
            "npm", "run", "build",
            cwd=customer_dir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)
        if proc.returncode != 0:
            raise HTTPException(status_code=500, detail=f"Build failed: {stderr.decode()}")
    except asyncio.TimeoutError:
        raise HTTPException(status_code=500, detail="Build timed out")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Build error: {str(e)}")

    ip = get_client_ip(request)
    await log_action(
        db, action="PWA_REBUILD", user_id=user.id,
        entity_type="pwa", entity_id=0,
        details={"version": version, "build_date": build_date},
        ip_address=ip
    )

    return {
        "version": version,
        "build_date": build_date,
        "cache_name": f"loka-pwa-v{version}",
        "message": "PWA rebuilt successfully"
    }


@router.post("/admin/pwa/clear-cache")
async def pwa_clear_cache(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    from app.core.config import get_settings
    settings = get_settings()
    if settings.ENVIRONMENT.lower() == "production":
        raise HTTPException(status_code=403, detail="PWA cache clear is not allowed in production")

    customer_dir = "/root/fnb-super-app/customer-app"
    next_dir = f"{customer_dir}/.next"

    cleared = False
    if os.path.exists(next_dir):
        shutil.rmtree(next_dir)
        cleared = True

    ip = get_client_ip(request)
    await log_action(
        db, action="PWA_CLEAR_CACHE", user_id=user.id,
        entity_type="pwa", entity_id=0,
        details={"cache_cleared": cleared},
        ip_address=ip
    )

    return {
        "cache_cleared": cleared,
        "message": "PWA cache cleared" if cleared else "No cache to clear"
    }


@router.get("/admin/pwa/version")
async def pwa_get_version(
    user: User = Depends(require_hq_access()),
):
    manifest_path = "/root/fnb-super-app/customer-app/public/manifest.json"

    try:
        with open(manifest_path, 'r') as f:
            manifest = json.load(f)
        return {
            "version": manifest.get('version', '1.0.0'),
            "build_date": manifest.get('build_date', datetime.now(timezone.utc).isoformat()),
            "name": manifest.get('name', 'Loka Espresso'),
            "cache_name": f"loka-pwa-v{manifest.get('version', '1.0.0')}",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read manifest: {str(e)}")
