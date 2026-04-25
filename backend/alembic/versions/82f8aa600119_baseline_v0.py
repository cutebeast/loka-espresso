"""Consolidated baseline: create all tables from current models.

This migration is the single baseline that creates every table, enum,
constraint, and index required for a fresh database.  It is placed at the
start of the Alembic chain so that ``alembic upgrade head`` works on an
empty PostgreSQL instance.

All statements use ``IF NOT EXISTS`` so the migration is idempotent when
run against a partially-created schema.

Revision ID: 82f8aa600119
Revises: 
Create Date: 2025-04-25 12:54:00.000000
"""

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = "82f8aa600119"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create all tables, enums, constraints and indexes."""

    # ── Enums (idempotent via pg_type guard) ─────────────────────────
    op.execute(text("""DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'discounttype') THEN
            CREATE TYPE discounttype AS ENUM ('percent', 'fixed', 'free_item');
        END IF;
    END $$;"""))

    op.execute(text("""DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'movement_type') THEN
            CREATE TYPE movement_type AS ENUM ('received', 'waste', 'transfer_out', 'transfer_in', 'cycle_count', 'adjustment');
        END IF;
    END $$;"""))

    op.execute(text("""DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'orderstatus') THEN
            CREATE TYPE orderstatus AS ENUM ('pending', 'paid', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled');
        END IF;
    END $$;"""))

    op.execute(text("""DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ordertype') THEN
            CREATE TYPE ordertype AS ENUM ('dine_in', 'pickup', 'delivery');
        END IF;
    END $$;"""))

    op.execute(text("""DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rewardtype') THEN
            CREATE TYPE rewardtype AS ENUM ('free_item', 'discount_voucher', 'custom');
        END IF;
    END $$;"""))

    op.execute(text("""DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'staffrole') THEN
            CREATE TYPE staffrole AS ENUM ('manager', 'assistant_manager', 'barista', 'cashier', 'delivery');
        END IF;
    END $$;"""))

    op.execute(text("""DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'txtype') THEN
            CREATE TYPE txtype AS ENUM ('earn', 'redeem', 'expire');
        END IF;
    END $$;"""))

    op.execute(text("""DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wallettxtype') THEN
            CREATE TYPE wallettxtype AS ENUM ('topup', 'payment', 'refund', 'promo_credit', 'admin_adjustment');
        END IF;
    END $$;"""))

    # ── Tables (dependency order, foreign keys inline) ───────────────

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS app_config (
        id SERIAL NOT NULL,
        key VARCHAR(100) NOT NULL,
        value TEXT,
        updated_at TIMESTAMP WITH TIME ZONE,
        PRIMARY KEY (id)
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS loyalty_tiers (
        id SERIAL NOT NULL,
        name VARCHAR(50) NOT NULL,
        min_points INTEGER NOT NULL,
        points_multiplier DECIMAL(3, 2) NOT NULL,
        benefits JSON,
        sort_order INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE,
        PRIMARY KEY (id),
        CONSTRAINT ck_loyalty_tiers_min_points_nonnegative CHECK (min_points >= 0),
        UNIQUE (name)
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS menu_categories (
        id SERIAL NOT NULL,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100),
        display_order INTEGER NOT NULL,
        is_active BOOLEAN NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE,
        PRIMARY KEY (id)
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS otp_sessions (
        id SERIAL NOT NULL,
        phone VARCHAR(20) NOT NULL,
        session_token VARCHAR(64) NOT NULL,
        code VARCHAR(6) NOT NULL,
        verified BOOLEAN NOT NULL,
        send_count INTEGER NOT NULL,
        verify_attempts INTEGER NOT NULL,
        resend_available_at TIMESTAMP WITH TIME ZONE,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        verified_at TIMESTAMP WITH TIME ZONE,
        provider VARCHAR(30),
        delivery_status VARCHAR(30),
        failure_reason TEXT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (id)
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS permissions (
        id SERIAL NOT NULL,
        name VARCHAR(100) NOT NULL,
        resource VARCHAR(50) NOT NULL,
        action VARCHAR(50) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE,
        PRIMARY KEY (id),
        UNIQUE (name)
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS splash_content (
        id SERIAL NOT NULL,
        image_url VARCHAR(500),
        title VARCHAR(255),
        subtitle VARCHAR(255),
        cta_text VARCHAR(100),
        cta_url VARCHAR(500),
        dismissible BOOLEAN NOT NULL,
        active_from TIMESTAMP WITH TIME ZONE,
        active_until TIMESTAMP WITH TIME ZONE,
        is_active BOOLEAN NOT NULL,
        fallback_title VARCHAR(255) NOT NULL,
        fallback_subtitle VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE,
        PRIMARY KEY (id)
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS stores (
        id SERIAL NOT NULL,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) NOT NULL,
        address TEXT,
        lat DECIMAL(10, 7),
        lng DECIMAL(10, 7),
        phone VARCHAR(20),
        image_url VARCHAR(500),
        opening_hours JSON,
        pickup_lead_minutes INTEGER NOT NULL,
        delivery_radius_km DECIMAL(5, 2) NOT NULL,
        delivery_fee DECIMAL(10, 2) NOT NULL,
        min_order DECIMAL(10, 2) NOT NULL,
        is_active BOOLEAN NOT NULL,
        pos_integration_enabled BOOLEAN NOT NULL,
        delivery_integration_enabled BOOLEAN NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE,
        PRIMARY KEY (id),
        CONSTRAINT ck_stores_delivery_fee_nonnegative CHECK (delivery_fee >= 0),
        CONSTRAINT ck_stores_min_order_nonnegative CHECK (min_order >= 0)
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS user_types (
        id INTEGER NOT NULL,
        name VARCHAR(50) NOT NULL,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE,
        PRIMARY KEY (id),
        UNIQUE (name)
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS information_cards (
        id SERIAL NOT NULL,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255),
        short_description VARCHAR(500),
        long_description TEXT,
        icon VARCHAR(50),
        image_url VARCHAR(500),
        store_id INTEGER,
        start_date TIMESTAMP WITH TIME ZONE,
        end_date TIMESTAMP WITH TIME ZONE,
        is_active BOOLEAN NOT NULL,
        position INTEGER NOT NULL,
        content_type VARCHAR(20) NOT NULL,
        gallery_urls JSON,
        action_url VARCHAR(500),
        action_type VARCHAR(20),
        action_label VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE,
        PRIMARY KEY (id),
        CONSTRAINT uq_info_card_slug UNIQUE (store_id, slug),
        CONSTRAINT ck_info_card_content_type CHECK (content_type IN ('system', 'information', 'product', 'promotion')),
        FOREIGN KEY(store_id) REFERENCES stores (id)
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS inventory_categories (
        id SERIAL NOT NULL,
        store_id INTEGER NOT NULL,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100),
        display_order INTEGER NOT NULL,
        is_active BOOLEAN NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE,
        PRIMARY KEY (id),
        FOREIGN KEY(store_id) REFERENCES stores (id) ON DELETE CASCADE
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS menu_items (
        id SERIAL NOT NULL,
        category_id INTEGER NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        base_price DECIMAL(10, 2) NOT NULL,
        image_url VARCHAR(500),
        customization_options JSON,
        is_available BOOLEAN NOT NULL,
        is_featured BOOLEAN DEFAULT 'false' NOT NULL,
        display_order INTEGER NOT NULL,
        popularity INTEGER NOT NULL,
        dietary_tags JSON,
        deleted_at TIMESTAMP WITH TIME ZONE,
        PRIMARY KEY (id),
        CONSTRAINT ck_menu_items_base_price CHECK (base_price >= 0),
        FOREIGN KEY(category_id) REFERENCES menu_categories (id)
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS roles (
        id INTEGER NOT NULL,
        name VARCHAR(50) NOT NULL,
        typical_user_type_id INTEGER,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE,
        PRIMARY KEY (id),
        UNIQUE (name),
        FOREIGN KEY(typical_user_type_id) REFERENCES user_types (id)
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS store_tables (
        id SERIAL NOT NULL,
        store_id INTEGER NOT NULL,
        table_number VARCHAR(20) NOT NULL,
        qr_code_url VARCHAR(500),
        qr_token VARCHAR(64),
        qr_generated_at TIMESTAMP WITH TIME ZONE,
        capacity INTEGER NOT NULL,
        is_active BOOLEAN NOT NULL,
        is_occupied BOOLEAN NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE,
        PRIMARY KEY (id),
        CONSTRAINT ck_tables_capacity CHECK (capacity > 0),
        CONSTRAINT uq_store_table_number UNIQUE (store_id, table_number),
        FOREIGN KEY(store_id) REFERENCES stores (id) ON DELETE CASCADE
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS vouchers (
        id SERIAL NOT NULL,
        code VARCHAR(50) NOT NULL,
        description VARCHAR(500),
        discount_type discounttype NOT NULL,
        discount_value DECIMAL(10, 2) NOT NULL,
        min_spend DECIMAL(10, 2) NOT NULL,
        max_uses INTEGER,
        used_count INTEGER NOT NULL,
        valid_from TIMESTAMP WITH TIME ZONE,
        valid_until TIMESTAMP WITH TIME ZONE,
        is_active BOOLEAN NOT NULL,
        title VARCHAR(255),
        body TEXT,
        image_url VARCHAR(500),
        promo_type VARCHAR(50),
        store_id INTEGER,
        terms JSON,
        how_to_redeem TEXT,
        short_description VARCHAR(500),
        long_description TEXT,
        validity_days INTEGER,
        max_uses_per_user INTEGER,
        deleted_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (id),
        CONSTRAINT ck_vouchers_discount_value CHECK (discount_value >= 0),
        FOREIGN KEY(store_id) REFERENCES stores (id) ON DELETE SET NULL
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS customization_options (
        id SERIAL NOT NULL,
        menu_item_id INTEGER NOT NULL,
        name VARCHAR(100) NOT NULL,
        price_adjustment DECIMAL(10, 2) NOT NULL,
        is_active BOOLEAN NOT NULL,
        display_order INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY(menu_item_id) REFERENCES menu_items (id) ON DELETE CASCADE
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS inventory_items (
        id SERIAL NOT NULL,
        store_id INTEGER NOT NULL,
        name VARCHAR(255) NOT NULL,
        current_stock DECIMAL(10, 2) NOT NULL,
        unit VARCHAR(50),
        reorder_level DECIMAL(10, 2) NOT NULL,
        is_active BOOLEAN NOT NULL,
        category_id INTEGER,
        updated_at TIMESTAMP WITH TIME ZONE,
        PRIMARY KEY (id),
        CONSTRAINT ck_inventory_items_quantity_nonnegative CHECK (current_stock >= 0),
        CONSTRAINT ck_inventory_items_reorder_level_nonnegative CHECK (reorder_level >= 0),
        FOREIGN KEY(store_id) REFERENCES stores (id) ON DELETE CASCADE,
        FOREIGN KEY(category_id) REFERENCES inventory_categories (id) ON DELETE SET NULL
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS rewards (
        id SERIAL NOT NULL,
        name VARCHAR(255) NOT NULL,
        description VARCHAR(500),
        points_cost INTEGER NOT NULL,
        reward_type rewardtype NOT NULL,
        item_id INTEGER,
        discount_value DECIMAL(10, 2),
        min_spend DECIMAL(10, 2) NOT NULL,
        image_url VARCHAR(500),
        stock_limit INTEGER,
        total_redeemed INTEGER NOT NULL,
        code VARCHAR(50),
        is_active BOOLEAN NOT NULL,
        terms JSON,
        how_to_redeem TEXT,
        short_description VARCHAR(500),
        long_description TEXT,
        validity_days INTEGER,
        deleted_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE,
        PRIMARY KEY (id),
        CONSTRAINT ck_rewards_points_cost CHECK (points_cost >= 0),
        CONSTRAINT ck_rewards_discount_value CHECK (discount_value >= 0),
        CONSTRAINT ck_rewards_min_spend CHECK (min_spend >= 0),
        FOREIGN KEY(item_id) REFERENCES menu_items (id) ON DELETE SET NULL,
        UNIQUE (code)
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS role_permissions (
        role_id INTEGER NOT NULL,
        permission_id INTEGER NOT NULL,
        PRIMARY KEY (role_id, permission_id),
        FOREIGN KEY(role_id) REFERENCES roles (id),
        FOREIGN KEY(permission_id) REFERENCES permissions (id)
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS role_user_type (
        role_id INTEGER NOT NULL,
        user_type_id INTEGER NOT NULL,
        PRIMARY KEY (role_id, user_type_id),
        FOREIGN KEY(role_id) REFERENCES roles (id),
        FOREIGN KEY(user_type_id) REFERENCES user_types (id)
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS surveys (
        id SERIAL NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        reward_voucher_id INTEGER,
        is_active BOOLEAN NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
        PRIMARY KEY (id),
        FOREIGN KEY(reward_voucher_id) REFERENCES vouchers (id) ON DELETE SET NULL
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL NOT NULL,
        phone VARCHAR(20),
        email VARCHAR(255),
        name VARCHAR(255),
        password_hash VARCHAR(255),
        user_type_id INTEGER NOT NULL,
        role_id INTEGER NOT NULL,
        avatar_url VARCHAR(500),
        referral_code VARCHAR(50),
        referred_by INTEGER,
        referral_count INTEGER NOT NULL,
        referral_earnings DECIMAL(10, 2) NOT NULL,
        is_active BOOLEAN NOT NULL,
        phone_verified BOOLEAN NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE,
        PRIMARY KEY (id),
        FOREIGN KEY(user_type_id) REFERENCES user_types (id) ON DELETE CASCADE,
        FOREIGN KEY(role_id) REFERENCES roles (id) ON DELETE CASCADE,
        UNIQUE (referral_code),
        FOREIGN KEY(referred_by) REFERENCES users (id) ON DELETE SET NULL
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL NOT NULL,
        user_id INTEGER,
        store_id INTEGER,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100),
        entity_id INTEGER,
        details JSON,
        ip_address VARCHAR(45),
        status VARCHAR(20) NOT NULL,
        method VARCHAR(10),
        path VARCHAR(500),
        status_code INTEGER,
        user_agent VARCHAR(255),
        request_id VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY(user_id) REFERENCES users (id),
        FOREIGN KEY(store_id) REFERENCES stores (id)
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS cart_items (
        id SERIAL NOT NULL,
        user_id INTEGER NOT NULL,
        store_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        customization_option_ids JSON,
        customization_hash VARCHAR(64),
        unit_price DECIMAL(10, 2) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (id),
        CONSTRAINT ck_cart_item_quantity_positive CHECK (quantity > 0),
        CONSTRAINT ck_cart_item_unit_price_nonnegative CHECK (unit_price >= 0),
        CONSTRAINT uq_cart_item_identity UNIQUE (user_id, store_id, item_id, customization_hash),
        FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY(store_id) REFERENCES stores (id) ON DELETE CASCADE,
        FOREIGN KEY(item_id) REFERENCES menu_items (id) ON DELETE CASCADE
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS checkout_tokens (
        id SERIAL NOT NULL,
        token VARCHAR(64) NOT NULL,
        user_id INTEGER NOT NULL,
        store_id INTEGER NOT NULL,
        voucher_code VARCHAR(100),
        reward_id INTEGER,
        discount_type VARCHAR(20),
        discount_amount DECIMAL(10, 2) NOT NULL,
        subtotal DECIMAL(10, 2) NOT NULL,
        delivery_fee DECIMAL(10, 2) NOT NULL,
        total DECIMAL(10, 2) NOT NULL,
        is_used BOOLEAN NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY(store_id) REFERENCES stores (id) ON DELETE CASCADE
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS device_tokens (
        id SERIAL NOT NULL,
        user_id INTEGER NOT NULL,
        token VARCHAR(500) NOT NULL,
        platform VARCHAR(20),
        is_active BOOLEAN NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS favorites (
        id SERIAL NOT NULL,
        user_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (id),
        CONSTRAINT uq_favorites_user_item UNIQUE (user_id, item_id),
        FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY(item_id) REFERENCES menu_items (id) ON DELETE CASCADE
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS inventory_movements (
        id SERIAL NOT NULL,
        store_id INTEGER NOT NULL,
        inventory_item_id INTEGER NOT NULL,
        movement_type movement_type NOT NULL,
        quantity DECIMAL(10, 2) NOT NULL,
        balance_after DECIMAL(10, 2) NOT NULL,
        note TEXT NOT NULL,
        attachment_path VARCHAR(500),
        created_by INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY(store_id) REFERENCES stores (id) ON DELETE CASCADE,
        FOREIGN KEY(inventory_item_id) REFERENCES inventory_items (id) ON DELETE CASCADE,
        FOREIGN KEY(created_by) REFERENCES users (id) ON DELETE CASCADE
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS loyalty_accounts (
        id SERIAL NOT NULL,
        user_id INTEGER NOT NULL,
        points_balance INTEGER NOT NULL,
        tier VARCHAR(50) NOT NULL,
        total_points_earned INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE,
        PRIMARY KEY (id),
        FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS marketing_campaigns (
        id SERIAL NOT NULL,
        name VARCHAR(255) NOT NULL,
        channel VARCHAR(30) NOT NULL,
        subject VARCHAR(500),
        body TEXT,
        image_url VARCHAR(500),
        cta_url VARCHAR(500),
        audience VARCHAR(50) NOT NULL,
        store_id INTEGER,
        status VARCHAR(30) NOT NULL,
        provider VARCHAR(50),
        provider_campaign_id VARCHAR(255),
        scheduled_at TIMESTAMP WITH TIME ZONE,
        sent_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        total_recipients INTEGER NOT NULL,
        sent_count INTEGER NOT NULL,
        delivered_count INTEGER NOT NULL,
        opened_count INTEGER NOT NULL,
        clicked_count INTEGER NOT NULL,
        failed_count INTEGER NOT NULL,
        cost DECIMAL(10, 2),
        created_by INTEGER,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE,
        PRIMARY KEY (id),
        FOREIGN KEY(store_id) REFERENCES stores (id) ON DELETE SET NULL,
        FOREIGN KEY(created_by) REFERENCES users (id) ON DELETE SET NULL
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS notification_broadcasts (
        id SERIAL NOT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT,
        audience VARCHAR(50) NOT NULL,
        store_id INTEGER,
        scheduled_at TIMESTAMP WITH TIME ZONE,
        sent_at TIMESTAMP WITH TIME ZONE,
        sent_count INTEGER NOT NULL,
        open_count INTEGER NOT NULL,
        created_by INTEGER,
        is_archived BOOLEAN NOT NULL,
        status VARCHAR(20) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY(store_id) REFERENCES stores (id) ON DELETE SET NULL,
        FOREIGN KEY(created_by) REFERENCES users (id) ON DELETE SET NULL
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL NOT NULL,
        user_id INTEGER NOT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT,
        type VARCHAR(50),
        data JSON,
        image_url VARCHAR(500),
        is_read BOOLEAN NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS orders (
        id SERIAL NOT NULL,
        user_id INTEGER NOT NULL,
        store_id INTEGER NOT NULL,
        table_id INTEGER,
        order_number VARCHAR(50) NOT NULL,
        order_type ordertype NOT NULL,
        items JSON NOT NULL,
        subtotal DECIMAL(10, 2) NOT NULL,
        delivery_fee DECIMAL(10, 2) NOT NULL,
        discount DECIMAL(10, 2) NOT NULL,
        voucher_discount DECIMAL(10, 2) NOT NULL,
        reward_discount DECIMAL(10, 2) NOT NULL,
        voucher_code VARCHAR(100),
        reward_redemption_code VARCHAR(100),
        total DECIMAL(10, 2) NOT NULL,
        status orderstatus NOT NULL,
        pickup_time TIMESTAMP WITH TIME ZONE,
        delivery_address JSON,
        payment_method VARCHAR(50),
        payment_status VARCHAR(50) NOT NULL,
        loyalty_points_earned INTEGER NOT NULL,
        notes TEXT,
        delivery_provider VARCHAR(50),
        delivery_status VARCHAR(50),
        delivery_external_id VARCHAR(255),
        delivery_quote_id VARCHAR(255),
        delivery_tracking_url VARCHAR(500),
        delivery_eta_minutes INTEGER,
        delivery_courier_name VARCHAR(255),
        delivery_courier_phone VARCHAR(50),
        delivery_last_event_at TIMESTAMP WITH TIME ZONE,
        pos_synced_at TIMESTAMP WITH TIME ZONE,
        pos_synced_by INTEGER,
        delivery_dispatched_at TIMESTAMP WITH TIME ZONE,
        delivery_dispatched_by INTEGER,
        staff_notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE,
        PRIMARY KEY (id),
        CONSTRAINT ck_orders_subtotal CHECK (subtotal >= 0),
        CONSTRAINT ck_orders_total CHECK (total >= 0),
        CONSTRAINT ck_orders_delivery_fee CHECK (delivery_fee >= 0),
        CONSTRAINT ck_orders_discount CHECK (discount >= 0),
        FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY(store_id) REFERENCES stores (id) ON DELETE CASCADE,
        FOREIGN KEY(table_id) REFERENCES store_tables (id) ON DELETE SET NULL,
        FOREIGN KEY(pos_synced_by) REFERENCES users (id) ON DELETE SET NULL,
        FOREIGN KEY(delivery_dispatched_by) REFERENCES users (id) ON DELETE SET NULL
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS payment_methods (
        id SERIAL NOT NULL,
        user_id INTEGER NOT NULL,
        type VARCHAR(50),
        provider VARCHAR(50),
        last4 VARCHAR(4),
        is_default BOOLEAN NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE,
        PRIMARY KEY (id),
        FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS promo_banners (
        id SERIAL NOT NULL,
        title VARCHAR(255) NOT NULL,
        short_description VARCHAR(255),
        long_description TEXT,
        image_url VARCHAR(500),
        action_type VARCHAR(20),
        terms JSON,
        how_to_redeem TEXT,
        voucher_id INTEGER,
        survey_id INTEGER,
        position INTEGER NOT NULL,
        store_id INTEGER,
        start_date TIMESTAMP WITH TIME ZONE,
        end_date TIMESTAMP WITH TIME ZONE,
        is_active BOOLEAN NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE,
        PRIMARY KEY (id),
        FOREIGN KEY(voucher_id) REFERENCES vouchers (id) ON DELETE SET NULL,
        FOREIGN KEY(survey_id) REFERENCES surveys (id) ON DELETE SET NULL,
        FOREIGN KEY(store_id) REFERENCES stores (id) ON DELETE SET NULL
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS referrals (
        id SERIAL NOT NULL,
        referrer_id INTEGER NOT NULL,
        invitee_id INTEGER,
        code VARCHAR(50) NOT NULL,
        reward_amount DECIMAL(10, 2),
        referrer_reward_paid BOOLEAN NOT NULL,
        referred_user_order_count INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY(referrer_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY(invitee_id) REFERENCES users (id) ON DELETE SET NULL
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS staff (
        id SERIAL NOT NULL,
        user_id INTEGER,
        store_id INTEGER NOT NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(20),
        role staffrole NOT NULL,
        is_active BOOLEAN NOT NULL,
        pin_code VARCHAR(10),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE,
        PRIMARY KEY (id),
        FOREIGN KEY(user_id) REFERENCES users (id),
        FOREIGN KEY(store_id) REFERENCES stores (id)
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS survey_questions (
        id SERIAL NOT NULL,
        survey_id INTEGER NOT NULL,
        question_text TEXT NOT NULL,
        question_type VARCHAR(20) NOT NULL,
        options JSON,
        is_required BOOLEAN NOT NULL,
        sort_order INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY(survey_id) REFERENCES surveys (id) ON DELETE CASCADE
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS survey_responses (
        id SERIAL NOT NULL,
        survey_id INTEGER NOT NULL,
        user_id INTEGER,
        rewarded BOOLEAN NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        PRIMARY KEY (id),
        CONSTRAINT uq_survey_response UNIQUE (survey_id, user_id),
        FOREIGN KEY(survey_id) REFERENCES surveys (id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE SET NULL
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS token_blacklist (
        id SERIAL NOT NULL,
        jti VARCHAR(255) NOT NULL,
        user_id INTEGER NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS user_addresses (
        id SERIAL NOT NULL,
        user_id INTEGER NOT NULL,
        label VARCHAR(100) NOT NULL,
        address TEXT NOT NULL,
        lat DECIMAL(10, 7),
        lng DECIMAL(10, 7),
        is_default BOOLEAN NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS user_store_access (
        user_id INTEGER NOT NULL,
        store_id INTEGER NOT NULL,
        assigned_at TIMESTAMP WITH TIME ZONE NOT NULL,
        assigned_by INTEGER,
        is_primary BOOLEAN NOT NULL,
        PRIMARY KEY (user_id, store_id),
        FOREIGN KEY(user_id) REFERENCES users (id),
        FOREIGN KEY(store_id) REFERENCES stores (id),
        FOREIGN KEY(assigned_by) REFERENCES users (id)
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS wallets (
        id SERIAL NOT NULL,
        user_id INTEGER NOT NULL,
        balance DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(10) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE,
        PRIMARY KEY (id),
        CONSTRAINT ck_wallets_balance CHECK (balance >= 0),
        FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS feedback (
        id SERIAL NOT NULL,
        user_id INTEGER,
        store_id INTEGER NOT NULL,
        order_id INTEGER,
        rating INTEGER NOT NULL,
        comment TEXT,
        tags JSON,
        is_resolved BOOLEAN NOT NULL,
        admin_reply TEXT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (id),
        CONSTRAINT ck_feedback_rating CHECK (rating >= 1 AND rating <= 5),
        FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE SET NULL,
        FOREIGN KEY(store_id) REFERENCES stores (id) ON DELETE CASCADE,
        FOREIGN KEY(order_id) REFERENCES orders (id) ON DELETE SET NULL
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS loyalty_transactions (
        id SERIAL NOT NULL,
        user_id INTEGER NOT NULL,
        order_id INTEGER,
        store_id INTEGER,
        points INTEGER NOT NULL,
        type txtype NOT NULL,
        description TEXT,
        created_by INTEGER,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY(order_id) REFERENCES orders (id) ON DELETE SET NULL,
        FOREIGN KEY(store_id) REFERENCES stores (id) ON DELETE SET NULL,
        FOREIGN KEY(created_by) REFERENCES users (id) ON DELETE SET NULL
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL NOT NULL,
        order_id INTEGER NOT NULL,
        menu_item_id INTEGER,
        name VARCHAR(255) NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price DECIMAL(10, 2) NOT NULL,
        customizations JSON,
        line_total DECIMAL(10, 2) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (id),
        CONSTRAINT ck_order_items_quantity_positive CHECK (quantity > 0),
        CONSTRAINT ck_order_items_unit_price_nonnegative CHECK (unit_price >= 0),
        CONSTRAINT ck_order_items_line_total_nonnegative CHECK (line_total >= 0),
        FOREIGN KEY(order_id) REFERENCES orders (id) ON DELETE CASCADE,
        FOREIGN KEY(menu_item_id) REFERENCES menu_items (id) ON DELETE SET NULL
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS order_status_history (
        id SERIAL NOT NULL,
        order_id INTEGER NOT NULL,
        status orderstatus NOT NULL,
        note TEXT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY(order_id) REFERENCES orders (id) ON DELETE CASCADE
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS payments (
        id SERIAL NOT NULL,
        order_id INTEGER NOT NULL,
        method VARCHAR(50),
        provider VARCHAR(50),
        amount DECIMAL(10, 2) NOT NULL,
        status VARCHAR(50) NOT NULL,
        transaction_id VARCHAR(255),
        provider_reference VARCHAR(255),
        idempotency_key VARCHAR(255),
        failure_reason TEXT,
        settled_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (id),
        CONSTRAINT ck_payments_amount CHECK (amount >= 0),
        UNIQUE (order_id),
        FOREIGN KEY(order_id) REFERENCES orders (id) ON DELETE CASCADE
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS pin_attempts (
        id SERIAL NOT NULL,
        staff_id INTEGER NOT NULL,
        attempted_at TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY(staff_id) REFERENCES staff (id) ON DELETE CASCADE
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS staff_shifts (
        id SERIAL NOT NULL,
        staff_id INTEGER NOT NULL,
        store_id INTEGER NOT NULL,
        clock_in TIMESTAMP WITH TIME ZONE NOT NULL,
        clock_out TIMESTAMP WITH TIME ZONE,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (id),
        CONSTRAINT ck_shifts_clock_out_gt_clock_in CHECK ((clock_out IS NULL) OR (clock_out > clock_in)),
        FOREIGN KEY(staff_id) REFERENCES staff (id),
        FOREIGN KEY(store_id) REFERENCES stores (id)
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS survey_answers (
        id SERIAL NOT NULL,
        response_id INTEGER NOT NULL,
        question_id INTEGER NOT NULL,
        answer_text TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY(response_id) REFERENCES survey_responses (id) ON DELETE CASCADE,
        FOREIGN KEY(question_id) REFERENCES survey_questions (id) ON DELETE CASCADE
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS table_occupancy_snapshot (
        table_id INTEGER NOT NULL,
        store_id INTEGER NOT NULL,
        is_occupied BOOLEAN NOT NULL,
        current_order_id INTEGER,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (table_id),
        FOREIGN KEY(table_id) REFERENCES store_tables (id) ON DELETE CASCADE,
        FOREIGN KEY(store_id) REFERENCES stores (id) ON DELETE CASCADE,
        FOREIGN KEY(current_order_id) REFERENCES orders (id) ON DELETE SET NULL
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS user_rewards (
        id SERIAL NOT NULL,
        user_id INTEGER NOT NULL,
        reward_id INTEGER NOT NULL,
        store_id INTEGER,
        redeemed_at TIMESTAMP WITH TIME ZONE NOT NULL,
        order_id INTEGER,
        is_used BOOLEAN NOT NULL,
        status VARCHAR(20),
        expires_at TIMESTAMP WITH TIME ZONE,
        used_at TIMESTAMP WITH TIME ZONE,
        redemption_code VARCHAR(50),
        points_spent INTEGER,
        reward_snapshot JSON,
        min_spend DECIMAL(10, 2),
        PRIMARY KEY (id),
        CONSTRAINT uq_user_reward UNIQUE (user_id, reward_id),
        FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY(reward_id) REFERENCES rewards (id) ON DELETE CASCADE,
        FOREIGN KEY(store_id) REFERENCES stores (id) ON DELETE SET NULL,
        FOREIGN KEY(order_id) REFERENCES orders (id) ON DELETE SET NULL,
        UNIQUE (redemption_code)
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS user_vouchers (
        id SERIAL NOT NULL,
        user_id INTEGER NOT NULL,
        voucher_id INTEGER NOT NULL,
        store_id INTEGER,
        applied_at TIMESTAMP WITH TIME ZONE NOT NULL,
        order_id INTEGER,
        source VARCHAR(30),
        source_id INTEGER,
        status VARCHAR(20),
        code VARCHAR(50),
        expires_at TIMESTAMP WITH TIME ZONE,
        used_at TIMESTAMP WITH TIME ZONE,
        discount_type VARCHAR(20),
        discount_value DECIMAL(10, 2),
        min_spend DECIMAL(10, 2),
        PRIMARY KEY (id),
        CONSTRAINT uq_user_voucher UNIQUE (user_id, voucher_id),
        FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY(voucher_id) REFERENCES vouchers (id) ON DELETE CASCADE,
        FOREIGN KEY(store_id) REFERENCES stores (id) ON DELETE SET NULL,
        FOREIGN KEY(order_id) REFERENCES orders (id) ON DELETE SET NULL,
        UNIQUE (code)
    );"""))

    op.execute(text("""
    CREATE TABLE IF NOT EXISTS wallet_transactions (
        id SERIAL NOT NULL,
        wallet_id INTEGER NOT NULL,
        user_id INTEGER,
        amount DECIMAL(10, 2) NOT NULL,
        type wallettxtype NOT NULL,
        description TEXT,
        balance_after DECIMAL(10, 2),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (id),
        CONSTRAINT ck_wallet_transactions_amount_nonnegative CHECK (amount >= 0),
        FOREIGN KEY(wallet_id) REFERENCES wallets (id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE SET NULL
    );"""))

    # ── Indexes (auto-generated from current models) ─────────────────
    op.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_app_config_key ON app_config (key);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_app_config_id ON app_config (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_loyalty_tiers_id ON loyalty_tiers (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_menu_categories_id ON menu_categories (id);"))
    op.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_otp_sessions_session_token ON otp_sessions (session_token);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_otp_sessions_phone ON otp_sessions (phone);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_otp_sessions_id ON otp_sessions (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_splash_content_id ON splash_content (id);"))
    op.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_stores_slug ON stores (slug);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_stores_id ON stores (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_information_cards_id ON information_cards (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_information_cards_slug ON information_cards (slug);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_categories_store_id ON inventory_categories (store_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_categories_id ON inventory_categories (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_menu_items_id ON menu_items (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_menu_items_category_id ON menu_items (category_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_menu_cat_avail ON menu_items (category_id, is_available);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_store_tables_id ON store_tables (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_store_tables_store_id ON store_tables (store_id);"))
    op.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_vouchers_code ON vouchers (code);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_vouchers_id ON vouchers (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_customization_options_menu_item_id ON customization_options (menu_item_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_customization_options_id ON customization_options (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_items_id ON inventory_items (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_items_store_id ON inventory_items (store_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_rewards_id ON rewards (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_users_id ON users (id);"))
    op.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email);"))
    op.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_phone ON users (phone);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_log_store_id ON audit_log (store_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_log_action_created ON audit_log (action, created_at);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_log_user_id ON audit_log (user_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_log_id ON audit_log (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_log_action ON audit_log (action);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_log_user_created ON audit_log (user_id, created_at);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_log_request_id ON audit_log (request_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_log_entity ON audit_log (entity_type, entity_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_log_created_at ON audit_log (created_at);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_cart_items_user_id ON cart_items (user_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_cart_items_id ON cart_items (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_cart_items_store_id ON cart_items (store_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_cart_items_customization_hash ON cart_items (customization_hash);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_cart_item_user_store ON cart_items (user_id, store_id);"))
    op.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_checkout_tokens_token ON checkout_tokens (token);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_checkout_tokens_id ON checkout_tokens (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_checkout_tokens_user_id ON checkout_tokens (user_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_device_tokens_id ON device_tokens (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_device_tokens_user_id ON device_tokens (user_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_favorites_item_id ON favorites (item_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_favorites_id ON favorites (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_favorites_user_id ON favorites (user_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_movements_store_id ON inventory_movements (store_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_movements_id ON inventory_movements (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_movements_inventory_item_id ON inventory_movements (inventory_item_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_inventory_movements_created_by ON inventory_movements (created_by);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_loyalty_accounts_id ON loyalty_accounts (id);"))
    op.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_loyalty_accounts_user_id ON loyalty_accounts (user_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_marketing_campaigns_id ON marketing_campaigns (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_notification_broadcasts_id ON notification_broadcasts (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_notif_user_read ON notifications (user_id, is_read);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_notifications_id ON notifications (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_notifications_user_id ON notifications (user_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_orders_store_id ON orders (store_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_orders_id ON orders (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_orders_store_created ON orders (store_id, created_at);"))
    op.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_orders_order_number ON orders (order_number);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_orders_user_created ON orders (user_id, created_at);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_orders_user_id ON orders (user_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_orders_store_status_created ON orders (store_id, status, created_at);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_payment_methods_id ON payment_methods (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_payment_methods_user_id ON payment_methods (user_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_promo_banners_id ON promo_banners (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_referrals_id ON referrals (id);"))
    op.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_referrals_code ON referrals (code);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_referrals_referrer_id ON referrals (referrer_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_staff_store_id ON staff (store_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_staff_user_id ON staff (user_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_staff_store_active ON staff (store_id, is_active);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_staff_id ON staff (id);"))
    op.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_token_blacklist_jti ON token_blacklist (jti);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_token_blacklist_id ON token_blacklist (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_token_blacklist_user_id ON token_blacklist (user_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_user_addresses_id ON user_addresses (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_user_addresses_user_id ON user_addresses (user_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_address_user_default ON user_addresses (user_id, is_default);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_wallets_id ON wallets (id);"))
    op.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_wallets_user_id ON wallets (user_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_feedback_id ON feedback (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_feedback_user_id ON feedback (user_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_feedback_order_id ON feedback (order_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_feedback_store_id ON feedback (store_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_loyalty_transactions_id ON loyalty_transactions (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_ltx_user_created ON loyalty_transactions (user_id, created_at);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_loyalty_transactions_user_id ON loyalty_transactions (user_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_ltx_user_type ON loyalty_transactions (user_id, type);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_order_items_id ON order_items (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_order_items_menu_item_id ON order_items (menu_item_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_order_items_order_menu ON order_items (order_id, menu_item_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_order_items_order_id ON order_items (order_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_order_status_history_id ON order_status_history (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_order_status_history_order_id ON order_status_history (order_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_payments_id ON payments (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_payments_order_status ON payments (order_id, status);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_pin_attempts_staff_id ON pin_attempts (staff_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_staff_shifts_staff_id ON staff_shifts (staff_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_staff_shifts_store_id ON staff_shifts (store_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_staff_shifts_id ON staff_shifts (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_user_rewards_user_id ON user_rewards (user_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_user_rewards_id ON user_rewards (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_user_vouchers_user_id ON user_vouchers (user_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_user_vouchers_id ON user_vouchers (id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_wallet_transactions_user_id ON wallet_transactions (user_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_wallet_transactions_wallet_id ON wallet_transactions (wallet_id);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_wallet_tx_wallet_created ON wallet_transactions (wallet_id, created_at);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_wallet_tx_wallet_type ON wallet_transactions (wallet_id, type);"))
    op.execute(text("CREATE INDEX IF NOT EXISTS ix_wallet_transactions_id ON wallet_transactions (id);"))


def downgrade() -> None:
    """Drop all tables, enums and indexes in reverse dependency order."""

    op.execute(text("DROP TABLE IF EXISTS wallet_transactions CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS user_vouchers CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS user_rewards CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS table_occupancy_snapshot CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS survey_answers CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS staff_shifts CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS pin_attempts CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS payments CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS order_status_history CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS order_items CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS loyalty_transactions CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS feedback CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS wallets CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS user_store_access CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS user_addresses CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS token_blacklist CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS survey_responses CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS survey_questions CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS staff CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS referrals CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS promo_banners CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS payment_methods CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS orders CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS notifications CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS notification_broadcasts CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS marketing_campaigns CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS loyalty_accounts CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS inventory_movements CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS favorites CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS device_tokens CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS checkout_tokens CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS cart_items CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS audit_log CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS users CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS surveys CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS role_user_type CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS role_permissions CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS rewards CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS inventory_items CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS customization_options CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS vouchers CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS store_tables CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS roles CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS menu_items CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS inventory_categories CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS information_cards CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS user_types CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS stores CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS splash_content CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS permissions CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS otp_sessions CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS menu_categories CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS loyalty_tiers CASCADE;"))
    op.execute(text("DROP TABLE IF EXISTS app_config CASCADE;"))

    op.execute(text("DROP TYPE IF EXISTS discounttype;"))
    op.execute(text("DROP TYPE IF EXISTS movement_type;"))
    op.execute(text("DROP TYPE IF EXISTS orderstatus;"))
    op.execute(text("DROP TYPE IF EXISTS ordertype;"))
    op.execute(text("DROP TYPE IF EXISTS rewardtype;"))
    op.execute(text("DROP TYPE IF EXISTS staffrole;"))
    op.execute(text("DROP TYPE IF EXISTS txtype;"))
    op.execute(text("DROP TYPE IF EXISTS wallettxtype;"))
