from pydantic import AliasChoices, BaseModel, Field
from typing import Optional


class SendOTPRequest(BaseModel):
    phone: str


class SendOTPResponse(BaseModel):
    message: str
    phone: str
    session_id: str
    retry_after_seconds: int = 60
    expires_in_seconds: int = 300


class VerifyOTPRequest(BaseModel):
    phone: str
    code: str
    session_id: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token: Optional[str] = None
    refreshToken: Optional[str] = None
    token_type: str = "bearer"
    # True when verify-otp had to create the User record. Lets the PWA
    # route the new user to the profile-setup screen.
    is_new_user: bool = False


class RegisterRequest(BaseModel):
    name: str
    email: Optional[str] = None


class LoginPasswordRequest(BaseModel):
    email: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str = Field(validation_alias=AliasChoices("refresh_token", "refreshToken"))


class DeviceTokenRequest(BaseModel):
    token: str
    platform: Optional[str] = None
