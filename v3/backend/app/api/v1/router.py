"""API v1 router assembly."""

from fastapi import APIRouter

from app.api.v1.endpoints.common import health
from app.api.v1.endpoints.common import upload
from app.api.v1.endpoints import auth
from app.api.v1.endpoints.admin import auth as admin_auth
from app.api.v1.endpoints.admin import stores as admin_stores
from app.api.v1.endpoints.admin import menu as admin_menu
from app.api.v1.endpoints.admin import inventory as admin_inventory
from app.api.v1.endpoints.admin import staff as admin_staff
from app.api.v1.endpoints.admin import dashboard as admin_dashboard
from app.api.v1.endpoints.admin import wallet as admin_wallet
from app.api.v1.endpoints.admin import vouchers as admin_vouchers
from app.api.v1.endpoints.admin import rewards as admin_rewards
from app.api.v1.endpoints.admin import audit as admin_audit
from app.api.v1.endpoints.admin import notifications as admin_notifications
from app.api.v1.endpoints.customer import cart as customer_cart
from app.api.v1.endpoints.customer import order as customer_order
from app.api.v1.endpoints.customer import profile as customer_profile
from app.api.v1.endpoints import translation as translation_endpoints
from app.api.v1.endpoints import payment as payment_endpoints
from app.api.v1.endpoints.admin import loyalty as admin_loyalty
from app.api.v1.endpoints.admin import reservations as admin_reservations
from app.api.v1.endpoints.admin import time_events as admin_time_events
from app.api.v1.endpoints.admin import inventory_movement as admin_inventory_movement
from app.api.v1.endpoints.admin import purchase_orders as admin_purchase_orders
from app.api.v1.endpoints.admin import tips as admin_tips
from app.api.v1.endpoints.admin import consents as admin_consents
from app.api.v1.endpoints.admin import devices as admin_devices
from app.api.v1.endpoints.admin import marketing as admin_marketing
from app.api.v1.endpoints.admin import referrals as admin_referrals
from app.api.v1.endpoints.admin import refunds as admin_refunds
from app.api.v1.endpoints.admin import surveys as admin_surveys
from app.api.v1.endpoints.admin import orders as admin_orders
from app.api.v1.endpoints.admin import customers as admin_customers
from app.api.v1.endpoints.admin import feedback as admin_feedback
from app.api.v1.endpoints.public import content as public_content
from app.api.v1.endpoints.admin import config as admin_config
from app.api.v1.endpoints.admin import dietary_tags as admin_dietary_tags
from app.api.v1.endpoints.admin import info_cards as admin_info_cards
from app.api.v1.endpoints.admin import system_pages as admin_system_pages
from app.api.v1.endpoints.admin import product_cards as admin_product_cards
from app.api.v1.endpoints.admin import event_cards as admin_event_cards
from app.api.v1.endpoints.admin import promo_banners as admin_promo_banners
from app.api.v1.endpoints.admin import content_sections as admin_content_sections
from app.api.v1.endpoints.admin import splash_screens as admin_splash_screens
from app.api.v1.endpoints.admin import checkins as admin_checkins
from app.api.v1.endpoints.public import menu as public_menu
from app.api.v1.endpoints.public import rsvp as public_rsvp
from app.api.v1.endpoints.public import store as public_store
from app.api.v1.endpoints.staff import staff_ops as staff_operations
from app.api.v1.endpoints.admin import scan as admin_scan
from app.api.v1.endpoints.admin import pos as admin_pos

api_router = APIRouter()

# System
api_router.include_router(health.router, prefix="/health", tags=["system"])
api_router.include_router(upload.router, tags=["upload"])

# Authentication
api_router.include_router(auth.router, tags=["authentication"])

# Admin
api_router.include_router(admin_auth.router, tags=["admin — authentication"])
api_router.include_router(admin_stores.router, tags=["admin — stores"])
api_router.include_router(admin_menu.router, tags=["admin — menu"])
api_router.include_router(admin_inventory.router, tags=["admin — inventory"])

# Time Events & Tips (must be before staff router to avoid /{staff_id} catching /time-events and /tips)
api_router.include_router(admin_time_events.admin_router, tags=["admin — staff"])
api_router.include_router(admin_time_events.staff_router, tags=["staff"])
api_router.include_router(admin_tips.router, tags=["admin — staff"])

api_router.include_router(admin_staff.router, tags=["admin — staff"])
api_router.include_router(admin_dashboard.router, tags=["admin — dashboard"])

# Wallets
api_router.include_router(admin_wallet.admin_router, tags=["admin — wallets"])
api_router.include_router(admin_wallet.wallet_alias_router, tags=["admin — wallets"])
api_router.include_router(admin_wallet.public_router, tags=["wallet"])

