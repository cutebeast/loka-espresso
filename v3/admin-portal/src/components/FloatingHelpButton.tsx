"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { HelpCircle } from "lucide-react";

/**
 * Route-to-help-article mapping.
 * The first matching prefix wins, so order matters (longest prefixes first).
 */
const ROUTE_HELP_MAP: { prefix: string; slug: string }[] = [
  // Specific sub-routes first
  { prefix: "/stores/new", slug: "admin-stores" },
  { prefix: "/stores/settings", slug: "admin-stores" },
  { prefix: "/stores/", slug: "admin-stores" },
  { prefix: "/stores", slug: "admin-stores" },

  { prefix: "/menu/categories", slug: "admin-menu" },
  { prefix: "/menu/items", slug: "admin-menu" },
  { prefix: "/menu/bundle-products", slug: "admin-menu" },
  { prefix: "/menu/allergens", slug: "admin-menu" },
  { prefix: "/menu/dietary-tags", slug: "admin-menu" },
  { prefix: "/menu/tax-categories", slug: "admin-menu" },
  { prefix: "/menu", slug: "admin-menu" },

  { prefix: "/loyalty/tiers", slug: "admin-loyalty" },
  { prefix: "/loyalty/accounts", slug: "admin-loyalty" },
  { prefix: "/loyalty/ledger", slug: "admin-loyalty" },
  { prefix: "/loyalty/settings", slug: "admin-loyalty" },
  { prefix: "/loyalty", slug: "admin-loyalty" },

  { prefix: "/promotions", slug: "admin-marketing" },
  { prefix: "/rewards", slug: "admin-marketing" },
  { prefix: "/vouchers", slug: "admin-marketing" },
  { prefix: "/surveys", slug: "admin-marketing" },
  { prefix: "/referrals", slug: "admin-marketing" },
  { prefix: "/checkins", slug: "admin-marketing" },
  { prefix: "/marketing/campaigns", slug: "admin-marketing" },
  { prefix: "/marketing", slug: "admin-marketing" },

  { prefix: "/content/info-cards", slug: "admin-content" },
  { prefix: "/content/products", slug: "admin-content" },
  { prefix: "/events", slug: "admin-content" },
  { prefix: "/content/system", slug: "admin-content" },
  { prefix: "/content/pwa-splash", slug: "admin-content" },
  { prefix: "/content", slug: "admin-content" },

  { prefix: "/inventory/categories", slug: "admin-inventory" },
  { prefix: "/inventory/items", slug: "admin-inventory" },
  { prefix: "/inventory/stocks", slug: "admin-inventory" },
  { prefix: "/inventory/suppliers", slug: "admin-inventory" },
  { prefix: "/inventory/movements", slug: "admin-inventory" },
  { prefix: "/inventory/purchase-orders", slug: "admin-inventory" },
  { prefix: "/inventory", slug: "admin-inventory" },

  { prefix: "/equipment", slug: "admin-equipment" },
  { prefix: "/hygiene", slug: "admin-hygiene" },

  { prefix: "/staff/roles", slug: "admin-staff" },
  { prefix: "/staff/attendance", slug: "admin-staff" },
  { prefix: "/staff/shifts", slug: "admin-staff" },
  { prefix: "/staff/tips", slug: "admin-staff" },
  { prefix: "/staff/new", slug: "admin-staff" },
  { prefix: "/staff/", slug: "admin-staff" },
  { prefix: "/staff", slug: "admin-staff" },

  { prefix: "/customers/consents", slug: "admin-customers" },
  { prefix: "/customers/devices", slug: "admin-customers" },
  { prefix: "/customers", slug: "admin-customers" },

  { prefix: "/orders", slug: "admin-orders-refunds" },
  { prefix: "/refunds", slug: "admin-orders-refunds" },
  { prefix: "/reservations", slug: "admin-orders-refunds" },
  { prefix: "/tables", slug: "admin-orders-refunds" },

  { prefix: "/notifications/templates", slug: "admin-notifications" },
  { prefix: "/notifications/report", slug: "admin-notifications" },
  { prefix: "/notifications", slug: "admin-notifications" },

  { prefix: "/feedback", slug: "admin-customers" },

  { prefix: "/reports", slug: "admin-reports-audit" },
  { prefix: "/audit-log", slug: "admin-reports-audit" },

  { prefix: "/settings/payment-gateway", slug: "admin-settings" },
  { prefix: "/settings/twilio-verify", slug: "admin-settings" },
  { prefix: "/settings/version-control", slug: "admin-settings" },
  { prefix: "/settings", slug: "admin-settings" },

  { prefix: "/admins/roles", slug: "admin-admins" },
  { prefix: "/admins", slug: "admin-admins" },
  { prefix: "/profile", slug: "admin-profile" },

  { prefix: "/translations", slug: "admin-translations" },

  { prefix: "/help", slug: "admin-help-articles" },

  // Dashboard / home — last fallback
  { prefix: "/", slug: "admin-dashboard" },
];

function getHelpSlug(pathname: string): string {
  for (const entry of ROUTE_HELP_MAP) {
    if (pathname === entry.prefix || pathname.startsWith(entry.prefix + "/")) {
      return entry.slug;
    }
  }
  return "admin-index";
}

export default function FloatingHelpButton() {
  const pathname = usePathname();

  // Don't show on login or help pages
  if (pathname === "/login" || pathname.startsWith("/help")) return null;

  const slug = getHelpSlug(pathname);

  return (
    <Link
      href={`/help/${slug}`}
      className="floating-help-btn"
      aria-label="Help"
      title="View guide for this page"
    >
      <HelpCircle size={20} />
    </Link>
  );
}
