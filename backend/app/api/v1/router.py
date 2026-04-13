from fastapi import APIRouter

from app.api.v1.endpoints import (
    auth, users, stores, menu, cart, orders, payments,
    loyalty, rewards, vouchers, favorites, notifications,
    referral, tables, wallet, promos, upload, splash, config,
    inventory, admin, admin_rewards, admin_vouchers, reports,
    admin_staff, admin_feedback, admin_system, admin_customers,
)

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(stores.router)
api_router.include_router(menu.router)
api_router.include_router(cart.router)
api_router.include_router(orders.router)
api_router.include_router(payments.router)
api_router.include_router(loyalty.router)
api_router.include_router(rewards.router)
api_router.include_router(vouchers.router)
api_router.include_router(favorites.router)
api_router.include_router(notifications.router)
api_router.include_router(referral.router)
api_router.include_router(tables.router)
api_router.include_router(wallet.router)
api_router.include_router(promos.router)
api_router.include_router(upload.router)
api_router.include_router(splash.router)
api_router.include_router(config.router)
api_router.include_router(inventory.router)
api_router.include_router(admin.router)
api_router.include_router(admin_rewards.router)
api_router.include_router(admin_vouchers.router)
api_router.include_router(reports.router)
api_router.include_router(admin_staff.router)
api_router.include_router(admin_feedback.router)
api_router.include_router(admin_system.router)
api_router.include_router(admin_customers.router)
