#!/usr/bin/env python3
"""Seed English admin-ui translation keys used by the admin portal.

Run: python scripts/seed_admin_ui_translations.py
"""

import os
import sys

import psycopg2
from psycopg2.extras import execute_values

def _db_url() -> str:
    url = os.getenv("DATABASE_URL_SYNC") or os.getenv("DATABASE_URL", "")
    if url.startswith("postgresql+asyncpg://"):
        url = url.replace("postgresql+asyncpg://", "postgresql://", 1)
    if url.startswith("postgresql://"):
        return url
    return "postgresql://fnb_user:fnb_pass@localhost:13334/fnb_enterprise_v3"

DB_URL = _db_url()

NAMESPACE = "admin-ui"
LOCALE = "en"

# section -> { key: source_text }
STRINGS = {
    "app": {
        "admin.app.adminPortal": "Admin Portal",
    },
    "common": {
        "admin.common.accessDenied": "Access Denied",
        "admin.common.loading": "Loading...",
        "admin.common.logout": "Logout",
        "admin.common.selectLanguage": "Select language",
        "admin.common.allStores": "All Stores",
        "admin.common.search": "Search",
        "admin.common.searchPlaceholder": "Search...",
        "admin.common.save": "Save",
        "admin.common.cancel": "Cancel",
        "admin.common.create": "Create",
        "admin.common.update": "Update",
        "admin.common.delete": "Delete",
        "admin.common.edit": "Edit",
        "admin.common.add": "Add",
        "admin.common.remove": "Remove",
        "admin.common.close": "Close",
        "admin.common.back": "Back",
        "admin.common.refresh": "Refresh",
        "admin.common.show": "Show",
        "admin.common.hide": "Hide",
        "admin.common.submit": "Submit",
        "admin.common.actions": "Actions",
        "admin.common.status": "Status",
        "admin.common.name": "Name",
        "admin.common.description": "Description",
        "admin.common.email": "Email",
        "admin.common.phone": "Phone",
        "admin.common.created": "Created",
        "admin.common.noResults": "No results",
        "admin.common.noData": "No data",
        "admin.common.yes": "Yes",
        "admin.common.no": "No",
        "admin.common.confirm": "Confirm",
        "admin.common.active": "Active",
        "admin.common.inactive": "Inactive",
        "admin.common.enabled": "Enabled",
        "admin.common.disabled": "Disabled",
        "admin.common.required": "Required",
        "admin.common.optional": "Optional",
        "admin.common.loadingWithEllipsis": "Loading...",
    },
    "gallery": {
        "admin.gallery.imageGallery": "Image Gallery",
        "admin.gallery.addImages": "Add Images",
        "admin.gallery.multipleImages": "Multiple images",
        "admin.gallery.galleryVideo": "Gallery Video",
        "admin.gallery.uploadVideo": "Upload Video",
        "admin.gallery.remove": "Remove",
    },
    "versionControl": {
        "admin.versionControl.title": "Version Control",
        "admin.versionControl.subtitle": "Build and deployment versions across all services",
        "admin.versionControl.version": "Version",
        "admin.versionControl.commit": "Commit",
        "admin.versionControl.built": "Built",
        "admin.versionControl.commitDate": "Commit Date",
        "admin.versionControl.loading": "Loading...",
        "admin.versionControl.unableToFetch": "Unable to fetch version — service may be down or version.json missing",
    },
    "twilioVerify": {
        "admin.twilioVerify.title": "Twilio Verify",
        "admin.twilioVerify.subtitle": "Configure Twilio Verify credentials for passwordless customer login",
        "admin.twilioVerify.setting": "Setting",
        "admin.twilioVerify.value": "Value",
        "admin.twilioVerify.accountSid": "Account SID",
        "admin.twilioVerify.authToken": "Auth Token",
        "admin.twilioVerify.serviceSid": "Verify Service SID",
        "admin.twilioVerify.useTestCredentials": "Use Test Credentials",
        "admin.twilioVerify.testAccountSid": "Test Account SID",
        "admin.twilioVerify.testAuthToken": "Test Auth Token",
        "admin.twilioVerify.helpText": "Twilio Verify sends SMS OTP codes for passwordless customer login. Get your credentials from the Twilio Console.",
        "admin.twilioVerify.warning": "Auth tokens are sensitive. They are stored encrypted at rest and only used server-side.",
        "admin.twilioVerify.saved": "Saved",
        "admin.twilioVerify.saveFailed": "Failed to save",
    },
    "layout": {
        "admin.layout.staffForbidden": "Staff accounts cannot access the admin portal.",
    },
    "translations": {
        "admin.translations.title": "Translations",
        "admin.translations.subtitle": "Manage UI translations for all three portals from one place",
        "admin.translations.syncToJson": "Sync to JSON",
        "admin.translations.syncing": "Syncing...",
        "admin.translations.howItWorksTitle": "How translations work",
        "admin.translations.howItWorksText": "All three portals share the same translations table in the database. Translations are segmented by namespace (pwa-ui, admin-ui, staff-ui). The PWA fetches translations dynamically on startup and caches them locally for 24 hours. After generating translations, click Sync to JSON to write them to the PWA's static locale files for offline fallback.",
        "admin.translations.tab.pwa": "Customer PWA",
        "admin.translations.tab.pwaDesc": "UI labels for customer-facing mobile app",
        "admin.translations.tab.admin": "Admin Portal",
        "admin.translations.tab.adminDesc": "UI labels for admin dashboard",
        "admin.translations.tab.staff": "Staff Portal",
        "admin.translations.tab.staffDesc": "UI labels for staff POS & operations",
        "admin.translations.loading": "Loading translations...",
        "admin.translations.searchPlaceholder": "Search keys...",
        "admin.translations.searchAriaLabel": "Search translation keys",
        "admin.translations.key": "Key",
        "admin.translations.englishSource": "EN (source)",
        "admin.translations.noKeys": "No keys match your search.",
        "admin.translations.selectSection": "Select a section from the left to view translations",
        "admin.translations.keyCount": "{{count}} keys in this section",
        "admin.translations.translateAll": "Translate All",
        "admin.translations.allLocale": "All {{locale}}",
        "admin.translations.autoLocale": "Auto {{locale}}",
        "admin.translations.saved": "Saved",
        "admin.translations.autoTranslating": "Auto-translating to {{locale}}...",
        "admin.translations.autoTranslatedProgress": "{{current}} / {{total}}",
        "admin.translations.autoTranslatedDone": "Auto-translated {{count}} keys for {{locale}}",
        "admin.translations.autoTranslateFailed": "Auto-translate failed",
        "admin.translations.noTranslations": "No translations in database for this portal",
        "admin.translations.noTranslationsDesc": "Use the Auto-Translate buttons to generate translations, or add them manually.",
    },
    "error": {
        "admin.error.title": "Something went wrong",
        "admin.error.generic": "An unexpected error occurred",
        "admin.error.tryAgain": "Try again",
        "admin.error.goToDashboard": "Go to Dashboard",
    },
    "dashboard": {
        "admin.dashboard.title": "Dashboard",
        "admin.dashboard.subtitle": "Business overview",
        "admin.dashboard.allStores": "All Stores",
        "admin.dashboard.to": "to",
        "admin.dashboard.totalOrders": "Total Orders",
        "admin.dashboard.totalRevenue": "Total Revenue",
        "admin.dashboard.activeOrders": "Active Orders",
        "admin.dashboard.totalCustomers": "Total Customers",
        "admin.dashboard.ordersByType": "Orders by Type",
        "admin.dashboard.noOrders": "No orders in this period",
        "admin.dashboard.orders": "orders",
        "admin.dashboard.revenue": "Revenue",
        "admin.dashboard.revenueForPeriod": "Revenue for selected period",
        "admin.dashboard.monthlyOrders": "Monthly Orders",
    },
    "login": {
        "admin.login.email": "Email",
        "admin.login.password": "Password",
        "admin.login.signIn": "Sign In",
        "admin.login.signingIn": "Signing in...",
        "admin.login.invalidCredentials": "Invalid email or password",
        "admin.login.emailPlaceholder": "Enter your email address",
        "admin.login.passwordPlaceholder": "Enter your password",
    },
    "nav": {
        "admin.nav.section.company": "Company",
        "admin.nav.section.support": "Support",
        "admin.nav.section.storeOps": "Store Operations",
        "admin.nav.dashboard": "Dashboard",
        "admin.nav.stores": "Stores",
        "admin.nav.stores.locations": "Store Locations",
        "admin.nav.stores.settings": "Store Settings",
        "admin.nav.menu": "Menu",
        "admin.nav.menu.categories": "Categories",
        "admin.nav.menu.items": "Items",
        "admin.nav.menu.bundleProducts": "Bundle Products",
        "admin.nav.menu.allergens": "Allergens",
        "admin.nav.menu.dietaryTags": "Dietary Tags",
        "admin.nav.menu.taxCategories": "Tax Categories",
        "admin.nav.loyalty": "Loyalty",
        "admin.nav.loyalty.tiers": "Tiers",
        "admin.nav.loyalty.accounts": "Accounts",
        "admin.nav.loyalty.ledger": "Ledger",
        "admin.nav.loyalty.settings": "Loyalty Settings",
        "admin.nav.marketing": "Marketing",
        "admin.nav.marketing.rewards": "Rewards",
        "admin.nav.marketing.promotions": "Promotions",
        "admin.nav.marketing.vouchers": "Vouchers",
        "admin.nav.marketing.voucherReport": "Voucher Report",
        "admin.nav.marketing.surveys": "Surveys",
        "admin.nav.marketing.surveyReport": "Survey Report",
        "admin.nav.marketing.referrals": "Referrals",
        "admin.nav.marketing.referralSettings": "Referral Settings",
        "admin.nav.marketing.checkins": "Check-ins",
        "admin.nav.marketing.checkinSettings": "Check-in Settings",
        "admin.nav.marketing.campaigns": "Campaigns",
        "admin.nav.marketing.campaignSettings": "Campaign Settings",
        "admin.nav.content": "Content",
        "admin.nav.content.infoCards": "Info Cards",
        "admin.nav.content.products": "Products",
        "admin.nav.content.events": "Events",
        "admin.nav.content.eventReport": "Event RSVP Report",
        "admin.nav.content.systemPages": "System Pages",
        "admin.nav.content.pwaSplash": "PWA Splash",
        "admin.nav.reports": "Reports",
        "admin.nav.auditLog": "Audit Log",
        "admin.nav.settings": "Settings",
        "admin.nav.settings.app": "App Settings",
        "admin.nav.settings.paymentGateway": "Payment Gateway",
        "admin.nav.settings.twilioVerify": "Twilio Verify",
        "admin.nav.settings.versionControl": "Version Control",
        "admin.nav.adminUser": "Admin User",
        "admin.nav.adminUser.listing": "Admin Listing",
        "admin.nav.adminUser.roles": "Admin Roles",
        "admin.nav.adminUser.profile": "My Profile",
        "admin.nav.translations": "Translations",
        "admin.nav.customers": "Customers List",
        "admin.nav.customers.consents": "Customer Consents",
        "admin.nav.customers.devices": "Customer Devices",
        "admin.nav.notifications": "Notifications",
        "admin.nav.notifications.list": "Notifications List",
        "admin.nav.notifications.templates": "Templates",
        "admin.nav.notifications.report": "Report",
        "admin.nav.feedback": "Feedback",
        "admin.nav.orders": "Orders",
        "admin.nav.refunds": "Refunds",
        "admin.nav.reservations": "Reservations",
        "admin.nav.reservations.list": "Reservation List",
        "admin.nav.tables": "Tables",
        "admin.nav.inventory": "Inventory",
        "admin.nav.inventory.categories": "Categories",
        "admin.nav.inventory.items": "Items",
        "admin.nav.inventory.stockLevels": "Stock Levels",
        "admin.nav.inventory.suppliers": "Suppliers",
        "admin.nav.inventory.movements": "Movements",
        "admin.nav.inventory.purchaseOrders": "Purchase Orders",
        "admin.nav.equipment": "Equipment",
        "admin.nav.equipment.list": "Equipment List",
        "admin.nav.equipment.reports": "Reports Ledger",
        "admin.nav.hygiene": "Hygiene",
        "admin.nav.staff": "Staff",
        "admin.nav.staff.list": "Staff List",
        "admin.nav.staff.roles": "Staff Roles",
        "admin.nav.staff.shifts": "Staff Shifts",
        "admin.nav.staff.attendance": "Attendance",
        "admin.nav.staff.tips": "Tips",
    },
}


def main() -> int:
    rows = []
    for section, keys in STRINGS.items():
        for key, text in keys.items():
            rows.append((NAMESPACE, key, LOCALE, text, text, "admin_ui", 0, ""))

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    # Upsert by composite unique key
    execute_values(
        cur,
        """
        INSERT INTO translations (
            namespace, translation_key, locale, translated_text, source_text,
            table_name, record_id, column_name
        ) VALUES %s
        ON CONFLICT (translation_key, locale)
        DO UPDATE SET
            translated_text = EXCLUDED.translated_text,
            source_text = EXCLUDED.source_text,
            namespace = EXCLUDED.namespace,
            updated_at = NOW()
        """,
        rows,
        template=None,
        page_size=500,
    )
    conn.commit()
    cur.close()
    conn.close()
    print(f"Seeded {len(rows)} admin-ui English translations.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
