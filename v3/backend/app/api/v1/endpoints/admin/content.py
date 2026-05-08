"""Admin and public content endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.v1.deps import ActiveCustomer, CurrentAdmin, DBDependency
from app.models.content import ContentBlock, SplashScreen
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.content import (
    ContentBlockCreate,
    ContentBlockOut,
    ContentBlockUpdate,
    SplashScreenCreate,
    SplashScreenOut,
    SplashScreenUpdate,
)

admin_router = APIRouter(prefix="/admin/content", tags=["admin — content"])
public_router = APIRouter(prefix="/content", tags=["content"])


async def _get_block_or_404(db, block_id: int) -> ContentBlock:
    result = await db.execute(
        select(ContentBlock).where(
            ContentBlock.id == block_id,
            ContentBlock.deleted_at.is_(None),
        )
    )
    block = result.scalar_one_or_none()
    if block is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Content block not found")
    return block


async def _get_splash_or_404(db, splash_id: int) -> SplashScreen:
    result = await db.execute(
        select(SplashScreen).where(
            SplashScreen.id == splash_id,
            SplashScreen.deleted_at.is_(None),
        )
    )
    splash = result.scalar_one_or_none()
    if splash is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Splash screen not found")
    return splash


# ---------------------------------------------------------------------------
# Admin — Content Blocks
# ---------------------------------------------------------------------------

@admin_router.get("/blocks", response_model=APIResponse[PaginatedResponse[ContentBlockOut]])
async def list_content_blocks(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int | None = Query(None),
    block_type: str | None = Query(None, alias="block_type"),
    is_active: bool | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List content blocks with filters."""
    base_stmt = select(ContentBlock).where(ContentBlock.deleted_at.is_(None))
    count_stmt = select(func.count(ContentBlock.id)).where(ContentBlock.deleted_at.is_(None))

    if store_id is not None:
        base_stmt = base_stmt.where(ContentBlock.store_id == store_id)
        count_stmt = count_stmt.where(ContentBlock.store_id == store_id)
    if block_type is not None:
        base_stmt = base_stmt.where(ContentBlock.content_type == block_type)
        count_stmt = count_stmt.where(ContentBlock.content_type == block_type)
    if is_active is not None:
        base_stmt = base_stmt.where(ContentBlock.is_active.is_(is_active))
        count_stmt = count_stmt.where(ContentBlock.is_active.is_(is_active))

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = base_stmt.order_by(ContentBlock.display_order.asc(), ContentBlock.id.desc()).offset(
        (page - 1) * per_page
    ).limit(per_page)
    result = await db.execute(stmt)
    items = [ContentBlockOut.model_validate(b) for b in result.scalars().all()]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@admin_router.post("/blocks", response_model=APIResponse[ContentBlockOut], status_code=status.HTTP_201_CREATED)
async def create_content_block(
    db: DBDependency,
    admin: CurrentAdmin,
    data: ContentBlockCreate,
):
    """Create a new content block."""
    block = ContentBlock(**data.model_dump(), created_by=admin.id)
    db.add(block)
    await db.commit()
    await db.refresh(block)
    return APIResponse(data=ContentBlockOut.model_validate(block))


@admin_router.get("/blocks/{block_id}", response_model=APIResponse[ContentBlockOut])
async def get_content_block(
    db: DBDependency,
    admin: CurrentAdmin,
    block_id: int,
):
    """Get content block detail."""
    block = await _get_block_or_404(db, block_id)
    return APIResponse(data=ContentBlockOut.model_validate(block))


@admin_router.put("/blocks/{block_id}", response_model=APIResponse[ContentBlockOut])
async def update_content_block(
    db: DBDependency,
    admin: CurrentAdmin,
    block_id: int,
    data: ContentBlockUpdate,
):
    """Update a content block."""
    block = await _get_block_or_404(db, block_id)

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(block, field, value)

    block.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(block)
    return APIResponse(data=ContentBlockOut.model_validate(block))


@admin_router.delete("/blocks/{block_id}", response_model=APIResponse[dict])
async def delete_content_block(
    db: DBDependency,
    admin: CurrentAdmin,
    block_id: int,
):
    """Soft-delete a content block."""
    block = await _get_block_or_404(db, block_id)

    block.deleted_at = datetime.now(timezone.utc)
    block.is_active = False
    await db.commit()
    return APIResponse(data={"id": block.id, "deleted": True})


# ---------------------------------------------------------------------------
# Admin — Splash Screens
# ---------------------------------------------------------------------------

