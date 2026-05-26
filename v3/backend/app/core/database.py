"""Async SQLAlchemy database setup.

WARNING — Manual Commit Required
---------------------------------
This application uses ``autoflush=False`` and ``autocommit=False``.
Every endpoint that mutates data **MUST** explicitly call ``await db.commit()``
before returning.  Failure to commit results in silently discarded writes.
The ``get_db`` dependency only rolls back on exceptions — it never commits.
"""

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import declarative_base

from app.core.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    pool_size=20,
    max_overflow=10,
    pool_recycle=1800,
    echo=settings.debug,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)

Base = declarative_base()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency for DB sessions.

    Note: Does NOT auto-commit. Endpoints must explicitly commit.
    This enables multi-statement transactions across service calls.
    """
    import logging
    logger = logging.getLogger("database")
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            logger.debug("Rolling back session due to exception")
            await session.rollback()
            raise
