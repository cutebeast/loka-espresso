"""Admin and public survey endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import ActiveCustomer, CurrentAdmin, DBDependency
from app.models.survey import SurveyAnswer, SurveyDefinition, SurveyQuestion, SurveyResponse
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.survey import (
    SurveyDefinitionCreate,
    SurveyDefinitionDetailOut,
    SurveyDefinitionOut,
    SurveyDefinitionUpdate,
    SurveyQuestionCreate,
    SurveyQuestionOut,
    SurveyQuestionUpdate,
    SurveyResponseCreate,
    SurveyResponseOut,
)

admin_router = APIRouter(prefix="/admin/surveys", tags=["admin — surveys"])
public_router = APIRouter(prefix="/surveys", tags=["surveys"])


async def _get_survey_or_404(db, survey_id: int) -> SurveyDefinition:
    result = await db.execute(
        select(SurveyDefinition).where(
            SurveyDefinition.id == survey_id,
            SurveyDefinition.deleted_at.is_(None),
        )
    )
    survey = result.scalar_one_or_none()
    if survey is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Survey not found")
    return survey


async def _get_question_or_404(db, question_id: int) -> SurveyQuestion:
    result = await db.execute(select(SurveyQuestion).where(SurveyQuestion.id == question_id))
    question = result.scalar_one_or_none()
    if question is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
    return question


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------

@admin_router.get("", response_model=APIResponse[PaginatedResponse[SurveyDefinitionOut]])
async def list_surveys(
    db: DBDependency,
    admin: CurrentAdmin,
    is_active: bool | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List surveys with filters."""
    base_stmt = select(SurveyDefinition).where(SurveyDefinition.deleted_at.is_(None))
    count_stmt = select(func.count(SurveyDefinition.id)).where(SurveyDefinition.deleted_at.is_(None))

    if is_active is not None:
        base_stmt = base_stmt.where(SurveyDefinition.is_active.is_(is_active))
        count_stmt = count_stmt.where(SurveyDefinition.is_active.is_(is_active))

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = base_stmt.order_by(SurveyDefinition.id.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    items = [SurveyDefinitionOut.model_validate(s) for s in result.scalars().all()]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@admin_router.post("", response_model=APIResponse[SurveyDefinitionOut], status_code=status.HTTP_201_CREATED)
async def create_survey(
    db: DBDependency,
    admin: CurrentAdmin,
    data: SurveyDefinitionCreate,
):
    """Create a new survey."""
    survey = SurveyDefinition(**data.model_dump(), created_by=admin.id)
    db.add(survey)
    await db.commit()
    await db.refresh(survey)
    return APIResponse(data=SurveyDefinitionOut.model_validate(survey))


@admin_router.get("/{survey_id}", response_model=APIResponse[SurveyDefinitionDetailOut])
async def get_survey(
    db: DBDependency,
    admin: CurrentAdmin,
    survey_id: int,
):
    """Get survey detail with questions."""
    result = await db.execute(
        select(SurveyDefinition)
        .options(selectinload(SurveyDefinition.questions))
        .where(
            SurveyDefinition.id == survey_id,
            SurveyDefinition.deleted_at.is_(None),
        )
    )
    survey = result.scalar_one_or_none()
    if survey is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Survey not found")

    return APIResponse(data=SurveyDefinitionDetailOut.model_validate(survey))


@admin_router.put("/{survey_id}", response_model=APIResponse[SurveyDefinitionOut])
async def update_survey(
    db: DBDependency,
    admin: CurrentAdmin,
    survey_id: int,
    data: SurveyDefinitionUpdate,
):
    """Update a survey."""
    survey = await _get_survey_or_404(db, survey_id)

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(survey, field, value)

    survey.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(survey)
    return APIResponse(data=SurveyDefinitionOut.model_validate(survey))


@admin_router.delete("/{survey_id}", response_model=APIResponse[dict])
async def delete_survey(
    db: DBDependency,
    admin: CurrentAdmin,
    survey_id: int,
):
    """Soft-delete a survey."""
    survey = await _get_survey_or_404(db, survey_id)

    survey.deleted_at = datetime.now(timezone.utc)
    survey.is_active = False
    await db.commit()
    return APIResponse(data={"id": survey.id, "deleted": True})


@admin_router.post("/{survey_id}/questions", response_model=APIResponse[SurveyQuestionOut], status_code=status.HTTP_201_CREATED)
async def add_question(
    db: DBDependency,
    admin: CurrentAdmin,
    survey_id: int,
    data: SurveyQuestionCreate,
):
    """Add a question to a survey."""
    survey = await _get_survey_or_404(db, survey_id)

    question = SurveyQuestion(**data.model_dump(), survey_id=survey.id)
    db.add(question)
    await db.commit()
    await db.refresh(question)
    return APIResponse(data=SurveyQuestionOut.model_validate(question))


@admin_router.delete("/{survey_id}/questions/{question_id}", response_model=APIResponse[dict])
async def remove_question(
    db: DBDependency,
    admin: CurrentAdmin,
    survey_id: int,
    question_id: int,
):
    """Remove a question from a survey."""
    survey = await _get_survey_or_404(db, survey_id)
    question = await _get_question_or_404(db, question_id)

    if question.survey_id != survey.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Question does not belong to this survey",
        )

    await db.delete(question)
    await db.commit()
    return APIResponse(data={"id": question_id, "deleted": True})


