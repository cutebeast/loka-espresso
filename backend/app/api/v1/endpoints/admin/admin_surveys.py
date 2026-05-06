from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List

from app.core.database import get_db
from app.core.security import require_hq_access
from app.core.audit import log_action, get_client_ip
from app.models.admin_user import AdminUser
from app.models.survey import Survey, SurveyQuestion, SurveyResponse
from app.schemas.survey import SurveyCreate, SurveyUpdate, SurveyOut, SurveyListItem, SurveyQuestionOut

router = APIRouter(prefix="/admin", tags=["Admin Surveys"])


@router.get("/surveys")
async def list_surveys(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    user: AdminUser = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    count_q = select(func.count()).select_from(Survey)
    total_result = await db.execute(count_q)
    total = total_result.scalar() or 0

    result = await db.execute(
        select(Survey).order_by(Survey.created_at.desc())
        .offset((page - 1) * page_size).limit(page_size)
    )
    surveys = result.scalars().all()
    survey_ids = [s.id for s in surveys]
    if survey_ids:
        q_counts = {s_id: c for s_id, c in (
            await db.execute(
                select(SurveyQuestion.survey_id, func.count(SurveyQuestion.id))
                .where(SurveyQuestion.survey_id.in_(survey_ids)).group_by(SurveyQuestion.survey_id)
            )
        ).all()}
        r_counts = {s_id: c for s_id, c in (
            await db.execute(
                select(SurveyResponse.survey_id, func.count(SurveyResponse.id))
                .where(SurveyResponse.survey_id.in_(survey_ids)).group_by(SurveyResponse.survey_id)
            )
        ).all()}
    else:
        q_counts, r_counts = {}, {}
    items = []
    for s in surveys:
        items.append(SurveyListItem(
            id=s.id, title=s.title, is_active=s.is_active,
            question_count=q_counts.get(s.id, 0),
            response_count=r_counts.get(s.id, 0),
            reward_voucher_id=s.reward_voucher_id,
            created_at=s.created_at,
        ))
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@router.get("/surveys/{survey_id}", response_model=SurveyOut)
async def get_survey(
    survey_id: int,
    user: AdminUser = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Survey).where(Survey.id == survey_id))
    survey = result.scalar_one_or_none()
    if not survey:
        raise HTTPException(404)
    q_result = await db.execute(select(SurveyQuestion).where(SurveyQuestion.survey_id == survey_id).order_by(SurveyQuestion.sort_order))
    questions = q_result.scalars().all()
    return SurveyOut(
        id=survey.id, title=survey.title, description=survey.description,
        reward_voucher_id=survey.reward_voucher_id, is_active=survey.is_active,
        questions=[SurveyQuestionOut(
            id=q.id, survey_id=q.survey_id, question_text=q.question_text,
            question_type=q.question_type, options=q.options, is_required=q.is_required,
            sort_order=q.sort_order,
        ) for q in questions],
        created_at=survey.created_at,
    )


