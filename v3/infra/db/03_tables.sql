-- FNB Enterprise v3 — Complete Table Definitions
-- 78 tables across 18 domains
-- Generated from FNB_ENTERPRISE_SCHEMA_v3.md

-- ============================================================
-- 4.1 IDENTITY & ACCESS MANAGEMENT (part 1: no external FKs)
-- ============================================================

CREATE TABLE iam_principals (
    id BIGSERIAL PRIMARY KEY,
    principal_type VARCHAR(20) NOT NULL CHECK (principal_type IN ('human','service','api_key')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','terminated','pending_verification')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE iam_roles (
    id SERIAL PRIMARY KEY,
    role_key VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system BOOLEAN NOT NULL DEFAULT false,
    scope_level VARCHAR(20) NOT NULL DEFAULT 'store' CHECK (scope_level IN ('global','region','store','department','self')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE iam_permissions (
    id SERIAL PRIMARY KEY,
    permission_key VARCHAR(100) NOT NULL UNIQUE,
    resource VARCHAR(50) NOT NULL,
    action audit_action NOT NULL,
    description TEXT,
    is_dangerous BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4.3 STORE OPERATIONS (core tenant boundary — no external FKs)
-- ============================================================

CREATE TABLE stores (
    id SERIAL PRIMARY KEY,
    store_code VARCHAR(20) NOT NULL UNIQUE,
    store_name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    brand_name VARCHAR(50),
    address_line_1 VARCHAR(255) NOT NULL,
    address_line_2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state_province VARCHAR(100),
    postal_code VARCHAR(20) NOT NULL,
    country_code CHAR(2) NOT NULL,
    latitude NUMERIC(10,8) CHECK (latitude BETWEEN -90 AND 90),
    longitude NUMERIC(11,8) CHECK (longitude BETWEEN -180 AND 180),
    phone_number VARCHAR(20) NOT NULL,
    email_address VARCHAR(255),
    timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
    currency_code CHAR(3) NOT NULL DEFAULT 'USD',
    tax_registration VARCHAR(50),
    logo_url VARCHAR(500),
    banner_image_url VARCHAR(500),
    pickup_lead_minutes INTEGER NOT NULL DEFAULT 15 CHECK (pickup_lead_minutes BETWEEN 5 AND 120),
    delivery_radius_km NUMERIC(5,2) NOT NULL DEFAULT 10.00 CHECK (delivery_radius_km > 0),
    base_delivery_fee NUMERIC(10,4) NOT NULL DEFAULT 0 CHECK (base_delivery_fee >= 0),
    minimum_order_amount NUMERIC(10,4) NOT NULL DEFAULT 0 CHECK (minimum_order_amount >= 0),
    pos_integration_type VARCHAR(50),
    delivery_integration_type VARCHAR(50),
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_accepting_orders BOOLEAN NOT NULL DEFAULT true,
    opening_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE store_operating_hours (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    open_time TIME NOT NULL,
    close_time TIME NOT NULL,
    is_closed BOOLEAN NOT NULL DEFAULT false,
    is_24_hours BOOLEAN NOT NULL DEFAULT false,
    last_order_time TIME,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (store_id, day_of_week)
);

CREATE TABLE store_special_hours (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    special_date DATE NOT NULL,
    open_time TIME,
    close_time TIME,
    reason VARCHAR(100) NOT NULL,
    is_closed BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (store_id, special_date)
);

CREATE TABLE store_configuration (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    config_key VARCHAR(50) NOT NULL,
    config_value JSONB NOT NULL DEFAULT '{}',
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (store_id, config_key)
);

CREATE TABLE dining_tables (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    table_number VARCHAR(20) NOT NULL,
    display_name VARCHAR(50),
    qr_code_token VARCHAR(64) NOT NULL UNIQUE,
    qr_code_image_url VARCHAR(500),
    qr_generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    capacity SMALLINT NOT NULL DEFAULT 4 CHECK (capacity BETWEEN 1 AND 50),
    section VARCHAR(50),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_dining_tables_active_store_table_number ON dining_tables(store_id, table_number) WHERE deleted_at IS NULL;

CREATE TABLE table_status_snapshot (
    table_id INTEGER PRIMARY KEY REFERENCES dining_tables(id) ON DELETE CASCADE,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    current_order_id BIGINT,
    party_size SMALLINT,
    status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (status IN ('available','occupied','reserved','cleaning')),
    server_staff_id BIGINT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4.1 IAM (part 2: tables with FKs to stores or principals)
-- ============================================================

CREATE TABLE admin_accounts (
    id BIGSERIAL PRIMARY KEY,
    principal_id BIGINT NOT NULL REFERENCES iam_principals(id) ON DELETE RESTRICT,
    email VARCHAR(255) NOT NULL CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    display_name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL CHECK (LENGTH(password_hash) >= 60),
    password_algorithm VARCHAR(20) NOT NULL DEFAULT 'argon2id' CHECK (password_algorithm IN ('argon2id','bcrypt')),
    password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    mfa_enabled BOOLEAN NOT NULL DEFAULT false,
    mfa_secret_encrypted BYTEA,
    last_login_at TIMESTAMPTZ,
    last_login_ip INET,
    failed_login_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
    locked_until TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE role_permission (
    role_id INTEGER NOT NULL REFERENCES iam_roles(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES iam_permissions(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    granted_by BIGINT REFERENCES admin_accounts(id) ON DELETE SET NULL,
    conditions JSONB,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE role_assignments (
    id BIGSERIAL PRIMARY KEY,
    assignee_id BIGINT NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES iam_roles(id) ON DELETE CASCADE,
    assigned_by BIGINT REFERENCES admin_accounts(id) ON DELETE SET NULL,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_to TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE store_assignments (
    id BIGSERIAL PRIMARY KEY,
    assignee_id BIGINT NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    can_approve_refunds BOOLEAN NOT NULL DEFAULT false,
    can_adjust_inventory BOOLEAN NOT NULL DEFAULT false,
    can_manage_staff BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE api_credentials (
    id BIGSERIAL PRIMARY KEY,
    principal_id BIGINT NOT NULL REFERENCES iam_principals(id) ON DELETE CASCADE,
    credential_name VARCHAR(100) NOT NULL,
    api_key_hash VARCHAR(64) NOT NULL,
    api_key_last_four VARCHAR(4),
    scopes JSONB NOT NULL DEFAULT '{}',
    rate_limit_rps INTEGER NOT NULL DEFAULT 10 CHECK (rate_limit_rps BETWEEN 1 AND 1000),
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4.2 CUSTOMER MANAGEMENT
-- ============================================================

CREATE TABLE customers (
    id BIGSERIAL PRIMARY KEY,
    phone_number VARCHAR(20) CHECK (phone_number ~ '^[+0-9]{7,20}$'),
    phone_verified_at TIMESTAMPTZ,
    email_address VARCHAR(255),
    email_verified_at TIMESTAMPTZ,
    display_name VARCHAR(100),
    given_name VARCHAR(50),
    family_name VARCHAR(50),
    avatar_url VARCHAR(500),
    date_of_birth DATE CHECK (date_of_birth > '1900-01-01' AND date_of_birth < CURRENT_DATE),
    preferred_language VARCHAR(10) NOT NULL DEFAULT 'en' CHECK (preferred_language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
    referral_code VARCHAR(20) UNIQUE,
    referred_by_customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
    referral_count INTEGER NOT NULL DEFAULT 0 CHECK (referral_count >= 0),
    referral_earnings_total NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (referral_earnings_total >= 0),
    customer_segment VARCHAR(50),
    lifetime_value NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (lifetime_value >= 0),
    order_count INTEGER NOT NULL DEFAULT 0 CHECK (order_count >= 0),
    last_order_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    anonymized_at TIMESTAMPTZ
);

CREATE TABLE customer_consents (
    id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    consent_type consent_type NOT NULL,
    status consent_status NOT NULL DEFAULT 'pending',
    granted_at TIMESTAMPTZ,
    withdrawn_at TIMESTAMPTZ,
    ip_address INET,
    user_agent VARCHAR(255),
    consent_version VARCHAR(10) NOT NULL DEFAULT '1.0',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customer_addresses (
    id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    label VARCHAR(50) NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false,
    recipient_name VARCHAR(100),
    recipient_phone VARCHAR(20),
    address_line_1 VARCHAR(255) NOT NULL,
    address_line_2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state_province VARCHAR(100),
    postal_code VARCHAR(20) NOT NULL,
    country_code CHAR(2) NOT NULL,
    latitude NUMERIC(10,8) CHECK (latitude BETWEEN -90 AND 90),
    longitude NUMERIC(11,8) CHECK (longitude BETWEEN -180 AND 180),
    delivery_instructions VARCHAR(255),
    location_accuracy VARCHAR(20),
    is_validated BOOLEAN NOT NULL DEFAULT false,
    validated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE customer_devices (
    id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    device_fingerprint VARCHAR(64) NOT NULL,
    push_token VARCHAR(255),
    platform VARCHAR(20) NOT NULL CHECK (platform IN ('ios','android','web','pwa')),
    app_version VARCHAR(20),
    os_version VARCHAR(20),
    device_model VARCHAR(50),
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- 4.4 MENU ENGINEERING
-- ============================================================

CREATE TABLE menu_categories (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    parent_category_id INTEGER REFERENCES menu_categories(id) ON DELETE SET NULL,
    category_name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL,
    description TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    image_url VARCHAR(500),
    is_available BOOLEAN NOT NULL DEFAULT true,
    is_featured BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE menu_items (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
    item_code VARCHAR(50) NOT NULL UNIQUE,
    item_name VARCHAR(100) NOT NULL,
    description TEXT,
    long_description TEXT,
    base_price NUMERIC(10,4) NOT NULL CHECK (base_price >= 0),
    cost_price NUMERIC(10,4) CHECK (cost_price >= 0),
    image_url VARCHAR(500),
    image_gallery_urls JSONB,
    is_available BOOLEAN NOT NULL DEFAULT true,
    is_featured BOOLEAN NOT NULL DEFAULT false,
    is_popular BOOLEAN NOT NULL DEFAULT false,
    display_order INTEGER NOT NULL DEFAULT 0,
    prep_time_minutes INTEGER NOT NULL DEFAULT 10 CHECK (prep_time_minutes BETWEEN 1 AND 120),
    calories INTEGER CHECK (calories >= 0),
    dietary_tags JSONB,
    search_vector TSVECTOR,
    tax_category_id INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE allergens (
    id SERIAL PRIMARY KEY,
    allergen_key VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    icon_url VARCHAR(500),
    severity VARCHAR(20) NOT NULL DEFAULT 'high' CHECK (severity IN ('low','medium','high','critical')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE menu_item_allergens (
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    allergen_id INTEGER NOT NULL REFERENCES allergens(id) ON DELETE CASCADE,
    PRIMARY KEY (menu_item_id, allergen_id)
);

CREATE TABLE menu_modifier_groups (
    id SERIAL PRIMARY KEY,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    group_name VARCHAR(100) NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    selection_type VARCHAR(20) NOT NULL DEFAULT 'single' CHECK (selection_type IN ('single','multiple')),
    is_required BOOLEAN NOT NULL DEFAULT false,
    min_selections SMALLINT NOT NULL DEFAULT 0 CHECK (min_selections >= 0),
    max_selections SMALLINT NOT NULL DEFAULT 1 CHECK (max_selections >= min_selections),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE menu_modifier_options (
    id SERIAL PRIMARY KEY,
    modifier_group_id INTEGER NOT NULL REFERENCES menu_modifier_groups(id) ON DELETE CASCADE,
    option_name VARCHAR(100) NOT NULL,
    price_adjustment NUMERIC(10,4) NOT NULL DEFAULT 0,
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_available BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE menu_variants (
    id SERIAL PRIMARY KEY,
    parent_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    variant_name VARCHAR(100) NOT NULL,
    variant_sku VARCHAR(50) NOT NULL UNIQUE,
    price_adjustment NUMERIC(10,4) NOT NULL DEFAULT 0,
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_available BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE menu_item_recipes (
    id SERIAL PRIMARY KEY,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    menu_variant_id INTEGER REFERENCES menu_variants(id) ON DELETE CASCADE,
    inventory_item_id INTEGER NOT NULL,
    quantity_required NUMERIC(10,4) NOT NULL CHECK (quantity_required > 0),
    unit_of_measure VARCHAR(20) NOT NULL,
    is_primary_component BOOLEAN NOT NULL DEFAULT false,
    waste_factor NUMERIC(4,3) NOT NULL DEFAULT 0.050 CHECK (waste_factor BETWEEN 0 AND 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (menu_item_id, menu_variant_id, inventory_item_id)
);

-- ============================================================
-- 4.5 INVENTORY & SUPPLY CHAIN
-- ============================================================

CREATE TABLE inventory_categories (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    category_name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL,
    parent_category_id INTEGER REFERENCES inventory_categories(id) ON DELETE SET NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE suppliers (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    supplier_name VARCHAR(100) NOT NULL,
    contact_person VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(255),
    address TEXT,
    payment_terms VARCHAR(50),
    lead_time_days INTEGER CHECK (lead_time_days > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE inventory_items (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES inventory_categories(id) ON DELETE SET NULL,
    item_code VARCHAR(50) NOT NULL UNIQUE,
    item_name VARCHAR(100) NOT NULL,
    description TEXT,
    unit_of_measure VARCHAR(20) NOT NULL,
    current_stock NUMERIC(10,4) NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
    reserved_stock NUMERIC(10,4) NOT NULL DEFAULT 0 CHECK (reserved_stock >= 0),
    reorder_level NUMERIC(10,4) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
    reorder_quantity NUMERIC(10,4) NOT NULL DEFAULT 0 CHECK (reorder_quantity >= 0),
    par_level NUMERIC(10,4) NOT NULL DEFAULT 0 CHECK (par_level >= 0),
    unit_cost NUMERIC(10,4) CHECK (unit_cost >= 0),
    supplier_id INTEGER REFERENCES suppliers(id),
    storage_location VARCHAR(50),
    shelf_life_days INTEGER CHECK (shelf_life_days > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_direct_sale BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE inventory_movement_log (
    id BIGSERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    movement_type inventory_movement_type NOT NULL,
    quantity_delta NUMERIC(10,4) NOT NULL,
    stock_after NUMERIC(10,4) NOT NULL,
    reserved_delta NUMERIC(10,4) NOT NULL DEFAULT 0,
    reserved_after NUMERIC(10,4) NOT NULL DEFAULT 0,
    reason TEXT NOT NULL,
    reference_type VARCHAR(50),
    reference_id BIGINT,
    unit_cost_at_movement NUMERIC(10,4),
    movement_cost NUMERIC(10,4),
    performed_by BIGINT REFERENCES admin_accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE purchase_orders (
    id BIGSERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    po_number VARCHAR(50) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','partial','received','cancelled')),
    total_amount NUMERIC(12,4) NOT NULL DEFAULT 0,
    expected_delivery TIMESTAMPTZ,
    actual_delivery TIMESTAMPTZ,
    notes TEXT,
    created_by BIGINT NOT NULL REFERENCES admin_accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE purchase_order_lines (
    id BIGSERIAL PRIMARY KEY,
    purchase_order_id BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    quantity_ordered NUMERIC(10,4) NOT NULL CHECK (quantity_ordered > 0),
    quantity_received NUMERIC(10,4) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
    unit_cost NUMERIC(10,4) NOT NULL CHECK (unit_cost > 0),
    line_total NUMERIC(12,4) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4.6 CART & CHECKOUT
-- ============================================================

CREATE TABLE customer_carts (
    id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    item_count INTEGER NOT NULL DEFAULT 0 CHECK (item_count >= 0),
    subtotal NUMERIC(10,4) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (customer_id, store_id)
);

CREATE TABLE cart_line_items (
    id BIGSERIAL PRIMARY KEY,
    cart_id BIGINT NOT NULL REFERENCES customer_carts(id) ON DELETE CASCADE,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    menu_variant_id INTEGER REFERENCES menu_variants(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10,4) NOT NULL CHECK (unit_price >= 0),
    line_total NUMERIC(10,4) NOT NULL CHECK (line_total >= 0),
    selected_modifiers JSONB NOT NULL DEFAULT '{}',
    modifier_total NUMERIC(10,4) NOT NULL DEFAULT 0,
    special_instructions VARCHAR(255),
    added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE checkout_sessions (
    id BIGSERIAL PRIMARY KEY,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    cart_snapshot JSONB NOT NULL,
    applied_voucher_id INTEGER,
    applied_reward_id INTEGER,
    discount_amount NUMERIC(10,4) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    delivery_fee NUMERIC(10,4) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
    tax_amount NUMERIC(10,4) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    subtotal NUMERIC(10,4) NOT NULL CHECK (subtotal >= 0),
    total_amount NUMERIC(10,4) NOT NULL CHECK (total_amount >= 0),
    is_completed BOOLEAN NOT NULL DEFAULT false,
    completed_order_id BIGINT,
    expires_at TIMESTAMPTZ NOT NULL,
    ip_address INET NOT NULL,
    device_fingerprint VARCHAR(64),
    user_agent VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4.7 ORDER MANAGEMENT
-- ============================================================

CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    dining_table_id INTEGER REFERENCES dining_tables(id) ON DELETE SET NULL,
    order_number VARCHAR(50) NOT NULL UNIQUE,
    order_type order_type NOT NULL,
    order_channel order_channel NOT NULL DEFAULT 'mobile_app',
    status order_status NOT NULL DEFAULT 'pending',
    payment_status payment_status NOT NULL DEFAULT 'initiated',
    fulfillment_type fulfillment_type NOT NULL,
    CONSTRAINT ck_orders_type_fulfillment_alignment CHECK (
        (order_type = 'dine_in'    AND fulfillment_type = 'dine_in_service') OR
        (order_type = 'takeaway'   AND fulfillment_type IN ('counter_pickup','curbside_pickup')) OR
        (order_type = 'delivery'   AND fulfillment_type IN ('standard_delivery','express_delivery','third_party_delivery')) OR
        (order_type = 'drive_thru' AND fulfillment_type = 'counter_pickup')
    ),
    item_count INTEGER NOT NULL DEFAULT 0 CHECK (item_count >= 0),
    items_subtotal NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (items_subtotal >= 0),
    modifier_subtotal NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (modifier_subtotal >= 0),
    delivery_fee NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
    service_charge NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (service_charge >= 0),
    tax_amount NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    discount_amount NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    voucher_discount NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (voucher_discount >= 0),
    reward_discount NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (reward_discount >= 0),
    tip_amount NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (tip_amount >= 0),
    total_amount NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    total_amount_currency CHAR(3) NOT NULL DEFAULT 'USD',
    loyalty_points_earned INTEGER NOT NULL DEFAULT 0 CHECK (loyalty_points_earned >= 0),
    loyalty_points_redeemed INTEGER NOT NULL DEFAULT 0 CHECK (loyalty_points_redeemed >= 0),
    customer_notes TEXT,
    staff_notes TEXT,
    source_ip INET,
    device_fingerprint VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at TIMESTAMPTZ,
    prepared_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason VARCHAR(100),
    cancelled_by VARCHAR(20) CHECK (cancelled_by IN ('customer','merchant','system')),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE order_line_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
    menu_variant_id INTEGER REFERENCES menu_variants(id) ON DELETE SET NULL,
    item_snapshot JSONB NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10,4) NOT NULL CHECK (unit_price >= 0),
    modifier_total NUMERIC(10,4) NOT NULL DEFAULT 0,
    line_total NUMERIC(10,4) NOT NULL CHECK (line_total >= 0),
    selected_modifiers JSONB NOT NULL DEFAULT '{}',
    special_instructions VARCHAR(255),
    fulfillment_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (fulfillment_status IN ('pending','in_progress','ready','served','cancelled')),
    served_at TIMESTAMPTZ,
    served_by BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_status_log (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status order_status,
    to_status order_status NOT NULL,
    reason TEXT,
    actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('customer','staff','system','webhook')),
    actor_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_adjustments (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    adjustment_type VARCHAR(20) NOT NULL CHECK (adjustment_type IN ('refund','add_item','remove_item','tip_addition','discount_override')),
    amount_delta NUMERIC(12,4) NOT NULL,
    reason TEXT NOT NULL,
    approved_by BIGINT REFERENCES admin_accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4.8 ORDER FULFILLMENT
-- ============================================================

CREATE TABLE order_fulfillment (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    status fulfillment_status NOT NULL DEFAULT 'pending_assignment',
    customer_address_id BIGINT REFERENCES customer_addresses(id) ON DELETE SET NULL,
    delivery_address_snapshot JSONB,
    recipient_name VARCHAR(100),
    recipient_phone VARCHAR(20),
    estimated_ready_at TIMESTAMPTZ,
    estimated_delivery_at TIMESTAMPTZ,
    actual_ready_at TIMESTAMPTZ,
    actual_delivery_at TIMESTAMPTZ,
    delivery_provider VARCHAR(50),
    delivery_provider_order_id VARCHAR(100),
    tracking_url VARCHAR(500),
    tracking_number VARCHAR(100),
    driver_name VARCHAR(100),
    driver_phone VARCHAR(20),
    driver_vehicle_type VARCHAR(20),
    pickup_code VARCHAR(10),
    assigned_staff_id BIGINT,
    assigned_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    delivery_fee_snapshot NUMERIC(10,4) NOT NULL DEFAULT 0,
    delivery_distance_km NUMERIC(5,2),
    provider_quote_snapshot JSONB,
    webhook_events JSONB NOT NULL DEFAULT '[]',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- 4.9 PAYMENT PROCESSING
-- ============================================================

CREATE TABLE payments (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    payment_method_id BIGINT,
    provider payment_provider NOT NULL,
    provider_transaction_id VARCHAR(255),
    provider_reference_encrypted BYTEA,
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    payment_method_type payment_method_type NOT NULL,
    amount NUMERIC(12,4) NOT NULL CHECK (amount > 0),
    currency_code CHAR(3) NOT NULL DEFAULT 'USD',
    status payment_status NOT NULL DEFAULT 'initiated',
    captured_amount NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (captured_amount >= 0),
    refunded_amount NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0 AND refunded_amount <= captured_amount),
    refund_count INTEGER NOT NULL DEFAULT 0 CHECK (refund_count >= 0),
    fee_amount NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
    net_amount NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (net_amount >= 0),
    failure_code VARCHAR(50),
    failure_message TEXT,
    settled_at TIMESTAMPTZ,
    settlement_batch_id VARCHAR(100),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payment_events (
    id BIGSERIAL PRIMARY KEY,
    payment_id BIGINT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    from_status payment_status,
    to_status payment_status NOT NULL,
    amount NUMERIC(12,4),
    provider_response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payment_methods (
    id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    method_type payment_method_type NOT NULL,
    provider payment_provider NOT NULL,
    display_label VARCHAR(100) NOT NULL,
    card_brand VARCHAR(20),
    card_last_four CHAR(4) CHECK (card_last_four ~ '^[0-9]{4}$'),
    card_expiry_month SMALLINT CHECK (card_expiry_month BETWEEN 1 AND 12),
    card_expiry_year SMALLINT CHECK (card_expiry_year BETWEEN 2024 AND 2100),
    provider_token_encrypted BYTEA NOT NULL,
    provider_token_iv BYTEA NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    billing_address_snapshot JSONB,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE refunds (
    id BIGSERIAL PRIMARY KEY,
    payment_id BIGINT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    amount NUMERIC(12,4) NOT NULL CHECK (amount > 0),
    reason TEXT NOT NULL,
    reason_category VARCHAR(50) NOT NULL CHECK (reason_category IN ('customer_request','item_unavailable','quality_issue','wrong_order','late_delivery','other')),
    approved_by BIGINT REFERENCES admin_accounts(id) ON DELETE SET NULL,
    provider_refund_id VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- ============================================================
-- 4.10 WALLET & LEDGER
-- ============================================================

CREATE TABLE wallets (
    id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
    currency_code CHAR(3) NOT NULL DEFAULT 'USD',
    is_frozen BOOLEAN NOT NULL DEFAULT false,
    frozen_at TIMESTAMPTZ,
    freeze_reason VARCHAR(100),
    frozen_by BIGINT REFERENCES admin_accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wallet_ledger_entries (
    id BIGSERIAL PRIMARY KEY,
    wallet_id BIGINT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    entry_type VARCHAR(20) NOT NULL CHECK (entry_type IN ('credit','debit','hold','release','adjustment')),
    amount NUMERIC(12,4) NOT NULL,
    running_balance NUMERIC(12,4) NOT NULL,
    description TEXT NOT NULL,
    reference_type VARCHAR(50),
    reference_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4.11 LOYALTY ENGINE
-- ============================================================

CREATE TABLE loyalty_tiers (
    id SERIAL PRIMARY KEY,
    tier_key VARCHAR(20) NOT NULL UNIQUE,
    display_name VARCHAR(50) NOT NULL,
    min_lifetime_points INTEGER NOT NULL CHECK (min_lifetime_points >= 0),
    points_multiplier NUMERIC(3,2) NOT NULL DEFAULT 1.00 CHECK (points_multiplier >= 1.00),
    benefits_config JSONB NOT NULL DEFAULT '{}',
    color_hex CHAR(7),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE loyalty_accounts (
    id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
    current_tier_id INTEGER REFERENCES loyalty_tiers(id) ON DELETE SET NULL,
    points_balance INTEGER NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
    lifetime_points_earned INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_points_earned >= 0),
    lifetime_points_redeemed INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_points_redeemed >= 0),
    points_pending_expiry INTEGER NOT NULL DEFAULT 0,
    last_tier_change_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE loyalty_points_ledger (
    id BIGSERIAL PRIMARY KEY,
    loyalty_account_id BIGINT NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
    customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    event_type loyalty_event_type NOT NULL,
    points_delta INTEGER NOT NULL,
    running_balance INTEGER NOT NULL,
    order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
    reward_catalog_id INTEGER,
    description TEXT,
    expires_at TIMESTAMPTZ,
    created_by BIGINT REFERENCES admin_accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4.12 REWARDS & PROMOTIONS
-- ============================================================

CREATE TABLE reward_catalog (
    id SERIAL PRIMARY KEY,
    store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL,
    reward_name VARCHAR(100) NOT NULL,
    reward_key VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    short_description VARCHAR(255),
    reward_type reward_redemption_type NOT NULL,
    points_cost INTEGER NOT NULL CHECK (points_cost > 0),
    menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE SET NULL,
    discount_value NUMERIC(10,4) CHECK (discount_value >= 0),
    discount_max_amount NUMERIC(10,4),
    minimum_order_value NUMERIC(10,4) NOT NULL DEFAULT 0 CHECK (minimum_order_value >= 0),
    maximum_redemptions INTEGER CHECK (maximum_redemptions > 0),
    total_redemptions INTEGER NOT NULL DEFAULT 0 CHECK (total_redemptions >= 0),
    image_url VARCHAR(500),
    validity_days INTEGER NOT NULL DEFAULT 30 CHECK (validity_days > 0),
    is_exclusive BOOLEAN NOT NULL DEFAULT false,
    minimum_tier_id INTEGER REFERENCES loyalty_tiers(id) ON DELETE SET NULL,
    terms_and_conditions TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE customer_rewards (
    id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    reward_catalog_id INTEGER NOT NULL REFERENCES reward_catalog(id) ON DELETE CASCADE,
    store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL,
    redemption_code VARCHAR(50) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','reserved','used','expired','cancelled')),
    points_spent INTEGER NOT NULL DEFAULT 0 CHECK (points_spent >= 0),
    reward_snapshot JSONB NOT NULL,
    order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
    used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE voucher_definitions (
    id SERIAL PRIMARY KEY,
    voucher_code VARCHAR(50) NOT NULL UNIQUE,
    voucher_type voucher_type NOT NULL,
    scope voucher_scope NOT NULL DEFAULT 'global',
    store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL,
    category_id INTEGER REFERENCES menu_categories(id) ON DELETE SET NULL,
    menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE SET NULL,
    display_title VARCHAR(100) NOT NULL,
    description TEXT,
    discount_value NUMERIC(10,4) NOT NULL CHECK (discount_value >= 0),
    discount_max_amount NUMERIC(10,4),
    minimum_order_value NUMERIC(10,4) NOT NULL DEFAULT 0 CHECK (minimum_order_value >= 0),
    maximum_discount NUMERIC(10,4),
    max_global_uses INTEGER CHECK (max_global_uses > 0),
    max_uses_per_customer INTEGER NOT NULL DEFAULT 1 CHECK (max_uses_per_customer > 0),
    global_use_count INTEGER NOT NULL DEFAULT 0 CHECK (global_use_count >= 0),
    valid_from TIMESTAMPTZ NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL CHECK (valid_until > valid_from),
    customer_segments JSONB,
    first_order_only BOOLEAN NOT NULL DEFAULT false,
    stackable BOOLEAN NOT NULL DEFAULT false,
    image_url VARCHAR(500),
    terms_and_conditions TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by BIGINT REFERENCES admin_accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE customer_vouchers (
    id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    voucher_definition_id INTEGER NOT NULL REFERENCES voucher_definitions(id) ON DELETE CASCADE,
    store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL,
    voucher_code VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','reserved','used','expired','revoked')),
    order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
    use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0),
    voucher_snapshot JSONB NOT NULL,
    reserved_at TIMESTAMPTZ,
    used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    source VARCHAR(50) NOT NULL,
    source_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4.13 MARKETING AUTOMATION
-- ============================================================

CREATE TABLE marketing_campaigns (
    id SERIAL PRIMARY KEY,
    campaign_name VARCHAR(100) NOT NULL,
    campaign_key VARCHAR(50) NOT NULL UNIQUE,
    store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL,
    channel campaign_channel NOT NULL,
    campaign_type VARCHAR(50) NOT NULL CHECK (campaign_type IN ('promotional','transactional','retention','acquisition','reactivation')),
    audience_segment VARCHAR(50),
    audience_criteria JSONB,
    subject_line VARCHAR(200),
    body_content TEXT,
    template_variables JSONB,
    hero_image_url VARCHAR(500),
    cta_text VARCHAR(50),
    cta_url VARCHAR(500),
    voucher_definition_id INTEGER REFERENCES voucher_definitions(id) ON DELETE SET NULL,
    reward_catalog_id INTEGER REFERENCES reward_catalog(id) ON DELETE SET NULL,
    ab_test_variant CHAR(1) CHECK (ab_test_variant IN ('A','B')),
    ab_test_criteria JSONB,
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    status campaign_status NOT NULL DEFAULT 'draft',
    provider VARCHAR(50),
    provider_campaign_id VARCHAR(100),
    budget_allocated NUMERIC(12,4) CHECK (budget_allocated >= 0),
    budget_spent NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (budget_spent >= 0),
    target_roi NUMERIC(5,2),
    actual_roi NUMERIC(5,2),
    created_by BIGINT NOT NULL REFERENCES admin_accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE campaign_analytics (
    id BIGSERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL UNIQUE REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
    audience_size INTEGER NOT NULL DEFAULT 0 CHECK (audience_size >= 0),
    messages_sent INTEGER NOT NULL DEFAULT 0 CHECK (messages_sent >= 0),
    messages_delivered INTEGER NOT NULL DEFAULT 0 CHECK (messages_delivered >= 0),
    messages_failed INTEGER NOT NULL DEFAULT 0 CHECK (messages_failed >= 0),
    messages_bounced INTEGER NOT NULL DEFAULT 0 CHECK (messages_bounced >= 0),
    opens_count INTEGER NOT NULL DEFAULT 0 CHECK (opens_count >= 0),
    unique_opens INTEGER NOT NULL DEFAULT 0 CHECK (unique_opens >= 0),
    clicks_count INTEGER NOT NULL DEFAULT 0 CHECK (clicks_count >= 0),
    unique_clicks INTEGER NOT NULL DEFAULT 0 CHECK (unique_clicks >= 0),
    conversions_count INTEGER NOT NULL DEFAULT 0,
    conversion_revenue NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (conversion_revenue >= 0),
    unsubscribes INTEGER NOT NULL DEFAULT 0 CHECK (unsubscribes >= 0),
    spam_reports INTEGER NOT NULL DEFAULT 0 CHECK (spam_reports >= 0),
    cost_per_send NUMERIC(10,6),
    cost_total NUMERIC(12,4) CHECK (cost_total >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4.14 CONTENT MANAGEMENT
CREATE TABLE splash_screens (
    id SERIAL PRIMARY KEY,
    store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL,
    screen_name VARCHAR(100) NOT NULL,
    image_url VARCHAR(500) NOT NULL,
    title VARCHAR(100),
    subtitle VARCHAR(200),
    cta_text VARCHAR(50),
    cta_url VARCHAR(500),
    show_frequency VARCHAR(20) NOT NULL DEFAULT 'once_per_session' CHECK (show_frequency IN ('once','once_per_session','every_open','once_per_day')),
    dismissible BOOLEAN NOT NULL DEFAULT true,
    active_from TIMESTAMPTZ NOT NULL,
    active_until TIMESTAMPTZ NOT NULL CHECK (active_until > active_from),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE promo_banners (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    short_description VARCHAR(500),
    long_description TEXT,
    image_url VARCHAR(500),
    action_type VARCHAR(20),
    action_url VARCHAR(500),
    voucher_id INTEGER REFERENCES voucher_definitions(id) ON DELETE SET NULL,
    survey_id INTEGER,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    position INTEGER NOT NULL DEFAULT 0,
    image_gallery_urls JSONB,
    gallery_video_url VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE information_cards (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE,
    short_description VARCHAR(500),
    long_description TEXT,
    icon VARCHAR(50),
    image_url VARCHAR(500),
    content_type VARCHAR(20) NOT NULL DEFAULT 'information',
    action_url VARCHAR(500),
    action_type VARCHAR(20),
    action_label VARCHAR(100),
    position INTEGER NOT NULL DEFAULT 0,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    image_gallery_urls JSONB,
    gallery_video_url VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE product_cards (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE,
    short_description VARCHAR(500),
    long_description TEXT,
    image_url VARCHAR(500),
    price NUMERIC(10,2),
    action_url VARCHAR(500),
    action_label VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT true,
    position INTEGER NOT NULL DEFAULT 0,
    image_gallery_urls JSONB,
    gallery_video_url VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE event_cards (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE,
    short_description VARCHAR(500),
    long_description TEXT,
    image_url VARCHAR(500),
    action_url VARCHAR(500),
    action_label VARCHAR(100),
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    position INTEGER NOT NULL DEFAULT 0,
    location VARCHAR(255),
    event_datetime TIMESTAMPTZ,
    rsvp_enabled BOOLEAN NOT NULL DEFAULT false,
    rsvp_max_capacity INTEGER,
    rsvp_count INTEGER NOT NULL DEFAULT 0,
    image_gallery_urls JSONB,
    gallery_video_url VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE event_rsvps (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES event_cards(id) ON DELETE CASCADE,
    customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE system_pages (
    id SERIAL PRIMARY KEY,
    page_key VARCHAR(50) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    body_text TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE content_sections (
    id SERIAL PRIMARY KEY,
    content_type VARCHAR(30) NOT NULL,
    content_id INTEGER NOT NULL,
    section_title VARCHAR(255),
    section_body TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4.15 SURVEY & VOICE OF CUSTOMER
-- ============================================================

CREATE TABLE survey_definitions (
    id SERIAL PRIMARY KEY,
    survey_key VARCHAR(50) NOT NULL UNIQUE,
    survey_name VARCHAR(100) NOT NULL,
    description TEXT,
    welcome_message TEXT,
    thank_you_message TEXT,
    reward_voucher_id INTEGER REFERENCES voucher_definitions(id) ON DELETE SET NULL,
    reward_points INTEGER NOT NULL DEFAULT 0 CHECK (reward_points >= 0),
    completion_target INTEGER,
    is_anonymous BOOLEAN NOT NULL DEFAULT false,
    allow_multiple_responses BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by BIGINT REFERENCES admin_accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE survey_questions (
    id SERIAL PRIMARY KEY,
    survey_id INTEGER NOT NULL REFERENCES survey_definitions(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type VARCHAR(20) NOT NULL CHECK (question_type IN ('single_choice','multiple_choice','rating_scale','text_open','nps','yes_no','dropdown','ranking','date','file_upload')),
    answer_options JSONB,
    min_rating SMALLINT,
    max_rating SMALLINT,
    rating_labels JSONB,
    is_required BOOLEAN NOT NULL DEFAULT true,
    conditional_logic JSONB,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE survey_responses (
    id BIGSERIAL PRIMARY KEY,
    survey_id INTEGER NOT NULL REFERENCES survey_definitions(id) ON DELETE CASCADE,
    customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
    respondent_email VARCHAR(255),
    nps_score SMALLINT CHECK (nps_score BETWEEN 0 AND 10),
    overall_satisfaction SMALLINT CHECK (overall_satisfaction BETWEEN 1 AND 5),
    source_channel VARCHAR(50),
    reward_granted BOOLEAN NOT NULL DEFAULT false,
    consent_given BOOLEAN NOT NULL DEFAULT false,
    ip_address INET,
    duration_seconds INTEGER CHECK (duration_seconds > 0),
    data_retention_until DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE survey_answers (
    id BIGSERIAL PRIMARY KEY,
    response_id BIGINT NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
    answer_value TEXT,
    answer_detail JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4.16 NOTIFICATION ORCHESTRATION
-- ============================================================

CREATE TABLE notification_messages (
    id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    message_type VARCHAR(50) NOT NULL CHECK (message_type IN ('order_update','promotion','system','payment','loyalty','reminder','security')),
    priority notification_priority NOT NULL DEFAULT 'normal',
    title VARCHAR(100) NOT NULL,
    body TEXT,
    image_url VARCHAR(500),
    action_url VARCHAR(500),
    action_type VARCHAR(50) CHECK (action_type IN ('open_order','open_menu','open_url','open_reward','open_voucher','dismiss')),
    action_payload JSONB,
    is_read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    campaign_id INTEGER REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notification_delivery_log (
    id BIGSERIAL PRIMARY KEY,
    message_id BIGINT NOT NULL REFERENCES notification_messages(id) ON DELETE CASCADE,
    channel campaign_channel NOT NULL,
    device_id BIGINT REFERENCES customer_devices(id) ON DELETE SET NULL,
    recipient_address VARCHAR(255) NOT NULL,
    status notification_status NOT NULL DEFAULT 'pending',
    provider VARCHAR(50),
    provider_message_id VARCHAR(255),
    provider_response JSONB,
    retry_count SMALLINT NOT NULL DEFAULT 0 CHECK (retry_count BETWEEN 0 AND 5),
    error_code VARCHAR(50),
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notification_preferences (
    id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    channel campaign_channel NOT NULL,
    message_category VARCHAR(50) NOT NULL DEFAULT 'all' CHECK (message_category IN ('all','order_updates','promotions','loyalty','system')),
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (customer_id, channel, message_category)
);

-- ============================================================
-- 4.17 STAFF & WORKFORCE
-- ============================================================

CREATE TABLE reservations (
    id BIGSERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
    dining_table_id INTEGER REFERENCES dining_tables(id) ON DELETE SET NULL,
    party_size SMALLINT CHECK (party_size > 0),
    reservation_date DATE NOT NULL,
    reservation_time TIME NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 90 CHECK (duration_minutes > 0),
    status reservation_status NOT NULL DEFAULT 'requested',
    special_requests TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE staff_profiles (
    id BIGSERIAL PRIMARY KEY,
    principal_id BIGINT NOT NULL UNIQUE REFERENCES iam_principals(id) ON DELETE RESTRICT,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    employee_id VARCHAR(20) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    email_address VARCHAR(255),
    phone_number VARCHAR(20),
    role staff_role NOT NULL,
    hourly_rate NUMERIC(10,4) CHECK (hourly_rate >= 0),
    hire_date DATE,
    termination_date DATE,
    pin_hash VARCHAR(255),
    pin_last_changed_at TIMESTAMPTZ,
    tip_eligible BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE staff_time_events (
    id BIGSERIAL PRIMARY KEY,
    staff_id BIGINT NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    event_type shift_event_type NOT NULL,
    event_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    latitude NUMERIC(10,8) CHECK (latitude BETWEEN -90 AND 90),
    longitude NUMERIC(11,8) CHECK (longitude BETWEEN -180 AND 180),
    location_verified BOOLEAN NOT NULL DEFAULT false,
    device_info VARCHAR(255),
    photo_url VARCHAR(500),
    notes VARCHAR(255),
    approved_by BIGINT REFERENCES admin_accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE staff_shifts (
    id BIGSERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    staff_id BIGINT NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    shift_date DATE NOT NULL,
    planned_start TIMESTAMPTZ NOT NULL,
    planned_end TIMESTAMPTZ NOT NULL,
    actual_start TIMESTAMPTZ,
    actual_end TIMESTAMPTZ,
    break_duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (break_duration_minutes >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','confirmed','in_progress','completed','cancelled','no_show')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_staff_shifts_time_order CHECK (planned_end > planned_start)
);

CREATE TABLE tip_allocations (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    staff_id BIGINT REFERENCES staff_profiles(id) ON DELETE SET NULL,
    tip_amount NUMERIC(10,4) NOT NULL CHECK (tip_amount >= 0),
    tip_percentage NUMERIC(5,4),
    allocation_type VARCHAR(20) NOT NULL CHECK (allocation_type IN ('even_split','percentage','fixed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4.18 PLATFORM & GOVERNANCE
-- ============================================================

CREATE TABLE token_blacklist (
    id BIGSERIAL PRIMARY KEY,
    jti VARCHAR(255) NOT NULL UNIQUE,
    token_type VARCHAR(20) NOT NULL CHECK (token_type IN ('access','refresh')),
    principal_id BIGINT REFERENCES iam_principals(id) ON DELETE SET NULL,
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    reason VARCHAR(100)
);

CREATE TABLE referral_events (
    id BIGSERIAL PRIMARY KEY,
    referrer_customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    invitee_customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    referral_code VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','converted','expired','rewarded')),
    converted_at TIMESTAMPTZ,
    reward_issued_at TIMESTAMPTZ,
    reward_wallet_entry_id BIGINT REFERENCES wallet_ledger_entries(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (referrer_customer_id, invitee_customer_id)
);

CREATE TABLE platform_config (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(100) NOT NULL UNIQUE,
    config_value JSONB NOT NULL DEFAULT '{}',
    value_type VARCHAR(20) NOT NULL DEFAULT 'string' CHECK (value_type IN ('string','integer','decimal','boolean','json','timestamp')),
    environment VARCHAR(20) NOT NULL DEFAULT 'all' CHECK (environment IN ('all','development','staging','production')),
    is_sensitive BOOLEAN NOT NULL DEFAULT false,
    is_editable BOOLEAN NOT NULL DEFAULT true,
    modified_by BIGINT REFERENCES admin_accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    principal_id BIGINT REFERENCES iam_principals(id) ON DELETE SET NULL,
    action audit_action NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id BIGINT,
    store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL,
    severity audit_severity NOT NULL DEFAULT 'info',
    before_state JSONB,
    after_state JSONB,
    changes_summary JSONB,
    ip_address INET,
    user_agent TEXT,
    request_method VARCHAR(10),
    request_path VARCHAR(255),
    request_id VARCHAR(100),
    session_id VARCHAR(100),
    processing_time_ms INTEGER,
    error_code VARCHAR(50),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE scheduled_jobs (
    id BIGSERIAL PRIMARY KEY,
    job_name VARCHAR(100) NOT NULL UNIQUE,
    job_type VARCHAR(50) NOT NULL CHECK (job_type IN ('cleanup','report','notification','sync','billing','data_retention')),
    cron_expression VARCHAR(100),
    next_run_at TIMESTAMPTZ,
    last_run_at TIMESTAMPTZ,
    last_run_duration_ms INTEGER,
    last_run_status VARCHAR(20) CHECK (last_run_status IN ('success','failed','running','skipped')),
    last_run_error TEXT,
    run_count INTEGER NOT NULL DEFAULT 0 CHECK (run_count >= 0),
    failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE data_retention_policies (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(50) NOT NULL UNIQUE,
    retention_days INTEGER NOT NULL CHECK (retention_days > 0),
    purge_strategy VARCHAR(20) NOT NULL DEFAULT 'anonymize' CHECK (purge_strategy IN ('delete','anonymize','archive')),
    archive_table VARCHAR(50),
    is_active BOOLEAN NOT NULL DEFAULT true,
    records_purged_count BIGINT NOT NULL DEFAULT 0 CHECK (records_purged_count >= 0),
    last_purged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE system_health_metrics (
    id BIGSERIAL PRIMARY KEY,
    metric_name VARCHAR(50) NOT NULL,
    store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL,
    metric_value NUMERIC(15,6) NOT NULL,
    metric_unit VARCHAR(20),
    dimensions JSONB,
    bucket_start TIMESTAMPTZ NOT NULL,
    bucket_duration_minutes INTEGER NOT NULL DEFAULT 5 CHECK (bucket_duration_minutes IN (1,5,15,60,1440)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4.19 EQUIPMENT & MAINTENANCE
-- ============================================================

CREATE TABLE equipment (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    equipment_type VARCHAR(50) NOT NULL DEFAULT 'general',
    serial_number VARCHAR(100),
    manufacturer VARCHAR(100),
    model VARCHAR(100),
    location VARCHAR(100),
    purchase_date DATE,
    warranty_expiry DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'operational',
    last_maintenance_date DATE,
    next_maintenance_date DATE,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_equipment_status CHECK (status IN ('operational','maintenance','retired','broken'))
);

CREATE TABLE equipment_maintenance_logs (
    id BIGSERIAL PRIMARY KEY,
    equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    maintenance_type VARCHAR(20) NOT NULL DEFAULT 'preventive',
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    description TEXT,
    performed_by VARCHAR(100),
    cost NUMERIC(10,2),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_equipment_maintenance_log_maintenance_type CHECK (maintenance_type IN ('preventive','corrective','inspection','repair','replacement')),
    CONSTRAINT ck_equipment_maintenance_log_status CHECK (status IN ('scheduled','in_progress','completed','cancelled'))
);
