# FNB Super App - Documentation Index
**Last Updated:** 2026-04-19 | **Status:** Admin Panel Complete - Ready for PWA Development

---

## Quick Navigation

### For Developers
1. **[01-architecture.md](01-architecture.md)** - Start here for system overview
2. **[02-database-schema.md](02-database-schema.md)** - Database structure and relationships
3. **[03-api-reference.md](03-api-reference.md)** - Complete API endpoint reference
4. **[05-alignment-verification.md](05-alignment-verification.md)** - Model/DB/Endpoint alignment

### For Operations
5. **[07-deployment-guide.md](07-deployment-guide.md)** - Production deployment instructions
6. **[09-troubleshooting.md](09-troubleshooting.md)** - Common issues and solutions
7. **[01-architecture.md](01-architecture.md)** - System architecture and service management

### For Testing
8. **[04-testing-guide.md](04-testing-guide.md)** - Test accounts and verification procedures
9. **[06-improvements-applied.md](06-improvements-applied.md)** - What's been fixed and verified

### For UI/UX
10. **[ui-ux-guidelines.md](ui-ux-guidelines.md)** - Theme system and component usage

### Detailed Schema
11. **[02a-acl.md](02a-acl.md)** - Access Control schema
12. **[02b-users.md](02b-users.md)** - Users and authentication
13. **[02c-stores.md](02c-stores.md)** - Stores and tables
14. **[02d-menu.md](02d-menu.md)** - Menu and inventory
15. **[02e-orders.md](02e-orders.md)** - Orders and payments
16. **[02f-loyalty.md](02f-loyalty.md)** - Loyalty system
17. **[02g-marketing.md](02g-marketing.md)** - Rewards and vouchers
18. **[02h-staff.md](02h-staff.md)** - Staff management
19. **[02i-social.md](02i-social.md)** - Referrals and favorites
20. **[02j-system.md](02j-system.md)** - Config and notifications

---

## Documentation Status

| File | Last Updated | Status | Purpose |
|------|--------------|--------|---------|
| 01-architecture.md | 2026-04-19 | ✅ Current | System architecture overview |
| 02-database-schema.md | 2026-04-19 | ✅ Updated | Database schema (52 tables) |
| 02a-acl.md | - | ✅ Current | Access control schema |
| 02b-users.md | - | ✅ Current | User management |
| 02c-stores.md | - | ✅ Current | Store management |
| 02d-menu.md | - | ✅ Current | Menu and inventory |
| 02e-orders.md | - | ✅ Current | Orders and payments |
| 02f-loyalty.md | - | ✅ Current | Loyalty system |
| 02g-marketing.md | - | ✅ Current | Marketing features |
| 02h-staff.md | - | ✅ Current | Staff management |
| 02i-social.md | 2026-04-19 | ✅ Updated | Referral system - INVITE FRIENDS planned |
| 02j-system.md | - | ✅ Current | System config |
| 03-api-reference.md | 2026-04-19 | ✅ Updated | 198 endpoints |
| 04-testing-guide.md | 2026-04-19 | ✅ Updated | All seed scripts certified |
| 05-alignment-verification.md | 2026-04-19 | ✅ Updated | Model alignment verified |
| 06-improvements-applied.md | 2026-04-19 | ✅ Updated | Latest UI fixes documented |
| 07-deployment-guide.md | 2026-04-19 | ✅ Current | Production deployment |
| 09-troubleshooting.md | 2026-04-19 | ✅ Current | Troubleshooting guide |
| ui-ux-guidelines.md | 2026-04-19 | ✅ Current | UI/UX standards |

---

## Key Documentation Updates (Session 7 - UI Standardization & Final Review)

### Frontend Fixes Applied
1. **PromotionsPage.tsx** - Fixed duplicate "Survey Reports" tab
2. **PromotionsPage.tsx** - Fixed duplicate Survey Reports view rendering
3. **SurveyReportPage.tsx** - Updated to use standardized `Select`, `DataTableExpandableRow`, and `Pagination` components
4. **CustomerDetailPage.tsx** - Updated Orders, Loyalty, Wallet tabs to use `DataTable` and `Pagination` components
5. **New Component: DataTableExpandableRow** - Added to `/components/ui/DataTable.tsx` for expandable row functionality

### Backend Verification
- ✅ `/wallet/deduct` endpoint exists and working (POST /wallet/deduct)
- ✅ Customer token resolution working in Flow A/B scripts
- ✅ Wallet deduction API properly called in order completion flows
- ✅ All seed scripts using correct tokens for voucher/wallet operations

