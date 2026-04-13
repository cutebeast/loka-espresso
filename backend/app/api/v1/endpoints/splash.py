from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import require_role
from app.models.user import User
from app.models.splash import SplashContent
from app.schemas.splash import SplashOut, SplashUpdate

router = APIRouter(prefix="/splash", tags=["Splash"])


@router.get("")
async def get_splash(db: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(SplashContent).where(
            SplashContent.is_active == True,
            SplashContent.active_from <= now,
        ).order_by(SplashContent.id.desc()).limit(1)
    )
    splash = result.scalar_one_or_none()
    if not splash or (splash.active_until and splash.active_until < now):
        return SplashOut(
            fallback={
                "title": splash.fallback_title if splash else "Coffee App",
                "subtitle": splash.fallback_subtitle if splash else "Coffee \u00b7 Community \u00b7 Culture",
            }
        )
    return SplashOut(
        image_url=splash.image_url,
        title=splash.title,
        subtitle=splash.subtitle,
        cta_text=splash.cta_text,
        cta_url=splash.cta_url,
        dismissible=splash.dismissible,
        active_until=splash.active_until.isoformat() if splash.active_until else None,
        fallback={
            "title": splash.fallback_title,
            "subtitle": splash.fallback_subtitle,
        },
    )


@router.put("")
async def update_splash(
    req: SplashUpdate,
    user: User = Depends(require_role("admin", "store_owner")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SplashContent).order_by(SplashContent.id.desc()).limit(1))
    splash = result.scalar_one_or_none()
    if not splash:
        splash = SplashContent()
        db.add(splash)
    for k, v in req.model_dump(exclude_unset=True).items():
        setattr(splash, k, v)
    await db.flush()
    return {"message": "Splash updated", "id": splash.id}