# Vouchers
api_router.include_router(admin_vouchers.admin_router, tags=["admin — vouchers"])
api_router.include_router(admin_vouchers.public_router, tags=["vouchers"])

# Rewards
api_router.include_router(admin_rewards.admin_router, tags=["admin — rewards"])
api_router.include_router(admin_rewards.public_router, tags=["rewards"])

# Audit Log
api_router.include_router(admin_audit.router, tags=["admin — audit log"])

# Notifications
api_router.include_router(admin_notifications.admin_router, tags=["admin — notifications"])
api_router.include_router(admin_notifications.public_router, tags=["notifications"])

# Public (no auth required)
api_router.include_router(public_store.router, tags=["public — stores"])
api_router.include_router(public_menu.router, tags=["public — menu"])
api_router.include_router(public_content.router, tags=["public — content"])
api_router.include_router(staff_operations.router, tags=["staff — operations"])
api_router.include_router(public_rsvp.router, tags=["public — events"])

# Inventory Movements
api_router.include_router(admin_inventory_movement.router, tags=["admin — inventory"])

# Purchase Orders
api_router.include_router(admin_purchase_orders.router, tags=["admin — inventory"])

# Consents
api_router.include_router(admin_consents.admin_router, tags=["admin — customers"])
api_router.include_router(admin_consents.public_router, tags=["customer"])

# Devices
api_router.include_router(admin_devices.admin_router, tags=["admin — customers"])
api_router.include_router(admin_devices.public_router, tags=["customer"])

# Content

# Marketing
api_router.include_router(admin_marketing.admin_router, tags=["admin — marketing"])

# Referrals
api_router.include_router(admin_referrals.admin_router, tags=["admin — referrals"])
api_router.include_router(admin_referrals.public_router, tags=["referrals"])
api_router.include_router(admin_refunds.router, tags=["admin — refunds"])

# Orders (admin)
api_router.include_router(admin_orders.router, tags=["admin — orders"])

# Scan (admin)
api_router.include_router(admin_scan.router, tags=["admin — scan"])

# POS (admin)
api_router.include_router(admin_pos.router, tags=["admin — pos"])

# Customers (admin)
api_router.include_router(admin_customers.router, tags=["admin — customers"])

# Surveys
api_router.include_router(admin_surveys.admin_router, tags=["admin — surveys"])
api_router.include_router(admin_surveys.public_router, tags=["surveys"])

# Feedback
api_router.include_router(admin_feedback.router, tags=["admin — feedback"])
api_router.include_router(admin_feedback.public_router, tags=["feedback"])

# Config
api_router.include_router(admin_config.router, tags=["admin — config"])

# Dietary Tags
api_router.include_router(admin_dietary_tags.router, tags=["admin — dietary tags"])

# Info Cards
api_router.include_router(admin_info_cards.router, tags=["admin — information cards"])
api_router.include_router(admin_system_pages.router, tags=["admin — system pages"])
api_router.include_router(admin_product_cards.router, tags=["admin — product cards"])
api_router.include_router(admin_event_cards.router, tags=["admin — event cards"])
api_router.include_router(admin_promo_banners.router, tags=["admin — promo banners"])
api_router.include_router(admin_content_sections.router, tags=["admin — content sections"])
api_router.include_router(admin_splash_screens.router, tags=["admin — splash screens"])
api_router.include_router(admin_checkins.router, tags=["admin — check-ins"])

# Reservations
api_router.include_router(
    admin_reservations.reservations_router,
    prefix="/admin/reservations",
    tags=["admin — reservations"],
)
api_router.include_router(
    admin_reservations.public_reservations_router,
    prefix="/reservations",
    tags=["reservations"],
)

# Loyalty
api_router.include_router(
    admin_loyalty.loyalty_router,
    prefix="/admin/loyalty",
    tags=["admin — loyalty"],
)
api_router.include_router(
    admin_loyalty.public_loyalty_router,
    prefix="/loyalty",
    tags=["loyalty"],
)

# Translations
api_router.include_router(translation_endpoints.router, prefix="/translations", tags=["translations"])

# Customer (auth required)
api_router.include_router(customer_profile.router, tags=["customer"])
api_router.include_router(customer_cart.router, tags=["cart"])
api_router.include_router(customer_order.router, tags=["orders"])

# Payments & webhooks
api_router.include_router(payment_endpoints.router, prefix="/payments", tags=["payments"])
api_router.include_router(payment_endpoints.webhook_router, prefix="/webhooks", tags=["webhooks"])
