"""Health check endpoints."""

from fastapi import APIRouter, status

router = APIRouter()


@router.get("", status_code=status.HTTP_200_OK)
async def health():
    return {"status": "healthy", "service": "fnb-enterprise-v3-api"}