@admin_router.get("/splash-screens", response_model=APIResponse[PaginatedResponse[SplashScreenOut]])
async def list_splash_screens(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int | None = Query(None),
    is_active: bool | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List splash screens with filters."""
    base_stmt = select(SplashScreen).where(SplashScreen.deleted_at.is_(None))
    count_stmt = select(func.count(SplashScreen.id)).where(SplashScreen.deleted_at.is_(None))

    if store_id is not None:
        base_stmt = base_stmt.where(SplashScreen.store_id == store_id)
        count_stmt = count_stmt.where(SplashScreen.store_id == store_id)
    if is_active is not None:
        base_stmt = base_stmt.where(SplashScreen.is_active.is_(is_active))
        count_stmt = count_stmt.where(SplashScreen.is_active.is_(is_active))

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = base_stmt.order_by(SplashScreen.id.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    items = [SplashScreenOut.model_validate(s) for s in result.scalars().all()]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@admin_router.post("/splash-screens", response_model=APIResponse[SplashScreenOut], status_code=status.HTTP_201_CREATED)
async def create_splash_screen(
    db: DBDependency,
    admin: CurrentAdmin,
    data: SplashScreenCreate,
):
    """Create a new splash screen."""
    splash = SplashScreen(**data.model_dump())
    db.add(splash)
    await db.commit()
    await db.refresh(splash)
    return APIResponse(data=SplashScreenOut.model_validate(splash))


@admin_router.get("/splash-screens/{splash_id}", response_model=APIResponse[SplashScreenOut])
async def get_splash_screen(
    db: DBDependency,
    admin: CurrentAdmin,
    splash_id: int,
):
    """Get splash screen detail."""
    splash = await _get_splash_or_404(db, splash_id)
    return APIResponse(data=SplashScreenOut.model_validate(splash))


@admin_router.put("/splash-screens/{splash_id}", response_model=APIResponse[SplashScreenOut])
async def update_splash_screen(
    db: DBDependency,
    admin: CurrentAdmin,
    splash_id: int,
    data: SplashScreenUpdate,
):
    """Update a splash screen."""
    splash = await _get_splash_or_404(db, splash_id)

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(splash, field, value)

    splash.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(splash)
    return APIResponse(data=SplashScreenOut.model_validate(splash))


@admin_router.delete("/splash-screens/{splash_id}", response_model=APIResponse[dict])
async def delete_splash_screen(
    db: DBDependency,
    admin: CurrentAdmin,
    splash_id: int,
):
    """Soft-delete a splash screen."""
    splash = await _get_splash_or_404(db, splash_id)

    splash.deleted_at = datetime.now(timezone.utc)
    splash.is_active = False
    await db.commit()
    return APIResponse(data={"id": splash.id, "deleted": True})


# ---------------------------------------------------------------------------
# Public — Content Blocks
# ---------------------------------------------------------------------------

@public_router.get("/blocks", response_model=APIResponse[PaginatedResponse[ContentBlockOut]])
async def list_public_content_blocks(
    db: DBDependency,
    store_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List active content blocks for a store."""
    now = datetime.now(timezone.utc)
    base_stmt = select(ContentBlock).where(
        ContentBlock.is_active.is_(True),
        ContentBlock.deleted_at.is_(None),
    )
    count_stmt = select(func.count(ContentBlock.id)).where(
        ContentBlock.is_active.is_(True),
        ContentBlock.deleted_at.is_(None),
    )

    if store_id is not None:
        base_stmt = base_stmt.where(ContentBlock.store_id == store_id)
        count_stmt = count_stmt.where(ContentBlock.store_id == store_id)

    # Respect date ranges if set
    base_stmt = base_stmt.where(
        (ContentBlock.start_date.is_(None)) | (ContentBlock.start_date <= now)
    ).where(
        (ContentBlock.end_date.is_(None)) | (ContentBlock.end_date >= now)
    )
    count_stmt = count_stmt.where(
        (ContentBlock.start_date.is_(None)) | (ContentBlock.start_date <= now)
    ).where(
        (ContentBlock.end_date.is_(None)) | (ContentBlock.end_date >= now)
    )

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = base_stmt.order_by(ContentBlock.display_order.asc(), ContentBlock.id.desc()).offset(
        (page - 1) * per_page
    ).limit(per_page)
    result = await db.execute(stmt)
    items = [ContentBlockOut.model_validate(b) for b in result.scalars().all()]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


# ---------------------------------------------------------------------------
# Public — Splash Screens
# ---------------------------------------------------------------------------

@public_router.get("/splash-screens", response_model=APIResponse[PaginatedResponse[SplashScreenOut]])
async def list_public_splash_screens(
    db: DBDependency,
    store_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List active splash screens for a store."""
    now = datetime.now(timezone.utc)
    base_stmt = select(SplashScreen).where(
        SplashScreen.is_active.is_(True),
        SplashScreen.deleted_at.is_(None),
        SplashScreen.active_from <= now,
        SplashScreen.active_until >= now,
    )
    count_stmt = select(func.count(SplashScreen.id)).where(
        SplashScreen.is_active.is_(True),
        SplashScreen.deleted_at.is_(None),
        SplashScreen.active_from <= now,
        SplashScreen.active_until >= now,
    )

    if store_id is not None:
        base_stmt = base_stmt.where(SplashScreen.store_id == store_id)
        count_stmt = count_stmt.where(SplashScreen.store_id == store_id)

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = base_stmt.order_by(SplashScreen.id.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    items = [SplashScreenOut.model_validate(s) for s in result.scalars().all()]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )
