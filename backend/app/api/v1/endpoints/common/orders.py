from fastapi import APIRouter

from .order_crud import router as order_crud_router
from .order_confirm import router as order_confirm_router
from .order_status import router as order_status_router
from .order_webhooks import router as order_webhooks_router

router = APIRouter()
router.include_router(order_crud_router)
router.include_router(order_confirm_router)
router.include_router(order_status_router)
router.include_router(order_webhooks_router)
