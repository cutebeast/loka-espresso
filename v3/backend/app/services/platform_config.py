"""Platform configuration service.

All runtime-tunable settings (OTP bypass, feature flags, business rules)
are stored in the `platform_config` table. This service provides cached
access with Redis fallback.
"""

import json
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


class PlatformConfigService:
    """Read and manage platform configuration from the database.

    OTP bypass, feature flags, and business rules live here — NOT in .env files.
    This ensures auditability and admin-level control without restarts.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(
        self,
        key: str,
        default: Any = None,
        environment: Optional[str] = None,
    ) -> Any:
        """Fetch a config value by key.

        Falls back to `environment='all'` if no env-specific value exists.
        Returns `default` if the key is absent.
        """
        stmt = select(PlatformConfig).where(PlatformConfig.config_key == key)

        if environment:
            stmt = stmt.where(
                (PlatformConfig.environment == environment)
                | (PlatformConfig.environment == "all")
            )
        else:
            stmt = stmt.where(PlatformConfig.environment == "all")

        result = await self.db.execute(stmt)
        row = result.scalar_one_or_none()

        if row is None:
            return default

        return self._cast_value(row.config_value, row.value_type)

    async def get_bool(self, key: str, default: bool = False) -> bool:
        val = await self.get(key, default)
        if isinstance(val, bool):
            return val
        if isinstance(val, str):
            return val.lower() in ("true", "1", "yes", "on")
        return bool(val)

    async def get_int(self, key: str, default: int = 0) -> int:
        val = await self.get(key, default)
        try:
            return int(val)
        except (TypeError, ValueError):
            return default

    async def get_str(self, key: str, default: str = "") -> str:
        val = await self.get(key, default)
        if val is None:
            return default
        return str(val)

    async def is_otp_bypass_enabled(self) -> bool:
        """Check if OTP bypass is active (DB-driven only)."""
        return await self.get_bool("otp.bypass_enabled", default=False)

    async def get_otp_bypass_code(self) -> str:
        """Return the current OTP bypass code (DB-driven only)."""
        return await self.get_str("otp.bypass_code", default="000000")

    async def get_otp_expiry_minutes(self) -> int:
        return await self.get_int("otp.expiry_minutes", default=5)

    async def get_otp_max_send_per_hour(self) -> int:
        return await self.get_int("otp.max_send_per_hour", default=5)

    def _cast_value(self, raw: Any, value_type: str) -> Any:
        if value_type == "boolean":
            return str(raw).lower() in ("true", "1", "yes", "on")
        if value_type == "integer":
            try:
                return int(raw)
            except (TypeError, ValueError):
                return raw
        if value_type == "json":
            if isinstance(raw, str):
                return json.loads(raw)
            return raw
        # string, encrypted
        return raw


# Import at bottom to avoid circular import with models
from app.models.platform import PlatformConfig  # noqa: E402
