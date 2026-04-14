from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class SurveyQuestionCreate(BaseModel):
    question_text: str
    question_type: str = "text"  # Allowed: "text", "single_choice", "rating", "dropdown"
    options: Optional[List[str]] = None
    is_required: bool = True
    sort_order: int = 0


class SurveyQuestionOut(SurveyQuestionCreate):
    id: int
    survey_id: int

    class Config:
        from_attributes = True


class SurveyCreate(BaseModel):
    title: str
    description: Optional[str] = None
    reward_voucher_id: Optional[int] = None
    is_active: bool = True
    questions: List[SurveyQuestionCreate] = []


class SurveyUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    reward_voucher_id: Optional[int] = None
    is_active: Optional[bool] = None
    questions: Optional[List[SurveyQuestionCreate]] = None


class SurveyOut(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    reward_voucher_id: Optional[int] = None
    is_active: bool
    questions: List[SurveyQuestionOut] = []
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SurveyListItem(BaseModel):
    id: int
    title: str
    is_active: bool
    question_count: int
    response_count: int
    reward_voucher_id: Optional[int] = None
    created_at: Optional[datetime] = None
