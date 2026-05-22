"""Admin and public survey endpoints."""

import io, json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import ActiveCustomer, CurrentAdmin, DBDependency, OptionalLocale
from app.services.translation import merge_translations, translate_single
from app.models.survey import SurveyAnswer, SurveyDefinition, SurveyQuestion, SurveyResponse
from app.models.translation import Translation
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.survey import (
    MAX_QUESTIONS_PER_SURVEY,
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
from app.services.translation import auto_translate_record, auto_translate_text, delete_translations, SUPPORTED_LOCALES, SOURCE_LOCALE

async def _translate_question_options(db, question_id: int, options: list[str]):
    """Auto-translate each option for all supported locales."""
    for oi, opt in enumerate(options):
        opt = (opt or "").strip()
        if not opt: continue
        column = f"option_{oi}"
        for locale in SUPPORTED_LOCALES:
            translated, _ = await auto_translate_text(db, opt, SOURCE_LOCALE, locale)
            result = await db.execute(
                select(Translation).where(
                    Translation.table_name == "survey_questions",
                    Translation.record_id == question_id,
                    Translation.column_name == column,
                    Translation.locale == locale,
                )
            )
            existing = result.scalar_one_or_none()
            if existing:
                existing.translated_text = translated
                existing.source_text = opt
            else:
                db.add(Translation(
                    table_name="survey_questions", record_id=question_id,
                    column_name=column, locale=locale,
                    translated_text=translated, source_text=opt,
                    namespace="survey", translation_key=f"survey_questions.{question_id}.{column}",
                    is_auto_translated=True,
                ))

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
    """List surveys with question/response counts."""
    base_stmt = select(SurveyDefinition).where(SurveyDefinition.deleted_at.is_(None))
    count_stmt = select(func.count(SurveyDefinition.id)).where(SurveyDefinition.deleted_at.is_(None))

    if is_active is not None:
        base_stmt = base_stmt.where(SurveyDefinition.is_active.is_(is_active))
        count_stmt = count_stmt.where(SurveyDefinition.is_active.is_(is_active))

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = base_stmt.order_by(SurveyDefinition.id.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    surveys = result.scalars().all()

    # Batch-fetch question/response counts (2 queries instead of 2N)
    survey_ids = [s.id for s in surveys]
    items: list[dict] = []
    if survey_ids:
        q_counts = {}
        r_counts = {}
        qc_result = await db.execute(
            select(SurveyQuestion.survey_id, func.count(SurveyQuestion.id))
            .where(SurveyQuestion.survey_id.in_(survey_ids))
            .group_by(SurveyQuestion.survey_id)
        )
        for sid, cnt in qc_result.all():
            q_counts[sid] = cnt
        rc_result = await db.execute(
            select(SurveyResponse.survey_id, func.count(SurveyResponse.id))
            .where(SurveyResponse.survey_id.in_(survey_ids))
            .group_by(SurveyResponse.survey_id)
        )
        for sid, cnt in rc_result.all():
            r_counts[sid] = cnt
        for s in surveys:
            d = SurveyDefinitionOut.model_validate(s).model_dump()
            d["question_count"] = q_counts.get(s.id, 0)
            d["response_count"] = r_counts.get(s.id, 0)
            items.append(d)
    else:
        items = [SurveyDefinitionOut.model_validate(s).model_dump() for s in surveys]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@admin_router.post("", response_model=APIResponse[SurveyDefinitionDetailOut], status_code=status.HTTP_201_CREATED)
async def create_survey(
    db: DBDependency,
    admin: CurrentAdmin,
    data: SurveyDefinitionCreate,
):
    """Create a new survey with optional questions (max 5)."""
    if len(data.questions) > MAX_QUESTIONS_PER_SURVEY:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Maximum {MAX_QUESTIONS_PER_SURVEY} questions allowed per survey",
        )

    payload = data.model_dump()
    questions_data = payload.pop("questions", [])

    survey = SurveyDefinition(**payload, created_by=admin.id)
    db.add(survey)
    await db.flush()

    for i, q in enumerate(questions_data):
        q_copy = {k: v for k, v in q.items() if k != "display_order"}
        # Map "options" from frontend to "answer_options" in model (always pop)
        opts = q_copy.pop("options", None)
        if opts:
            q_copy["answer_options"] = {"choices": opts}
        question = SurveyQuestion(
            **q_copy,
            survey_id=survey.id,
            display_order=q.get("display_order", i),
        )
        db.add(question)
        await db.flush()
        await auto_translate_record(db, "survey_questions", question.id, {"question_text": question.question_text or ""})
        if opts:
            await _translate_question_options(db, question.id, opts.get("choices", []))

    await db.commit()
    await auto_translate_record(db, "survey_definitions", survey.id, {"survey_name": survey.survey_name or "", "description": survey.description or ""})
    await db.refresh(survey)
    # Re-fetch with eager-loaded questions
    result = await db.execute(
        select(SurveyDefinition)
        .options(selectinload(SurveyDefinition.questions))
        .where(SurveyDefinition.id == survey.id)
    )
    survey = result.scalar_one()
    survey_dict = SurveyDefinitionDetailOut.model_validate(survey).model_dump()
    # Translate survey definition fields
    await translate_single(db, survey_dict, "survey_definitions", locale)
    # Translate questions
    questions = survey_dict.get("questions", [])
    await merge_translations(db, questions, "survey_questions", locale)
    # Apply back
    survey_dict["questions"] = questions
    return APIResponse(data=survey_dict)


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


@admin_router.put("/{survey_id}", response_model=APIResponse[SurveyDefinitionDetailOut])
async def update_survey(
    db: DBDependency,
    admin: CurrentAdmin,
    survey_id: int,
    data: SurveyDefinitionUpdate,
):
    """Update a survey and optionally replace questions (max 5)."""
    survey = await _get_survey_or_404(db, survey_id)

    payload = data.model_dump(exclude_unset=True)

    # Handle questions if provided
    if "questions" in payload:
        questions_data = payload.pop("questions")
        if len(questions_data) > MAX_QUESTIONS_PER_SURVEY:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Maximum {MAX_QUESTIONS_PER_SURVEY} questions allowed per survey",
            )
        # Delete existing questions
        await db.execute(
            select(SurveyQuestion).where(SurveyQuestion.survey_id == survey.id)
        )
        existing = (await db.execute(
            select(SurveyQuestion).where(SurveyQuestion.survey_id == survey.id)
        )).scalars().all()
        for q in existing:
            await delete_translations(db, "survey_questions", q.id)
            await db.delete(q)
        # Add new questions
        for i, q in enumerate(questions_data):
            # Map "options" from frontend to "answer_options" in model
            opts = None
            if q.get("options"):
                opts = {"choices": q.get("options")}
            question = SurveyQuestion(
                question_text=q.get("question_text", ""),
                question_type=q.get("question_type", "text_open"),
                answer_options=opts or q.get("answer_options"),
                is_required=q.get("is_required", False),
                display_order=q.get("display_order", i),
                survey_id=survey.id,
            )
            db.add(question)
            await db.flush()
            await auto_translate_record(db, "survey_questions", question.id, {"question_text": question.question_text or ""})
            if opts:
                await _translate_question_options(db, question.id, opts.get("choices", []))

    # Update survey fields
    for field, value in payload.items():
        setattr(survey, field, value)

    survey.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await auto_translate_record(db, "survey_definitions", survey.id, {"survey_name": survey.survey_name or "", "description": survey.description or ""})

    # Re-fetch with eager-loaded questions
    result = await db.execute(
        select(SurveyDefinition)
        .options(selectinload(SurveyDefinition.questions))
        .where(SurveyDefinition.id == survey.id)
    )
    survey = result.scalar_one()
    return APIResponse(data=SurveyDefinitionDetailOut.model_validate(survey))


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
    # Clean up question translations before soft-deleting
    qs = await db.execute(
        select(SurveyQuestion).where(SurveyQuestion.survey_id == survey_id)
    )
    for q in qs.scalars().all():
        await delete_translations(db, "survey_questions", q.id)
    await db.commit()
    await delete_translations(db, "survey_definitions", survey_id)
    return APIResponse(data={"id": survey.id, "deleted": True})


