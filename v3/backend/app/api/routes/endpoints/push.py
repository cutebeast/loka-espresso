"""Web Push endpoints for the customer PWA."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.api.routes.deps import DBDependency
from app.core.config import get_settings
from app.services.web_push import get_vapid_public_key, send_web_push
from app.schemas.base import BaseSchema

public_router = APIRouter(prefix="/push", tags=["push"])


class VapidPublicKeyResponse(BaseSchema):
    public_key: str


class PushSendRequest(BaseSchema):
    subscription: dict
    payload: dict


@public_router.get("/vapid-public-key", response_model=VapidPublicKeyResponse)
async def vapid_public_key(db: DBDependency):
    """Return the VAPID public key the PWA should use for push subscriptions."""
    key = await get_vapid_public_key(db)
    if not key:
        raise HTTPException(status_code=503, detail="Web push is not configured")
    return VapidPublicKeyResponse(public_key=key)


@public_router.post("/send-test", include_in_schema=False)
async def send_test_push(data: PushSendRequest, db: DBDependency):
    """Internal test endpoint to verify a push subscription."""
    if get_settings().is_production:
        raise HTTPException(status_code=404, detail="Not found")
    result = await send_web_push(db, data.subscription, data.payload)
    if not result["success"]:
        raise HTTPException(status_code=502, detail=result.get("error", "Push failed"))
    return {"success": True}