@router.post("/surveys", status_code=201, response_model=SurveyOut)
async def create_survey(
    data: SurveyCreate,
    request: Request,
    user: AdminUser = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    if data.questions and len(data.questions) > 5:
        raise HTTPException(status_code=400, detail="Maximum 5 questions per survey")
    for q in (data.questions or []):
        if q.question_type not in ("rating", "single_choice", "text", "dropdown"):
            raise HTTPException(status_code=400, detail=f"Invalid question type: {q.question_type}. Allowed: rating, single_choice, text, dropdown")
    survey = Survey(
        title=data.title, description=data.description,
        reward_voucher_id=data.reward_voucher_id, is_active=data.is_active,
    )
    db.add(survey)
    await db.flush()
    questions = []
    for i, q in enumerate(data.questions):
        sq = SurveyQuestion(
            survey_id=survey.id, question_text=q.question_text,
            question_type=q.question_type, options=q.options,
            is_required=q.is_required, sort_order=i,
        )
        db.add(sq)
        questions.append(sq)
    await db.flush()
    ip = get_client_ip(request)
    await log_action(db, action="CREATE_SURVEY", user_id=user.id, entity_type="survey", entity_id=survey.id, details={"title": survey.title}, ip_address=ip)
    return SurveyOut(
        id=survey.id, title=survey.title, description=survey.description,
        reward_voucher_id=survey.reward_voucher_id, is_active=survey.is_active,
        questions=[SurveyQuestionOut(
            id=q.id, survey_id=q.survey_id, question_text=q.question_text,
            question_type=q.question_type, options=q.options, is_required=q.is_required,
            sort_order=q.sort_order,
        ) for q in questions],
        created_at=survey.created_at,
    )


@router.put("/surveys/{survey_id}", response_model=SurveyOut)
async def update_survey(
    survey_id: int,
    data: SurveyUpdate,
    request: Request,
    user: AdminUser = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Survey).where(Survey.id == survey_id))
    survey = result.scalar_one_or_none()
    if not survey:
        raise HTTPException(404)
    if data.questions is not None:
        if len(data.questions) > 5:
            raise HTTPException(status_code=400, detail="Maximum 5 questions per survey")
        for q in data.questions:
            if q.question_type not in ("rating", "single_choice", "text", "dropdown"):
                raise HTTPException(status_code=400, detail=f"Invalid question type: {q.question_type}. Allowed: rating, single_choice, text, dropdown")
    if data.title is not None:
        survey.title = data.title
    if data.description is not None:
        survey.description = data.description
    if data.reward_voucher_id is not None:
        survey.reward_voucher_id = data.reward_voucher_id
    if data.is_active is not None:
        survey.is_active = data.is_active
    if data.questions is not None:
        old_q = await db.execute(select(SurveyQuestion).where(SurveyQuestion.survey_id == survey_id))
        for q in old_q.scalars().all():
            await db.delete(q)
        await db.flush()
        for i, q in enumerate(data.questions):
            sq = SurveyQuestion(
                survey_id=survey_id, question_text=q.question_text,
                question_type=q.question_type, options=q.options,
                is_required=q.is_required, sort_order=i,
            )
            db.add(sq)
    await db.flush()
    q_result = await db.execute(select(SurveyQuestion).where(SurveyQuestion.survey_id == survey_id).order_by(SurveyQuestion.sort_order))
    questions = q_result.scalars().all()
    ip = get_client_ip(request)
    await log_action(db, action="UPDATE_SURVEY", user_id=user.id, entity_type="survey", entity_id=survey_id, details={"title": survey.title}, ip_address=ip)
    return SurveyOut(
        id=survey.id, title=survey.title, description=survey.description,
        reward_voucher_id=survey.reward_voucher_id, is_active=survey.is_active,
        questions=[SurveyQuestionOut(
            id=q.id, survey_id=q.survey_id, question_text=q.question_text,
            question_type=q.question_type, options=q.options, is_required=q.is_required,
            sort_order=q.sort_order,
        ) for q in questions],
        created_at=survey.created_at,
    )


@router.delete("/surveys/{survey_id}")
async def delete_survey(
    survey_id: int,
    request: Request,
    user: AdminUser = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Survey).where(Survey.id == survey_id))
    survey = result.scalar_one_or_none()
    if not survey:
        raise HTTPException(404)
    ip = get_client_ip(request)
    await log_action(db, action="DELETE_SURVEY", user_id=user.id, entity_type="survey", entity_id=survey_id, details={"title": survey.title}, ip_address=ip)
    await db.delete(survey)
    return {"message": "Survey deleted"}


# ============================================================================
# SURVEY RESPONSES / REPORTS
# ============================================================================

from app.models.survey import SurveyAnswer
from app.models.customer import Customer


