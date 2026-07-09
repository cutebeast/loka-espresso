"""add_missing_admin_ui_profile_staff_new_reports_settings_segments_translations

Revision ID: 18bb306973d9
Revises: c66dbd78d076
Create Date: 2026-07-09 05:33:37.376145

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '18bb306973d9'
down_revision = 'c66dbd78d076'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Upsert missing admin-ui translation keys for profile, staff_new, reports, settings, and segments."""
    op.execute("""INSERT INTO translations (namespace, translation_key, locale, translated_text, source_text, is_auto_translated)
        VALUES
            ('admin-ui', 'profile.role_system_admin', 'en', 'System Admin', 'System Admin', false),
            ('admin-ui', 'profile.role_regional_manager', 'en', 'Regional Manager', 'Regional Manager', false),
            ('admin-ui', 'profile.role_store_manager', 'en', 'Store Manager', 'Store Manager', false),
            ('admin-ui', 'profile.role_readonly_analyst', 'en', 'Read-only Analyst', 'Read-only Analyst', false),
            ('admin-ui', 'profile.active', 'en', 'Active', 'Active', false),
            ('admin-ui', 'profile.inactive', 'en', 'Inactive', 'Inactive', false),
            ('admin-ui', 'profile.enabled', 'en', 'Enabled', 'Enabled', false),
            ('admin-ui', 'profile.disabled', 'en', 'Disabled', 'Disabled', false),
            ('admin-ui', 'profile.updating', 'en', 'Updating...', 'Updating...', false),
            ('admin-ui', 'profile.update_password', 'en', 'Update Password', 'Update Password', false),
            ('admin-ui', 'staff_new.copied', 'en', 'Copied!', 'Copied!', false),
            ('admin-ui', 'staff_new.copy_credentials', 'en', 'Copy Credentials', 'Copy Credentials', false),
            ('admin-ui', 'reports.sales_reports', 'en', 'Sales Reports', 'Sales Reports', false),
            ('admin-ui', 'reports.marketing_roi', 'en', 'Marketing ROI', 'Marketing ROI', false),
            ('admin-ui', 'settings.section_app', 'en', 'Application', 'Application', false),
            ('admin-ui', 'settings.section_app_desc', 'en', 'Core application settings such as name, currency, and timezone defaults', 'Core application settings such as name, currency, and timezone defaults', false),
            ('admin-ui', 'settings.section_otp', 'en', 'OTP / Authentication', 'OTP / Authentication', false),
            ('admin-ui', 'settings.section_otp_desc', 'en', 'One-time password verification and bypass configuration', 'One-time password verification and bypass configuration', false),
            ('admin-ui', 'settings.section_orders', 'en', 'Orders', 'Orders', false),
            ('admin-ui', 'settings.section_orders_desc', 'en', 'Order processing, cancellation windows, and commission settings', 'Order processing, cancellation windows, and commission settings', false),
            ('admin-ui', 'settings.section_notifications', 'en', 'Notifications', 'Notifications', false),
            ('admin-ui', 'settings.section_notifications_desc', 'en', 'Push notification and messaging settings', 'Push notification and messaging settings', false),
            ('admin-ui', 'settings.section_upload', 'en', 'Upload', 'Upload', false),
            ('admin-ui', 'settings.section_upload_desc', 'en', 'File upload size limits and allowed types', 'File upload size limits and allowed types', false),
            ('admin-ui', 'settings.section_reservation', 'en', 'Reservation', 'Reservation', false),
            ('admin-ui', 'settings.section_reservation_desc', 'en', 'Table reservation lead time, slot intervals, and capacity', 'Table reservation lead time, slot intervals, and capacity', false),
            ('admin-ui', 'settings.section_payments', 'en', 'Payments', 'Payments', false),
            ('admin-ui', 'settings.section_payments_desc', 'en', 'Payment processing, Stripe integration, and currency settings', 'Payment processing, Stripe integration, and currency settings', false),
            ('admin-ui', 'segments.all_users', 'en', 'All Users', 'All Users', false),
            ('admin-ui', 'segments.new_users', 'en', 'New Users', 'New Users', false),
            ('admin-ui', 'segments.loyal_customers', 'en', 'Loyal Customers', 'Loyal Customers', false),
            ('admin-ui', 'segments.inactive_users', 'en', 'Inactive Users', 'Inactive Users', false),
            ('admin-ui', 'segments.tier_members', 'en', 'Tier: {{name}}', 'Tier: {{name}}', false)
        ON CONFLICT (namespace, translation_key, locale) DO NOTHING;
    """)


def downgrade() -> None:
    """Remove the upserted admin-ui translation keys."""
    op.execute("""DELETE FROM translations
        WHERE namespace = 'admin-ui'
          AND locale = 'en'
          AND translation_key IN (
              'profile.role_system_admin',
              'profile.role_regional_manager',
              'profile.role_store_manager',
              'profile.role_readonly_analyst',
              'profile.active',
              'profile.inactive',
              'profile.enabled',
              'profile.disabled',
              'profile.updating',
              'profile.update_password',
              'staff_new.copied',
              'staff_new.copy_credentials',
              'reports.sales_reports',
              'reports.marketing_roi',
              'settings.section_app',
              'settings.section_app_desc',
              'settings.section_otp',
              'settings.section_otp_desc',
              'settings.section_orders',
              'settings.section_orders_desc',
              'settings.section_notifications',
              'settings.section_notifications_desc',
              'settings.section_upload',
              'settings.section_upload_desc',
              'settings.section_reservation',
              'settings.section_reservation_desc',
              'settings.section_payments',
              'settings.section_payments_desc',
              'segments.all_users',
              'segments.new_users',
              'segments.loyal_customers',
              'segments.inactive_users',
              'segments.tier_members'
          );
    """)
