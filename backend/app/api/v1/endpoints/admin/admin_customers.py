from fastapi import APIRouter

from .admin_customer_list import router as admin_customer_list_router
from .admin_customer_wallet import router as admin_customer_wallet_router
from .admin_customer_actions import router as admin_customer_actions_router

router = APIRouter()
router.include_router(admin_customer_list_router)
router.include_router(admin_customer_wallet_router)
router.include_router(admin_customer_actions_router)
