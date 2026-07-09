/**
 * Catch-all SPA route — serves the root AppShell for any non-static path.
 *
 * The PWA uses hash-based routing (#order-detail?orderId=123). When a
 * customer scans a QR code with a path-style URL (e.g. /order-detail?order_id=123),
 * Next.js would normally return 404. This catch-all page serves the root app
 * instead, and the client-side useHashRedirect hook in page.tsx converts the
 * path-style URL to the hash format so the AppShell router picks it up.
 *
 * Static assets (_next/*, icons, sw.js, manifest.json, etc.) and /api/* are
 * excluded by the rewrites in next.config.ts and the middleware matcher.
 */
import CustomerApp from '../page';

export default CustomerApp;
