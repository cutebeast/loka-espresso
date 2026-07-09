# Admin Portal: Content

## Pages
- `/content/info-cards` — Info Cards
- `/content/products` — Product Cards
- `/content/events` — Events
- `/content/events/report` — Event RSVP Report
- `/content/system` — System Pages
- `/content/pwa-splash` — PWA Splash Screens

## Purpose
Manage in-app content and legal pages shown in the Customer PWA.

## Info Cards (`/content/info-cards`)

### What it shows
Short informational cards displayed in the PWA home or information section.

### Create an info card
1. Click **New Info Card**.
2. Enter title, short description, long description, and image.
3. Set action type and action URL (optional).
4. Set position and active dates.
5. Save.

### Usage
Use info cards for announcements, highlights, or featured content.

## Product Cards (`/content/products`)

### What it shows
Featured product cards for marketing content.

### Create a product card
1. Click **New Product Card**.
2. Select a menu item or enter product details manually.
3. Add image and description.
4. Set position and active dates.
5. Save.

## Events (`/content/events`)

### What it shows
Events that customers can view and RSVP to.

### Create an event
1. Click **New Event**.
2. Enter title, description, location, and event datetime.
3. Enable RSVP and set max capacity if needed.
4. Upload event image.
5. Save.

### Event RSVP Report (`/content/events/report`)
View RSVPs, attendance, and capacity usage.

## System Pages (`/content/system`)

### What it shows
Static pages such as Terms of Service, Privacy Policy, and About.

### Create a system page
1. Click **New Page**.
2. Enter a unique **page key** (e.g., `terms_of_service`).
3. Enter title and body content.
4. Set active.
5. Save.

### Usage in PWA
System pages are fetched by `page_key` and displayed in the PWA legal section.

## PWA Splash Screens (`/content/pwa-splash`)

### What it shows
Splash screens shown when the PWA launches.

### Create a splash screen
1. Click **New Splash Screen**.
2. Upload image.
3. Enter title and subtitle.
4. Set active dates.
5. Save.

## Related
- [Customer PWA — Information](../customer/information-and-events.md)
- [Translations](translations.md)