---

## Post-PWA Development Roadmap

### Phase 1: PWA Core (Current Next Phase)
- Customer mobile app interface
- OTP authentication flow
- Menu browsing and ordering
- Cart management
- Wallet top-up via payment gateway

### Phase 2: Invite Friends System (MUST DO after PWA)
**Status:** Database ready, logic pending
- Complete referral reward calculation
- Add referrer reward tracking
- Implement "INVITE FRIENDS" feature
- Track successful referrals count

**Required Changes:**
- Add `referrer_reward_paid` to referrals table
- Add `referred_user_order_count` to referrals table
- Add `referral_count` and `referral_earnings` to users table
- Implement reward distribution logic

### Phase 3: Operational Enhancements (Good to Have)
| Feature | Priority | Dependencies | Notes |
|---------|----------|--------------|-------|
| Push Notifications (Twilio) | Medium | PWA + Twilio account | Use Twilio for SMS + Push |
| Device Token Management | Low | Push Notifications | Store FCM/APNS tokens |
| Real-time Order Updates | Low | 3rd party delivery | WebSocket for live tracking |
| Analytics Events Tracking | Low | Business needs | User behavior analytics |
| Order Cancellation Reasons | Low | Easy to add | Capture why orders cancelled |
| Order Instructions Table | Low | Easy to add | Dietary/special instructions |

### Phase 4: Inventory Integration
**Current Approach:** POS system sync at closing
- ACL: Only Store Manager/Assistant with "Inventory" permission can update quantities
- Inventory ledger tracks all changes
- No auto-deduction (by design - POS owns inventory)

---

## System Status

**Current State:** ✅ ADMIN PANEL COMPLETE

**Admin Panel Completion:** 100%

**Next Phase:** PWA Development

**Last Audit:** 2026-04-19 (Final UI Standardization)

**Verified:**
- ✅ All frontend pages using standardized UI components
- ✅ DataTable, Pagination, Select components unified
- ✅ No duplicate Survey Reports tabs
- ✅ CustomerDetailPage using proper components
- ✅ SurveyReportPage using DataTableExpandableRow
- ✅ Wallet deduction API confirmed working
- ✅ Customer token flow confirmed working
- ✅ All seed scripts certified (00-18)
- ✅ Flow A & B order completion working
- ✅ 198 API endpoints documented
- ✅ 52 database tables aligned

---

## Documentation by Task

### "How do I deploy to production?"
→ [07-deployment-guide.md](07-deployment-guide.md)

### "What's the database schema?"
→ [02-database-schema.md](02-database-schema.md) + [02a-02j schema docs](02a-acl.md)

### "What API endpoints are available?"
→ [03-api-reference.md](03-api-reference.md)

### "How do I test the system?"
→ [04-testing-guide.md](04-testing-guide.md)

### "Something's broken, how do I fix it?"
→ [09-troubleshooting.md](09-troubleshooting.md)

### "What's the overall system architecture?"
→ [01-architecture.md](01-architecture.md)

### "What theme colors and components should I use?"
→ [ui-ux-guidelines.md](ui-ux-guidelines.md)

### "What was fixed in the latest updates?"
→ [06-improvements-applied.md](06-improvements-applied.md)

### "Are models aligned with the database?"
→ [05-alignment-verification.md](05-alignment-verification.md)

### "What's planned after PWA?"
→ See "Post-PWA Development Roadmap" section above

---

## Important Notes for PWA Development

### Voucher vs Reward System
- **Reward:** Customer exchanges loyalty points for reward
  - Uses `reward_redemption_code` in orders
  - Deducts points from loyalty account
  - Creates `user_rewards` record

- **Voucher:** Customer claims through promotions/surveys
  - Uses `voucher_code` in orders
  - No points deducted
  - Creates `user_vouchers` record

### Order Flows
- **Flow A (Pickup/Delivery):** `pending → paid → confirmed → preparing → ready → completed`
  - Payment happens first
  - Wallet deduction at checkout

- **Flow B (Dine-in):** `pending → confirmed → preparing → ready → paid → completed`
  - Confirmation happens first
  - Payment at end of meal

### Authentication
- Admin: Email/password login
- Customers: OTP via phone
- Staff: Email/password login

---

**All documentation is up to date and reflects the current system state.**

**Ready for PWA Development Phase.**
