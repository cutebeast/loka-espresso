"""Application settings with pydantic-settings.

INFRASTRUCTURE CONFIG ONLY.
All runtime app settings (OTP bypass, feature flags, business rules) live in
the `platform_config` table and are fetched via PlatformConfigService.
"""

from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_name: str = "FNB Enterprise v3"
    environment: str = "development"
    debug: bool = False

    # Database
    database_url: str
    database_url_sync: str | None = None

    # Redis
    redis_url: str = "redis://localhost:13335/0"
    redis_password: str | None = None

    # JWT
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 30
    jwt_refresh_expire_days: int = 7
    jwt_secret_previous: str | None = None

    @field_validator("jwt_secret")
    @classmethod
    def _validate_jwt_secret(cls, v: str) -> str:
        if len(v.encode()) < 32:
            raise ValueError("JWT_SECRET must be at least 32 bytes")
        return v

    # Argon2
    argon2_time_cost: int = 3
    argon2_memory_cost: int = 65536
    argon2_parallelism: int = 4

    # CORS
    cors_origins: str = "http://localhost:13801,http://localhost:13802,http://localhost:13803"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    # Uploads
    upload_dir: Path = Path("./uploads")
    max_upload_size_mb: int = 10

    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024

    # Webhooks
    webhook_api_key: str = ""
    webhook_signing_secret: str = ""

    # Twilio
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_from_number: str | None = None

    # MaxMind
    maxmind_account_id: str | None = None
    maxmind_license_key: str | None = None

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def is_development(self) -> bool:
        return self.environment.lower() == "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