@router.get("/surveys/{survey_id}/responses")
async def list_survey_responses(
    survey_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    user: AdminUser = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    """Get all responses for a survey with answers and user info."""
    # Verify survey exists
    survey_result = await db.execute(select(Survey).where(Survey.id == survey_id))
    survey = survey_result.scalar_one_or_none()
    if not survey:
        raise HTTPException(404, detail="Survey not found")

    # Get total count
    count_q = select(func.count()).select_from(SurveyResponse).where(SurveyResponse.survey_id == survey_id)
    total_result = await db.execute(count_q)
    total = total_result.scalar() or 0

    # Get paginated responses
    result = await db.execute(
        select(SurveyResponse)
        .where(SurveyResponse.survey_id == survey_id)
        .order_by(SurveyResponse.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    responses = result.scalars().all()

    response_ids = [r.id for r in responses]
    user_ids = [r.user_id for r in responses if r.user_id]

    answers_map: dict[int, list[dict]] = {r_id: [] for r_id in response_ids}
    if response_ids:
        answers_result = await db.execute(
            select(SurveyAnswer.response_id, SurveyAnswer.question_id, SurveyAnswer.answer_text,
                   SurveyQuestion.question_text, SurveyQuestion.question_type)
            .join(SurveyQuestion, SurveyAnswer.question_id == SurveyQuestion.id)
            .where(SurveyAnswer.response_id.in_(response_ids))
            .order_by(SurveyQuestion.sort_order)
        )
        for row in answers_result.all():
            answers_map.setdefault(row[0], []).append({
                "question_id": row[1],
                "question_text": row[3],
                "question_type": row[4],
                "answer": row[2],
            })

    customer_map: dict[int, tuple[str, Optional[str]]] = {}
    if user_ids:
        cu_result = await db.execute(select(Customer.id, Customer.name, Customer.email).where(Customer.id.in_(user_ids)))
        for row in cu_result.all():
            customer_map[row[0]] = (row[1] or "Anonymous", row[2])

    items = []
    for r in responses:
        name, email = customer_map.get(r.user_id, ("Anonymous", None))
        items.append({
            "id": r.id,
            "user_name": name,
            "user_email": email,
            "rewarded": r.rewarded,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "answers": answers_map.get(r.id, []),
        })

    return {
        "survey_id": survey_id,
        "survey_title": survey.title,
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@router.get("/surveys/{survey_id}/responses/export")
async def export_survey_responses(
    survey_id: int,
    user: AdminUser = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    """Export all survey responses as JSON (no pagination)."""
    survey_result = await db.execute(select(Survey).where(Survey.id == survey_id))
    survey = survey_result.scalar_one_or_none()
    if not survey:
        raise HTTPException(404, detail="Survey not found")

    result = await db.execute(
        select(SurveyResponse)
        .where(SurveyResponse.survey_id == survey_id)
        .order_by(SurveyResponse.created_at.desc())
    )
    responses = result.scalars().all()

    response_ids = [r.id for r in responses]
    user_ids = [r.user_id for r in responses if r.user_id]

    answers_map = {}
    if response_ids:
        answers_result = await db.execute(
            select(SurveyAnswer.response_id, SurveyAnswer.answer_text,
                   SurveyQuestion.question_text, SurveyQuestion.question_type)
            .join(SurveyQuestion, SurveyAnswer.question_id == SurveyQuestion.id)
            .where(SurveyAnswer.response_id.in_(response_ids))
            .order_by(SurveyQuestion.sort_order)
        )
        for row in answers_result.all():
            answers_map.setdefault(row[0], []).append({
                "question_text": row[2],
                "question_type": row[3],
                "answer": row[1],
            })

    customer_map: dict[int, str] = {}
    if user_ids:
        cu_result = await db.execute(select(Customer.id, Customer.name).where(Customer.id.in_(user_ids)))
        for row in cu_result.all():
            customer_map[row[0]] = row[1] or "Anonymous"

    items = []
    for r in responses:
        items.append({
            "user_name": customer_map.get(r.user_id, "Anonymous"),
            "rewarded": r.rewarded,
            "submitted_at": r.created_at.isoformat() if r.created_at else None,
            "answers": answers_map.get(r.id, []),
        })

    return {
        "survey_title": survey.title,
        "total_responses": len(items),
        "responses": items,
    }
