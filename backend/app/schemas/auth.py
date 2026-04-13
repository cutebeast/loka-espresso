from pydantic import BaseModel
from typing import Optional


class SendOTPRequest(BaseModel):
    phone: str


class SendOTPResponse(BaseModel):
    message: str
    phone: str


class VerifyOTPRequest(BaseModel):
    phone: str
    code: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RegisterRequest(BaseModel):
    name: str
    email: Optional[str] = None


class LoginPasswordRequest(BaseModel):
    email: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class DeviceTokenRequest(BaseModel):
    token: str
    platform: Optional[str] = None
