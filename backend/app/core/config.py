from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    DATABASE_URL: str
    DB_PASSWORD: str = ""
    JWT_SECRET: str
    JWT_SECRET_PREVIOUS: str = ""  # Previous secret for key rotation grace period
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 30
    JWT_REFRESH_EXPIRE_DAYS: int = 7
    JWT_ISSUER: str = "fnb-api"
    JWT_AUDIENCE: str = "fnb-app"
    CORS_ORIGINS: str = ""
    UPLOAD_DIR: str = "/root/fnb-super-app/uploads"
    WEBHOOK_API_KEY: str = ""
    WEBHOOK_SIGNING_SECRET: str = ""
    POS_API_URL: str = ""  # External POS integration endpoint (e.g. https://pos-provider.com/api/orders). Leave empty for manual mode.
    OTP_BYPASS_ALLOWED: bool = False
    ENVIRONMENT: str = "development"
    ALLOW_CUSTOMER_RESET: bool = False  # Dangerous: wipes all customer data

    # Twilio SMS
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_PHONE_NUMBER: str = ""  # E.164 format, e.g. +1234567890

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    class Config:
        env_file = str(Path(__file__).resolve().parents[3] / ".env")
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
