from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List

from app.core.database import get_db
from app.core.security import require_hq_access
from app.core.audit import log_action, get_client_ip
from app.models.user import User
from app.models.survey import Survey, SurveyQuestion, SurveyResponse
from app.schemas.survey import SurveyCreate, SurveyUpdate, SurveyOut, SurveyListItem, SurveyQuestionOut

router = APIRouter(prefix="/admin/surveys", tags=["Admin Surveys"])


@router.get("")
async def list_surveys(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    user: User = Depends(require_hq_access()),
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
    items = []
    for s in surveys:
        q_count = await db.execute(select(func.count()).select_from(SurveyQuestion).where(SurveyQuestion.survey_id == s.id))
        r_count = await db.execute(select(func.count()).select_from(SurveyResponse).where(SurveyResponse.survey_id == s.id))
        items.append(SurveyListItem(
            id=s.id, title=s.title, is_active=s.is_active,
            question_count=q_count.scalar() or 0,
            response_count=r_count.scalar() or 0,
            reward_voucher_id=s.reward_voucher_id,
            created_at=s.created_at,
        ))
    return {
        "surveys": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@router.get("/{survey_id}", response_model=SurveyOut)
async def get_survey(
    survey_id: int,
    user: User = Depends(require_hq_access()),
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


@router.post("", status_code=201, response_model=SurveyOut)
async def create_survey(
    data: SurveyCreate,
    request: Request,
    user: User = Depends(require_hq_access()),
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


@router.put("/{survey_id}", response_model=SurveyOut)
async def update_survey(
    survey_id: int,
    data: SurveyUpdate,
    request: Request,
    user: User = Depends(require_hq_access()),
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


@router.delete("/{survey_id}")
async def delete_survey(
    survey_id: int,
    request: Request,
    user: User = Depends(require_hq_access()),
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
from app.models.user import User as UserModel


@router.get("/{survey_id}/responses")
async def list_survey_responses(
    survey_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    user: User = Depends(require_hq_access()),
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

    # Build response items with answers and user info
    items = []
    for r in responses:
        # Get answers for this response
        answers_result = await db.execute(
            select(SurveyAnswer, SurveyQuestion)
            .join(SurveyQuestion, SurveyAnswer.question_id == SurveyQuestion.id)
            .where(SurveyAnswer.response_id == r.id)
            .order_by(SurveyQuestion.sort_order)
        )
        answers = []
        for answer, question in answers_result.all():
            answers.append({
                "question_id": question.id,
                "question_text": question.question_text,
                "question_type": question.question_type,
                "answer": answer.answer_text,
            })

        # Get user info
        user_name = "Anonymous"
        user_email = None
        if r.user_id:
            user_result = await db.execute(select(UserModel).where(UserModel.id == r.user_id))
            u = user_result.scalar_one_or_none()
            if u:
                user_name = u.name or "Anonymous"
                user_email = u.email

        items.append({
            "id": r.id,
            "user_name": user_name,
            "user_email": user_email,
            "rewarded": r.rewarded,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "answers": answers,
        })

    return {
        "survey_id": survey_id,
        "survey_title": survey.title,
        "responses": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@router.get("/{survey_id}/responses/export")
async def export_survey_responses(
    survey_id: int,
    user: User = Depends(require_hq_access()),
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

    items = []
    for r in responses:
        answers_result = await db.execute(
            select(SurveyAnswer, SurveyQuestion)
            .join(SurveyQuestion, SurveyAnswer.question_id == SurveyQuestion.id)
            .where(SurveyAnswer.response_id == r.id)
            .order_by(SurveyQuestion.sort_order)
        )
        answers = []
        for answer, question in answers_result.all():
            answers.append({
                "question_text": question.question_text,
                "question_type": question.question_type,
                "answer": answer.answer_text,
            })

        user_name = "Anonymous"
        if r.user_id:
            user_result = await db.execute(select(UserModel).where(UserModel.id == r.user_id))
            u = user_result.scalar_one_or_none()
            if u:
                user_name = u.name or "Anonymous"

        items.append({
            "user_name": user_name,
            "rewarded": r.rewarded,
            "submitted_at": r.created_at.isoformat() if r.created_at else None,
            "answers": answers,
        })

    return {
        "survey_title": survey.title,
        "total_responses": len(items),
        "responses": items,
    }
