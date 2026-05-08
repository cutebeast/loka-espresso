"""Survey domain schemas."""

from datetime import date, datetime
from typing import Literal

from pydantic import Field

from app.schemas.base import BaseSchema, TimestampedSchema


class SurveyQuestionBase(BaseSchema):
    question_text: str
    question_type: Literal[
        "single_choice", "multiple_choice", "rating_scale", "text_open",
        "nps", "yes_no", "dropdown", "ranking", "date", "file_upload",
    ]
    answer_options: dict | None = None
    min_rating: int | None = None
    max_rating: int | None = None
    rating_labels: dict | None = None
    is_required: bool = True
    conditional_logic: dict | None = None
    display_order: int = 0


class SurveyQuestionCreate(SurveyQuestionBase):
    pass


class SurveyQuestionUpdate(BaseSchema):
    question_text: str | None = None
    question_type: Literal[
        "single_choice", "multiple_choice", "rating_scale", "text_open",
        "nps", "yes_no", "dropdown", "ranking", "date", "file_upload",
    ] | None = None
    answer_options: dict | None = None
    min_rating: int | None = None
    max_rating: int | None = None
    rating_labels: dict | None = None
    is_required: bool | None = None
    conditional_logic: dict | None = None
    display_order: int | None = None


class SurveyQuestionOut(SurveyQuestionBase):
    id: int
    survey_id: int
    created_at: datetime


class SurveyDefinitionBase(BaseSchema):
    survey_key: str = Field(..., max_length=50)
    survey_name: str = Field(..., max_length=100)
    description: str | None = None
    welcome_message: str | None = None
    thank_you_message: str | None = None
    reward_voucher_id: int | None = None
    reward_points: int = Field(default=0, ge=0)
    completion_target: int | None = None
    is_anonymous: bool = False
    allow_multiple_responses: bool = False
    is_active: bool = True


class SurveyDefinitionCreate(SurveyDefinitionBase):
    pass


class SurveyDefinitionUpdate(BaseSchema):
    survey_key: str | None = Field(None, max_length=50)
    survey_name: str | None = Field(None, max_length=100)
    description: str | None = None
    welcome_message: str | None = None
    thank_you_message: str | None = None
    reward_voucher_id: int | None = None
    reward_points: int | None = Field(None, ge=0)
    completion_target: int | None = None
    is_anonymous: bool | None = None
    allow_multiple_responses: bool | None = None
    is_active: bool | None = None


class SurveyDefinitionOut(SurveyDefinitionBase, TimestampedSchema):
    id: int
    created_by: int | None = None
    deleted_at: datetime | None = None


class SurveyDefinitionDetailOut(SurveyDefinitionOut):
    questions: list[SurveyQuestionOut] = []


class SurveyAnswerCreate(BaseSchema):
    question_id: int
    answer_value: str | None = None
    answer_detail: dict | None = None


class SurveyAnswerOut(BaseSchema):
    id: int
    response_id: int
    question_id: int
    answer_value: str | None = None
    answer_detail: dict | None = None
    created_at: datetime


class SurveyResponseCreate(BaseSchema):
    answers: list[SurveyAnswerCreate]
    respondent_email: str | None = Field(None, max_length=255)
    nps_score: int | None = Field(None, ge=0, le=10)
    overall_satisfaction: int | None = Field(None, ge=1, le=5)
    source_channel: str | None = Field(None, max_length=50)
    consent_given: bool = False
    duration_seconds: int | None = None


class SurveyResponseOut(BaseSchema):
    id: int
    survey_id: int
    customer_id: int | None = None
    respondent_email: str | None = None
    nps_score: int | None = None
    overall_satisfaction: int | None = None
    source_channel: str | None = None
    reward_granted: bool = False
    consent_given: bool = False
    ip_address: str | None = None
    data_retention_until: date | None = None
    duration_seconds: int | None = None
    created_at: datetime
    answers: list[SurveyAnswerOut] = []
