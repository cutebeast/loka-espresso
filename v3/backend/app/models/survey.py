"""Survey & Voice of Customer models."""

from datetime import date, datetime, timezone
from typing import List

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin


class SurveyDefinition(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "survey_definitions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    survey_key: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    survey_name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    welcome_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    thank_you_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    completion_target: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_anonymous: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    allow_multiple_responses: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    reward_voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("voucher_definitions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    questions: Mapped[List["SurveyQuestion"]] = relationship(
        "SurveyQuestion", back_populates="survey", cascade="all, delete-orphan"
    )
    responses: Mapped[List["SurveyResponse"]] = relationship(
        "SurveyResponse", back_populates="survey", cascade="all, delete-orphan"
    )


class SurveyQuestion(Base):
    __tablename__ = "survey_questions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    survey_id: Mapped[int] = mapped_column(
        ForeignKey("survey_definitions.id", ondelete="CASCADE"), nullable=False
    )
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    question_type: Mapped[str] = mapped_column(String(20), nullable=False)
    answer_options: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    min_rating: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    max_rating: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    rating_labels: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    conditional_logic: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    survey: Mapped["SurveyDefinition"] = relationship(
        "SurveyDefinition", back_populates="questions"
    )
    answers: Mapped[List["SurveyAnswer"]] = relationship(
        "SurveyAnswer", back_populates="question", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "question_type IN ('single_choice','multiple_choice','rating_scale','text_open','nps','yes_no','dropdown','ranking','date','file_upload')",
            name="ck_survey_questions_question_type",
        ),
    )


class SurveyResponse(Base):
    __tablename__ = "survey_responses"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    survey_id: Mapped[int] = mapped_column(
        ForeignKey("survey_definitions.id", ondelete="CASCADE"), nullable=False
    )
    customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), nullable=True
    )
    respondent_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    nps_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    overall_satisfaction: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    source_channel: Mapped[str | None] = mapped_column(String(50), nullable=True)
    reward_granted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    consent_given: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ip_address: Mapped[str | None] = mapped_column(INET, nullable=True)
    data_retention_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    survey: Mapped["SurveyDefinition"] = relationship(
        "SurveyDefinition", back_populates="responses"
    )
    answers: Mapped[List["SurveyAnswer"]] = relationship(
        "SurveyAnswer", back_populates="response", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "nps_score BETWEEN 0 AND 10", name="ck_survey_responses_nps_score"
        ),
        CheckConstraint(
            "overall_satisfaction BETWEEN 1 AND 5",
            name="ck_survey_responses_overall_satisfaction",
        ),
    )


class SurveyAnswer(Base):
    __tablename__ = "survey_answers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    response_id: Mapped[int] = mapped_column(
        ForeignKey("survey_responses.id", ondelete="CASCADE"), nullable=False
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("survey_questions.id", ondelete="CASCADE"), nullable=False
    )
    answer_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    answer_detail: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    response: Mapped["SurveyResponse"] = relationship(
        "SurveyResponse", back_populates="answers"
    )
    question: Mapped["SurveyQuestion"] = relationship(
        "SurveyQuestion", back_populates="answers"
    )
