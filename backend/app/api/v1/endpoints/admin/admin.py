from fastapi import APIRouter

from .admin_dashboard import router as admin_dashboard_router
from .admin_stores import router as admin_stores_router
from .admin_menu import router as admin_menu_router
from .admin_tables import router as admin_tables_router
from .admin_customizations import router as admin_customizations_router
from .admin_reports_store import router as admin_reports_store_router

router = APIRouter()
router.include_router(admin_dashboard_router)
router.include_router(admin_stores_router)
router.include_router(admin_menu_router)
router.include_router(admin_tables_router)
router.include_router(admin_customizations_router)
router.include_router(admin_reports_store_router)
