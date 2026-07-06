"""Application settings with pydantic-settings.

INFRASTRUCTURE CONFIG ONLY.
All runtime app settings (OTP bypass, feature flags, business rules) live in
the `platform_config` table and are fetched via PlatformConfigService.
"""

from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        env_prefix="",  # No prefix - read directly
    )

    # App
    app_name: str = "FNB Enterprise v3"
    environment: str = "development"
    debug: bool = False

    @field_validator("debug", mode="before")
    @classmethod
    def _coerce_debug(cls, v: object) -> bool:
        """Coerce various debug values to bool; ignore pre-existing env DEBUG var."""
        if isinstance(v, bool):
            return v
        if isinstance(v, str):
            return v.lower() in ("true", "1", "yes", "on")
        return False

    # Database
    database_url: str = "postgresql+asyncpg://fnb_user:fnb_pass@localhost:13334/fnb_enterprise_v3"
    database_url_sync: str | None = None

    # Redis
    redis_url: str = "redis://localhost:13335/0"
    redis_password: str | None = None

    # JWT
    jwt_secret: str = "super-secret-jwt-key-for-development-only-12345"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480  # 8 hours for admin portal usability
    jwt_refresh_expire_days: int = 7
    jwt_secret_previous: str | None = None

    @field_validator("jwt_algorithm")
    @classmethod
    def _validate_jwt_algorithm(cls, v: str) -> str:
        allowed = {"HS256", "HS384", "HS512", "RS256", "RS384", "RS512", "ES256", "ES384", "ES512", "PS256", "PS384", "PS512"}
        if v not in allowed:
            raise ValueError(f"Unsupported JWT algorithm: {v}. Must be one of {allowed}")
        return v

    @field_validator("jwt_secret")
    @classmethod
    def _validate_jwt_secret(cls, v: str, info) -> str:
        """Validate JWT secret: minimum 32-byte length and no default outside development."""
        if len(v.encode()) < 32:
            raise ValueError("JWT_SECRET must be at least 32 bytes")
        env = info.data.get("environment", "") if info.data else ""
        if env and env.lower() != "development" and v == "super-secret-jwt-key-for-development-only-12345":
            raise ValueError("Cannot use default JWT_SECRET outside development. Set JWT_SECRET env var.")
        return v

    @field_validator("database_url")
    @classmethod
    def _reject_default_db_outside_development(cls, v: str, info) -> str:
        env = info.data.get("environment", "") if info.data else ""
        if env and env.lower() != "development" and "fnb_user:fnb_pass" in v:
            raise ValueError("Cannot use default database credentials outside development. Set DATABASE_URL env var.")
        return v

    @model_validator(mode="after")
    def _set_database_url_sync(self) -> "Settings":
        if self.database_url_sync is None:
            self.database_url_sync = self.database_url.replace("postgresql+asyncpg://", "postgresql://")
        return self

    # Argon2
    argon2_time_cost: int = 3
    argon2_memory_cost: int = 65536
    argon2_parallelism: int = 4

    # CORS
    cors_origins: str = "http://localhost:13830,http://localhost:13810,http://localhost:13820"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    # Trusted Hosts
    trusted_hosts: str = "localhost,127.0.0.1"

    @property
    def allowed_hosts_list(self) -> List[str]:
        hosts = [h.strip() for h in self.trusted_hosts.split(",") if h.strip()]
        if not hosts:
            return ["*"]  # fallback for empty config
        return hosts

    def get_allowed_hosts(self) -> List[str]:
        if self.is_development:
            # Allow all in dev for local testing
            hosts = self.allowed_hosts_list
            if "localhost" not in hosts:
                hosts.append("localhost")
            if "127.0.0.1" not in hosts:
                hosts.append("127.0.0.1")
            return hosts
        return self.allowed_hosts_list

    # Uploads
    upload_dir: Path = Path("./uploads")
    max_upload_size_mb: int = 10

    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024

    # Webhooks
    webhook_api_key: str | None = None
    webhook_signing_secret: str | None = None  # generic fallback secret
    grabpay_webhook_secret: str | None = None
    webhook_verify_in_dev: bool = False  # If true, webhook signatures are required even in development

    # Web Push (VAPID)
    vapid_public_key: str | None = None
    vapid_private_key: str | None = None
    vapid_subject: str = "mailto:admin@example.com"

    # MaxMind
    maxmind_account_id: str | None = None
    maxmind_license_key: str | None = None

    # Stripe
    stripe_secret_key: str | None = None
    stripe_publishable_key: str | None = None
    stripe_webhook_secret: str | None = None
    stripe_checkout_success_url: str | None = None
    stripe_checkout_cancel_url: str | None = None
    stripe_simulator_checkout_url: str | None = "https://checkout.stripe.com/test-session/{session_id}"
    grabpay_simulator_session_url: str | None = "https://partner-api.grab.com/payments/v1/session/{session_id}?return_url={return_url}"

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def is_development(self) -> bool:
        return self.environment.lower() == "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
