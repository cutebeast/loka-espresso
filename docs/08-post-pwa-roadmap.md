# Post-PWA Development Roadmap

**Document**: 08-post-pwa-roadmap.md  
**Last Updated**: 2026-04-19  
**Status**: Planning Phase

---

## Overview

This document outlines all features and enhancements planned for development after the PWA (Progressive Web App) customer interface is complete. The Admin Panel is 100% complete and certified. This roadmap prioritizes features by business value and technical dependencies.

---

## Phase 1: Invite Friends System (MUST DO - High Priority)

### Status
- **Database**: Schema ready (referrals table exists)
- **Logic**: Pending implementation
- **Timeline**: Immediately after PWA launch

### Current State
- Referral codes are generated and stored
- Customers can be referred during registration
- **Missing**: Reward calculation and distribution

### Required Database Changes

```sql
-- Add to referrals table
ALTER TABLE referrals ADD COLUMN referrer_reward_paid BOOLEAN DEFAULT FALSE;
ALTER TABLE referrals ADD COLUMN referred_user_order_count INTEGER DEFAULT 0;
ALTER TABLE referrals ADD COLUMN referrer_reward_amount DECIMAL(10,2);

-- Add to users table
ALTER TABLE users ADD COLUMN referral_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN referral_earnings DECIMAL(10,2) DEFAULT 0.00;
```

### Implementation Tasks
1. **Backend API**: `POST /referrals/claim-reward`
   - Triggered when referred user completes first order
   - Calculates reward based on config
   - Credits referrer's wallet or loyalty points

2. **Backend Logic**: Track referred user orders
   - Increment `referred_user_order_count` on each order
   - Award referrer when count reaches threshold (e.g., 1st order)

3. **PWA Screen**: "Invite Friends" page
   - Display user's referral code
   - Show referral stats (friends joined, earnings)
   - Share via SMS/WhatsApp/Copy link

4. **Admin Config**: Referral reward settings
   - Reward type (wallet credit / loyalty points)
   - Reward amount
   - Minimum order for reward qualification

### Business Value
- Customer acquisition through word-of-mouth
- Viral growth mechanism
- Measurable ROI on referral program

---

## Phase 2: Push Notifications (Medium Priority)

### Status
- **Service Provider**: Twilio (SMS + Push combined)
- **Database**: Device token table needed
- **Timeline**: After Invite Friends system

### Required Database Changes

```sql
-- New table: user_device_tokens
CREATE TABLE user_device_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    device_token VARCHAR(255) NOT NULL,
    platform VARCHAR(20) NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, device_token)
);
```

### Required APIs

```
POST /notifications/register-device
  body: { device_token: string, platform: string }
  
POST /notifications/unregister-device
  body: { device_token: string }
  
POST /admin/notifications/send-push
  body: { user_ids: number[], title: string, body: string, data: object }
```

### Notification Types
1. **Order Status Updates**
   - Order confirmed
   - Order ready for pickup
   - Order out for delivery
   - Order completed

2. **Promotional**
   - New rewards available
   - Limited-time offers
   - Birthday vouchers

3. **Engagement**
   - Abandoned cart reminder
   - Come back offers (inactive customers)
   - Survey invitations

### Business Value
- Re-engage inactive customers
- Real-time order updates improve experience
- Direct marketing channel

---

## Phase 3: Analytics & Insights (Medium Priority)

### Status
- **Tables**: Not created
- **Reporting**: Basic admin reports exist
- **Timeline**: After Push Notifications

### Required Database Changes

```sql
-- New table: analytics_events
CREATE TABLE analytics_events (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB,
    session_id VARCHAR(100),
    ip_address INET,
    user_agent TEXT,
    store_id INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_events_user ON analytics_events(user_id);
CREATE INDEX idx_analytics_events_created ON analytics_events(created_at);
CREATE INDEX idx_analytics_events_data ON analytics_events USING GIN(event_data);
```

### Event Types to Track

