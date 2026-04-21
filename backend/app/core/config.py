from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    DATABASE_URL: str
    DB_PASSWORD: str = ""
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 30
    CORS_ORIGINS: str = ""
    UPLOAD_DIR: str = "/root/fnb-super-app/uploads"
    WEBHOOK_API_KEY: str = ""
    WEBHOOK_SIGNING_SECRET: str = ""
    OTP_BYPASS_ALLOWED: bool = False

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    class Config:
        env_file = str(Path(__file__).resolve().parents[3] / ".env")
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