@admin_router.post("/{survey_id}/questions", response_model=APIResponse[SurveyQuestionOut], status_code=status.HTTP_201_CREATED)
async def add_question(
    db: DBDependency,
    admin: CurrentAdmin,
    survey_id: int,
    data: SurveyQuestionCreate,
):
    """Add a question to a survey (max 5 questions)."""
    survey = await _get_survey_or_404(db, survey_id)

    # Count existing questions
    qc_result = await db.execute(
        select(func.count(SurveyQuestion.id)).where(SurveyQuestion.survey_id == survey.id)
    )
    existing_count = qc_result.scalar() or 0
    if existing_count >= MAX_QUESTIONS_PER_SURVEY:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Maximum {MAX_QUESTIONS_PER_SURVEY} questions allowed per survey",
        )

    question = SurveyQuestion(**data.model_dump(), survey_id=survey.id)
    db.add(question)
    await db.commit()
    await db.refresh(question)
    # Auto-translate the question text
    await auto_translate_record(db, "survey_questions", question.id, {"question_text": question.question_text or ""})
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

    await delete_translations(db, "survey_questions", question_id)
    await db.delete(question)
    await db.commit()
    return APIResponse(data={"id": question_id, "deleted": True})


@admin_router.get("/{survey_id}/responses/export")
async def export_survey_responses(
    db: DBDependency,
    admin: CurrentAdmin,
    survey_id: int,
):
    """Export all survey responses as a JSON file."""
    survey = await _get_survey_or_404(db, survey_id)

    q_result = await db.execute(
        select(SurveyQuestion).where(SurveyQuestion.survey_id == survey.id)
    )
    questions_map: dict[int, SurveyQuestion] = {q.id: q for q in q_result.scalars().all()}

    stmt = (
        select(SurveyResponse)
        .options(selectinload(SurveyResponse.answers))
        .where(SurveyResponse.survey_id == survey.id)
        .order_by(SurveyResponse.id.asc())
    )
    result = await db.execute(stmt)
    responses = result.scalars().all()

    export_data = []
    for r in responses:
        d = SurveyResponseOut.model_validate(r).model_dump()
        enriched_answers = []
        for a in d.get("answers", []) or []:
            q = questions_map.get(a.get("question_id"))
            a["question_text"] = q.question_text if q else None
            a["question_type"] = q.question_type if q else None
            enriched_answers.append(a)
        d["answers"] = enriched_answers
        export_data.append(d)

    buf = io.StringIO()
    json.dump({"survey_id": survey_id, "survey_name": survey.survey_name, "total": len(export_data), "responses": export_data}, buf, indent=2, default=str)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="survey-{survey_id}-responses.json"'},
    )