| Event | Description |
|-------|-------------|
| `page_view` | Screen/page viewed |
| `button_click` | Button/interaction clicked |
| `cart_add` | Item added to cart |
| `cart_remove` | Item removed from cart |
| `checkout_start` | Checkout process initiated |
| `checkout_complete` | Order placed successfully |
| `voucher_apply` | Voucher applied to order |
| `reward_redeem` | Reward redeemed |
| `wallet_topup` | Wallet topped up |
| `survey_start` | Survey started |
| `survey_complete` | Survey completed |
| `referral_share` | Referral code shared |

### Reporting APIs

```
GET /admin/analytics/events
  params: { event_type, start_date, end_date, store_id }
  
GET /admin/analytics/funnel
  params: { funnel_name, start_date, end_date }
  
GET /admin/analytics/user-journey
  params: { user_id, start_date, end_date }
```

### Business Value
- Understand customer behavior
- Optimize conversion funnels
- A/B test features
- Data-driven decisions

---

## Phase 4: Order Enhancements (Low Priority)

### 4.1 Order Cancellation Reasons

**Status**: Easy to implement

**Database Change**:
```sql
ALTER TABLE orders ADD COLUMN cancellation_reason TEXT;
ALTER TABLE orders ADD COLUMN cancelled_by VARCHAR(20); -- 'customer' | 'staff' | 'system'
```

**Frontend Changes**:
- Add reason dropdown when cancelling order
- Display reason in order details

### 4.2 Order Instructions

**Status**: Easy to implement

**New Table**:
```sql
CREATE TABLE order_instructions (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    instruction_type VARCHAR(30) CHECK (instruction_type IN ('dietary', 'allergy', 'preparation', 'packaging', 'delivery')),
    description TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Frontend Changes**:
- Add instruction input during checkout
- Display instructions in order details (staff view)

### Business Value
- Better customer satisfaction (special requests)
- Reduced order errors
- Dietary/allergy compliance

---

## Phase 5: Real-time Features (Future)

### 5.1 WebSocket for Live Order Updates

**Status**: Not critical (using 3rd party delivery)

**Use Cases**:
- Live kitchen status updates
- Delivery driver location tracking
- Table availability updates

**Implementation**:
```
WebSocket: /ws/orders/{order_id}
  - Subscribe to order status changes
  - Receive real-time updates
  
WebSocket: /ws/stores/{store_id}/tables
  - Real-time table occupancy updates
```

### 5.2 Inventory Auto-Deduction

**Status**: Current approach is POS sync at closing

**Note**: Not implementing auto-deduction by design. Inventory is owned by POS system.

**Current Flow**:
1. Orders flow to POS
2. POS manages inventory
3. End-of-day sync updates ACL inventory
4. Store Manager/Assistant updates inventory via ACL

---

## Implementation Priority Summary

| Phase | Feature | Priority | Effort | Business Value |
|-------|---------|----------|--------|----------------|
| 1 | Invite Friends System | **MUST DO** | Medium | High - Customer acquisition |
| 2 | Push Notifications | Medium | Medium | High - Engagement |
| 3 | Device Token Management | Medium | Low | Required for Push |
| 4 | Analytics Events | Medium | Medium | Medium - Insights |
| 5 | Cancellation Reasons | Low | Low | Low - Nice to have |
| 6 | Order Instructions | Low | Low | Low - Nice to have |
| 7 | Real-time WebSocket | Future | High | Medium - UX improvement |

---

## Technical Notes

### Database Migration Strategy
- All new tables should use `IF NOT EXISTS`
- All new columns should have sensible defaults
- Create indexes for query performance
- Use Alembic migrations for version control

### API Versioning
- New APIs should follow existing patterns
- Use Pydantic schemas for validation
- Document in `03-api-reference.md`

### Frontend Standards
- Use existing UI components from `@/components/ui`
- Follow established patterns from Admin Panel
- Maintain consistent theming

---

## Success Metrics

### Invite Friends System
- Referral conversion rate (target: >20%)
- Average referrals per customer (target: >2)
- Cost per acquisition via referral (target: <RM 5)

### Push Notifications
- Opt-in rate (target: >60%)
- Open rate (target: >15%)
- Conversion rate from notification (target: >5%)

### Analytics
- Event tracking coverage (target: 100% of key actions)
- Report generation time (target: <5 seconds)
- Data retention (target: 2 years)

---

**This roadmap is a living document and will be updated as priorities shift or new requirements emerge.**
