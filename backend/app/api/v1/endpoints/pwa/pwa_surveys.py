"""PWA-facing endpoint for survey submission with auto-grant voucher.

POST /surveys/{id}/submit — submit answers, auto-grant voucher if eligible
GET /surveys/{id} — get survey detail + questions for PWA
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import Optional, List

from app.core.database import get_db
from app.core.security import require_role, now_utc, ensure_utc
from app.core.sanitization import sanitize_text_field
from app.models.customer import Customer
from app.models.user import RoleIDs
from app.models.survey import Survey, SurveyQuestion, SurveyResponse, SurveyAnswer
from app.models.voucher import Voucher, UserVoucher

router = APIRouter(prefix="/surveys", tags=["PWA Surveys"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class SurveyQuestionPwaOut(BaseModel):
    id: int
    question_text: str
    question_type: str  # text, single_choice, rating, dropdown
    options: Optional[List[str]] = None
    is_required: bool = True
    sort_order: int = 0

    class Config:
        from_attributes = True


class SurveyPwaOut(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    is_active: bool
    has_reward: bool
    questions: List[SurveyQuestionPwaOut]

    class Config:
        from_attributes = True


class AnswerIn(BaseModel):
    question_id: int
    answer_text: str


class SurveySubmitIn(BaseModel):
    answers: List[AnswerIn]


class SurveySubmitResult(BaseModel):
    success: bool
    message: str
    response_id: Optional[int] = None
    voucher_granted: bool = False
    voucher_code: Optional[str] = None
    voucher_title: Optional[str] = None
    already_submitted: bool = False


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/{survey_id}", response_model=SurveyPwaOut)
async def get_survey_for_pwa(
    survey_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get survey detail with questions for PWA display. Public (no auth)."""
    result = await db.execute(select(Survey).where(Survey.id == survey_id))
    survey = result.scalar_one_or_none()
    if not survey or not survey.is_active:
        raise HTTPException(404, "Survey not found")

    q_result = await db.execute(
        select(SurveyQuestion)
        .where(SurveyQuestion.survey_id == survey_id)
        .order_by(SurveyQuestion.sort_order)
    )
    questions = q_result.scalars().all()

    return SurveyPwaOut(
        id=survey.id,
        title=survey.title,
        description=survey.description,
        is_active=survey.is_active,
        has_reward=survey.reward_voucher_id is not None,
        questions=[SurveyQuestionPwaOut(
            id=q.id,
            question_text=q.question_text,
            question_type=q.question_type,
            options=q.options,
            is_required=q.is_required,
            sort_order=q.sort_order,
        ) for q in questions],
    )


@router.post("/{survey_id}/submit", response_model=SurveySubmitResult)
async def submit_survey(
    survey_id: int,
    data: SurveySubmitIn,
    user: Customer = Depends(require_role(RoleIDs.CUSTOMER, RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Submit survey answers. Auto-grants voucher if:
    - Survey has reward_voucher_id
    - User hasn't already submitted this survey
    - User hasn't exceeded voucher's max_uses_per_user
    - Voucher global max_uses not exceeded

    Guards prevent duplicate submissions and duplicate voucher grants.
    """
    # Fetch survey
    result = await db.execute(select(Survey).where(Survey.id == survey_id))
    survey = result.scalar_one_or_none()
    if not survey or not survey.is_active:
        raise HTTPException(404, "Survey not found")

    # Guard 1: Already submitted?
    existing = await db.execute(
        select(SurveyResponse).where(
            SurveyResponse.survey_id == survey_id,
            SurveyResponse.user_id == user.id,
        )
    )
    if existing.scalar_one_or_none():
        return SurveySubmitResult(
            success=False,
            message="You have already completed this survey",
            already_submitted=True,
        )

    # Validate question IDs belong to this survey
    q_result = await db.execute(
        select(SurveyQuestion).where(SurveyQuestion.survey_id == survey_id)
    )
    survey_questions = q_result.scalars().all()
    valid_q_ids = {q.id for q in survey_questions}

    for ans in data.answers:
        if ans.question_id not in valid_q_ids:
            raise HTTPException(400, f"Question {ans.question_id} does not belong to this survey")

    # Check required questions are answered
    required_q_ids = {q.id for q in survey_questions if q.is_required}
    answered_q_ids = {a.question_id for a in data.answers}
    missing = required_q_ids - answered_q_ids
    if missing:
        raise HTTPException(400, f"Missing answers for required questions: {missing}")

    # Create response
    response = SurveyResponse(
        survey_id=survey_id,
        user_id=user.id,
        rewarded=False,
    )
    db.add(response)
    await db.flush()

    # Create answers (with XSS sanitization)
    for ans in data.answers:
        answer = SurveyAnswer(
            response_id=response.id,
            question_id=ans.question_id,
            answer_text=sanitize_text_field(ans.answer_text, max_length=1000),
        )
        db.add(answer)

    # Auto-grant voucher if eligible
    voucher_granted = False
    voucher_code = None
    voucher_title = None

    if survey.reward_voucher_id:
        voucher_id = survey.reward_voucher_id

        # Fetch voucher
        v = await db.execute(select(Voucher).where(Voucher.id == voucher_id))
        voucher = v.scalar_one_or_none()
        if voucher and voucher.is_active and voucher.deleted_at is None:
            # Check global max
            global_ok = True
            if voucher.max_uses is not None and voucher.used_count >= voucher.max_uses:
                global_ok = False

            # Check per-user limit
            user_ok = True
            if global_ok:
                user_count = await db.execute(
                    select(func.count()).select_from(UserVoucher).where(
                        UserVoucher.user_id == user.id,
                        UserVoucher.voucher_id == voucher_id,
                    )
                )
                total = user_count.scalar() or 0
                max_per = voucher.max_uses_per_user
                if max_per is not None and total >= max_per:
                    user_ok = False

            if global_ok and user_ok:
                # Grant voucher with full instance data
                import secrets
                from datetime import timedelta, timezone

                now = now_utc()
                validity_days = voucher.validity_days or 30
                instance_code = f"{voucher.code}-{secrets.token_hex(4).upper()}"

                uv = UserVoucher(
                    user_id=user.id,
                    voucher_id=voucher_id,
                    source="survey",
                    source_id=response.id,
                    status="available",
                    code=instance_code,
                    expires_at=now + timedelta(days=validity_days),
                    discount_type=voucher.discount_type.value if hasattr(voucher.discount_type, 'value') else str(voucher.discount_type),
                    discount_value=voucher.discount_value,
                    min_spend=voucher.min_spend,
                )
                db.add(uv)
                response.rewarded = True
                voucher_granted = True
                voucher_code = instance_code
                voucher_title = voucher.title


    return SurveySubmitResult(
        success=True,
        message="Survey submitted successfully!" + (" Voucher granted!" if voucher_granted else ""),
        response_id=response.id,
        voucher_granted=voucher_granted,
        voucher_code=voucher_code,
        voucher_title=voucher_title,
    )
