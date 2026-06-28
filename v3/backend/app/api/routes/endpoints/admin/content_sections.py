"""Content sections — reusable structured content blocks for any content type."""

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from app.api.routes.deps import CurrentAdmin, DBDependency
from app.models.info_card import ContentSection
from app.schemas.base import APIResponse
from app.schemas.content import ContentSectionCreate, ContentSectionUpdate, ContentSectionBatchSaveRequest

router = APIRouter(prefix="/admin/content-sections", tags=["admin — content sections"])


@router.get("", response_model=APIResponse[list[dict]])
async def list_sections(
    db: DBDependency, admin: CurrentAdmin,
    content_type: str = Query(...),
    content_id: int = Query(...),
):
    """List sections for a specific content item."""
    result = await db.execute(
        select(ContentSection)
        .where(ContentSection.content_type == content_type, ContentSection.content_id == content_id)
        .order_by(ContentSection.sort_order)
    )
    items = [
        {"id": s.id, "section_title": s.section_title, "section_body": s.section_body,
         "sort_order": s.sort_order, "is_active": s.is_active}
        for s in result.scalars().all()
    ]
    return APIResponse(data=items)


@router.post("", response_model=APIResponse[dict])
async def create_section(db: DBDependency, admin: CurrentAdmin, data: ContentSectionCreate):
    section = ContentSection(**data.model_dump(exclude_unset=True))
    db.add(section); await db.commit(); await db.refresh(section)
    return APIResponse(data={"id": section.id, "message": "Created"})


@router.patch("/{id}", response_model=APIResponse[dict])
async def update_section(db: DBDependency, admin: CurrentAdmin, id: int, data: ContentSectionUpdate):
    result = await db.execute(select(ContentSection).where(ContentSection.id == id))
    s = result.scalar_one_or_none()
    if not s: raise HTTPException(404, "Not found")
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(s, field, value)
    await db.commit()
    return APIResponse(data={"id": s.id, "message": "Updated"})


@router.put("/batch", response_model=APIResponse[dict])
async def save_sections(db: DBDependency, admin: CurrentAdmin, data: ContentSectionBatchSaveRequest):
    """Replace all sections for a content item (batch save)."""
    # Delete existing
    existing = await db.execute(
        select(ContentSection).where(
            ContentSection.content_type == data.content_type,
            ContentSection.content_id == data.content_id,
        )
    )
    for s in existing.scalars().all():
        await db.delete(s)
    
    # Insert new
    sections = data.sections
    for i, s in enumerate(sections):
        if not s.section_title and not s.section_body:
            continue
        section = ContentSection(
            content_type=data.content_type, content_id=data.content_id,
            section_title=s.section_title, section_body=s.section_body,
            sort_order=i, is_active=s.is_active,
        )
        db.add(section)
    
    await db.commit()
    return APIResponse(data={"message": f"Saved {len(sections)} sections"})
