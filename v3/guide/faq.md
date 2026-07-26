# Frequently Asked Questions

## General

### What browsers are supported?
Latest versions of Chrome, Firefox, Safari, and Edge. The Customer PWA works best on Android Chrome and iOS Safari.

### Why am I logged out automatically?
Admin and Staff portals have an idle timeout for security. The Customer PWA keeps you signed in on your device and will ask you to verify again when the session expires.

### What is the difference between admin roles and staff roles?
Admin roles control access to the Admin Portal. Staff roles control access to the Staff Portal. A person can have both, but they do not mix automatically.

### What does "store scoped" mean?
A store-scoped record or page only shows data for stores assigned to your account. HQ roles (`system_admin`, `regional_manager`, `readonly_analyst`) bypass store scoping and see all stores.

### Is the menu halal?
Yes. LOKA Espresso is a halal Turkish coffee house — every item on the menu is halal (no pork, no lard, no alcohol; sausage items use chicken). Item-level dietary tags (vegetarian, vegan, gluten-free, etc.) and allergen badges are shown on each item in the app menu, and you can filter the menu by dietary tag.

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
Contact a manager or admin. They can reset your PIN from the Admin Portal under **Staff → Staff Profiles**. Note: the default PIN `000000` is never allowed for login — set your own 6-digit PIN.

### Why can I not see the POS button?
Your staff role does not include POS access. Only `cashier`, `server`, `shift_supervisor`, `store_manager`, and admin users can use the POS.

### The kitchen page shows "Failed to load orders".
Check your internet connection. If the problem persists, ask a manager to verify your store assignment and role. Some kitchen actions require an admin-endpoint token.

### Do I need the customer's phone number at the POS?
For normal menu orders, no — walk-in guests are fine. For workshop/experience bookings, yes: the POS requires an attached customer before the order can be sent. Search by phone, scan the customer's loyalty QR, or quick-add them with phone + display name. The phone number is the account identity, so bookings and points follow the customer.

### How do I apply a customer voucher at the POS?
1. Send the order to the kitchen, then open it from **Unpaid** to check out.
2. Scan or search the customer to attach them.
3. Tap **Apply Discounts & Wallet** and pick the voucher or reward, or pay (partly) from their wallet balance.
4. Take the remaining payment by cash, card, or QR.

### A customer wants to book a table. Where do I look?
Table bookings from the app appear under **Reservations**. Confirm the request there and assign a table. Paid workshops and classes are a different system — sell those at the POS from the **Experiences** category (see the POS Checkout guide).

### What is the customer-facing display?
A second screen that shows the customer their cart, fees, and total — and a QR code when they pay by QR. Open it from the **Customer Screen** button in the POS top bar.

## Customer PWA

### How do I sign in? Is there a password?
There's no password. Enter your phone number and we send a 6-digit one-time code (OTP) by SMS — enter the code and you're in. During the pilot period the code may be a fixed test code (`000000`) on some builds; at launch a real SMS code is always required. Your phone number is your account: points, wallet, vouchers, and bookings all live on it.

### How do I earn loyalty points?
Order while signed in — points are based on what you spend, multiplied by your tier. Extras: daily check-ins, bring-your-own-tumbler (BYOT) bonus points, double points in your birthday month, and campaign bonuses.

### What are the loyalty tiers?
Three tiers: **Bloom** (everyone starts here, 1x points), **Origin** (1.2x points), and **Reserve** (1.5x points, priority support). Tiers are based on your spending over a rolling 12 months — keep visiting and you'll be upgraded automatically. Your current tier and progress are on **My Card** and your **Profile**.

### Where can I see my rewards and vouchers?
Go to **Profile → My Rewards**. The **My Rewards** tab holds items you redeemed with points; the **My Vouchers** tab holds vouchers from promos, surveys, and the Lucky Draw. Tap a card to show its code to the cashier, or apply it at checkout.

### How does the Lucky Draw work?
Open **Lucky Draw** from the home-page banner and tap **SPIN**. Depending on the campaign running, you either get free daily spins (come back tomorrow when you run out) or earn draw tickets from paid purchases (e.g. RM 50 = 1 ticket, credited automatically after payment). Every spin wins a voucher, which lands in **My Rewards → My Vouchers**.

### How do I book a workshop or class?
Open **Workshops** (or tap the booking button on a paid event), tap **Book Now**, pick a session date, and check out — payment is in the app, by wallet or online payment. Seats are limited. Your booking appears under **Orders**. Table reservations are separate: book those under **Reservations**.

### How do I top up my wallet?
Open **Wallet → Top Up**, pick an amount (or enter a custom amount), and pay online — you'll be redirected to a secure checkout page (Stripe, or HitPay where configured). The balance updates right after payment. You can also top up with cash at the counter: show your loyalty QR from **My Card** to the staff.

### How do I pay for an order?
At checkout, choose: wallet balance, online payment (card / FPX / GrabPay via Stripe, or DuitNow / Touch 'n Go / Boost / ShopeePay via HitPay where enabled), **Pay at Counter** for pickup and dine-in, or **Cash on Delivery** for delivery orders.

### Can I order without creating an account?
You can browse the menu, promotions, events, and workshops as a guest. Ordering, reservations, wallet, and rewards need an account — signing in only takes a phone number and one SMS code. In-store, staff can serve you as a walk-in without an account.

### What does "ready_for_pickup" mean?
Your order is prepared and waiting at the counter or designated pickup area.

### How do I scan a table QR code?
Open the PWA camera or tap the dine-in option in the cart, then point the camera at the table QR code. This links your order to the table.

## Still need help?
Contact your system administrator or open a support request from the Staff Portal profile page. Customers can reach the store directly — find store details under **Information** in the app.
