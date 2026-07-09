# Frequently Asked Questions

## General

### What browsers are supported?
Latest versions of Chrome, Firefox, Safari, and Edge. The Customer PWA works best on Android Chrome and iOS Safari.

### Why am I logged out automatically?
Admin and Staff portals have a 30-minute idle timeout for security. The Customer PWA uses local-storage tokens and will ask you to re-authenticate when the token expires.

### What is the difference between admin roles and staff roles?
Admin roles control access to the Admin Portal. Staff roles control access to the Staff Portal. A person can have both, but they do not mix automatically.

### What does "store scoped" mean?
A store-scoped record or page only shows data for stores assigned to your account. HQ roles (`system_admin`, `regional_manager`, `readonly_analyst`) bypass store scoping and see all stores.

## Admin Portal

### I am a store manager but cannot see data for another store.
Store managers are scoped to their assigned stores. Contact a system admin or regional manager to add a store assignment under **Admin Users**.

### I changed a menu item price but the PWA still shows the old price.
Try refreshing the PWA or clearing its cache. The PWA caches menu data for a short time.

### Can I delete a staff member?
Staff profiles can be deactivated. Deleting a profile may break historical order and shift records.

### Why can't my cashier see the Admin Portal?
Cashier is a Staff Portal role, not an Admin Portal role. Staff roles cannot authenticate to the Admin Portal.

### Where do I configure payment gateways?
Go to **Settings → Payment Gateway**. You can enable Stripe and HitPay, enter test/live keys, and set the public URL.

### How do translations work?
UI translations are managed under **Translations**. Content translations (menu items, rewards, help articles) are stored per record and can be auto-translated when the record is saved.

## Staff Portal

### I forgot my PIN.
Contact a manager or admin. They can reset your PIN from the Admin Portal under **Staff → Staff Profiles**.

### Why can I not see the POS button?
Your staff role does not include POS access. Only `cashier`, `server`, `shift_supervisor`, `store_manager`, and admin users can use the POS.

### The kitchen page shows "Failed to load orders".
Check your internet connection. If the problem persists, ask a manager to verify your store assignment and role. Some kitchen actions require an admin-endpoint token.

### How do I apply a customer voucher at POS?
1. Build the order.
2. Tap **Add Voucher / Reward**.
3. Scan the customer's voucher QR code or enter the voucher code.
4. The discount is applied automatically.

### What is the customer-facing display?
A second screen that shows the customer their cart and a Stripe QR code to pay. Open it from the POS actions menu.

## Customer PWA

### How do I earn loyalty points?
Place orders while logged in. Points are earned automatically based on order value and your current tier multiplier.

### Where can I see my rewards?
Go to **Profile → My Rewards**. Active rewards and vouchers are shown with their redemption codes.

### Can I order without creating an account?
Some stores allow guest checkout. If guest checkout is enabled, you can place an order with just a phone number.

### How do I pay for an order?
At checkout, select your preferred payment method. Stripe handles card, FPX, and e-wallet payments. Some stores also allow cash on collection.

### What does "ready_for_pickup" mean?
Your order is prepared and waiting at the counter or designated pickup area.

### How do I scan a table QR code?
Open the PWA camera or tap the dine-in option in the cart, then point the camera at the table QR code. This links your order to the table.

## Still need help?
Contact your system administrator or open a support request from the Staff Portal profile page.