@admin_router.get("/{survey_id}/responses", response_model=APIResponse[PaginatedResponse[SurveyResponseOut]])
async def list_survey_responses(
    db: DBDependency,
    admin: CurrentAdmin,
    survey_id: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List responses for a survey with question text/type."""
    survey = await _get_survey_or_404(db, survey_id)

    # Load all questions for this survey into a dict
    q_result = await db.execute(
        select(SurveyQuestion).where(SurveyQuestion.survey_id == survey.id)
    )
    questions_map: dict[int, SurveyQuestion] = {q.id: q for q in q_result.scalars().all()}

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
    responses = result.scalars().all()

    # Enrich answers with question text/type
    items_out = []
    for r in responses:
        d = SurveyResponseOut.model_validate(r).model_dump()
        enriched_answers = []
        for a in d.get("answers", []) or []:
            q = questions_map.get(a.get("question_id"))
            a["question_text"] = q.question_text if q else None
            a["question_type"] = q.question_type if q else None
            enriched_answers.append(a)
        d["answers"] = enriched_answers
        items_out.append(d)

    return APIResponse(
        data=PaginatedResponse(
            items=items_out,
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
    locale: OptionalLocale,
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
    item_dicts = [SurveyDefinitionOut.model_validate(s).model_dump() for s in result.scalars().all()]
    await merge_translations(db, item_dicts, "survey_definitions", locale)

    return APIResponse(
        data=PaginatedResponse(
            items=item_dicts,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@public_router.get("/{survey_id}", response_model=APIResponse[SurveyDefinitionDetailOut])
async def get_public_survey(
    db: DBDependency,
    locale: OptionalLocale,
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
