from fastapi import APIRouter

from app.api.v1.endpoints.admin import (
    admin, admin_rewards, admin_vouchers, admin_staff,
    admin_feedback, admin_system, admin_customers,
    admin_marketing, admin_surveys, admin_content,
    admin_banners, admin_broadcasts, admin_loyalty_tiers,
    admin_pwa_mgmt, admin_inventory, admin_reports, admin_scan_cron,
)
from app.api.v1.endpoints.pwa import (
    pwa_wallet, pwa_promos, pwa_surveys, pwa_content,
    cart, checkout, loyalty, menu, wallet,
    order_tracking, favorites, referral,
)
from app.api.v1.endpoints.common import (
    auth, users, config, splash, upload,
    notifications, orders, payments, promos,
    tables, vouchers, rewards,
)

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(users.router)
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
api_router.include_router(admin_inventory.router)
api_router.include_router(admin.router)
api_router.include_router(admin_rewards.router)
api_router.include_router(admin_vouchers.router)
api_router.include_router(admin_reports.router)
api_router.include_router(admin_staff.router)
api_router.include_router(admin_feedback.router)
api_router.include_router(admin_system.router)
api_router.include_router(admin_customers.router)
api_router.include_router(admin_marketing.router)
api_router.include_router(admin_surveys.router)
api_router.include_router(admin_banners.router)
api_router.include_router(admin_broadcasts.router)
api_router.include_router(admin_loyalty_tiers.router)
api_router.include_router(admin_pwa_mgmt.router)
api_router.include_router(admin_content.router)
api_router.include_router(pwa_promos.router)
api_router.include_router(pwa_surveys.router)
api_router.include_router(pwa_wallet.router)
api_router.include_router(pwa_content.router)
api_router.include_router(admin_scan_cron.router)
api_router.include_router(checkout.router)
api_router.include_router(order_tracking.router)