@admin_router.get("/{survey_id}/responses", response_model=APIResponse[PaginatedResponse[SurveyResponseOut]])
async def list_survey_responses(
    db: DBDependency,
    admin: CurrentAdmin,
    survey_id: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List responses for a survey."""
    survey = await _get_survey_or_404(db, survey_id)

    count_stmt = select(func.count(SurveyResponse.id)).where(SurveyResponse.survey_id == survey.id)
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = (
        select(SurveyResponse)
        .options(selectinload(SurveyResponse.answers))
        .where(SurveyResponse.survey_id == survey.id)
        .order_by(SurveyResponse.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    items = [SurveyResponseOut.model_validate(r) for r in result.scalars().all()]

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
# Public endpoints
# ---------------------------------------------------------------------------

@public_router.get("", response_model=APIResponse[PaginatedResponse[SurveyDefinitionOut]])
async def list_public_surveys(
    db: DBDependency,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List active surveys."""
    base_stmt = select(SurveyDefinition).where(
        SurveyDefinition.is_active.is_(True),
        SurveyDefinition.deleted_at.is_(None),
    )
    count_stmt = select(func.count(SurveyDefinition.id)).where(
        SurveyDefinition.is_active.is_(True),
        SurveyDefinition.deleted_at.is_(None),
    )

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = base_stmt.order_by(SurveyDefinition.id.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    items = [SurveyDefinitionOut.model_validate(s) for s in result.scalars().all()]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@public_router.get("/{survey_id}", response_model=APIResponse[SurveyDefinitionDetailOut])
async def get_public_survey(
    db: DBDependency,
    survey_id: int,
):
    """Get active survey with questions."""
    result = await db.execute(
        select(SurveyDefinition)
        .options(selectinload(SurveyDefinition.questions))
        .where(
            SurveyDefinition.id == survey_id,
            SurveyDefinition.is_active.is_(True),
            SurveyDefinition.deleted_at.is_(None),
        )
    )
    survey = result.scalar_one_or_none()
    if survey is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Survey not found")

    return APIResponse(data=SurveyDefinitionDetailOut.model_validate(survey))


@public_router.post("/{survey_id}/responses", response_model=APIResponse[SurveyResponseOut], status_code=status.HTTP_201_CREATED)
async def submit_survey_response(
    db: DBDependency,
    customer: ActiveCustomer,
    survey_id: int,
    data: SurveyResponseCreate,
):
    """Submit a survey response."""
    result = await db.execute(
        select(SurveyDefinition)
        .where(
            SurveyDefinition.id == survey_id,
            SurveyDefinition.is_active.is_(True),
            SurveyDefinition.deleted_at.is_(None),
        )
    )
    survey = result.scalar_one_or_none()
    if survey is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Survey not found")

    if not survey.allow_multiple_responses:
        existing = await db.execute(
            select(SurveyResponse).where(
                SurveyResponse.survey_id == survey_id,
                SurveyResponse.customer_id == customer.id,
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You have already responded to this survey",
            )

    response = SurveyResponse(
        survey_id=survey_id,
        customer_id=customer.id if not survey.is_anonymous else None,
        respondent_email=data.respondent_email,
        nps_score=data.nps_score,
        overall_satisfaction=data.overall_satisfaction,
        source_channel=data.source_channel,
        consent_given=data.consent_given,
        duration_seconds=data.duration_seconds,
    )
    db.add(response)
    await db.flush()

    for answer_data in data.answers:
        answer = SurveyAnswer(
            response_id=response.id,
            question_id=answer_data.question_id,
            answer_value=answer_data.answer_value,
            answer_detail=answer_data.answer_detail,
        )
        db.add(answer)

    await db.commit()
    await db.refresh(response)

    # Eager load answers for response
    result = await db.execute(
        select(SurveyResponse)
        .options(selectinload(SurveyResponse.answers))
        .where(SurveyResponse.id == response.id)
    )
    response = result.scalar_one()

    return APIResponse(data=SurveyResponseOut.model_validate(response))
