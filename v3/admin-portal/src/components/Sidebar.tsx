"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Store, UtensilsCrossed, Package, Users, LogOut,
  ChevronRight, Menu, X, Calendar, Award, Wallet,
  FileText, Bell, UserCircle, BarChart3,
  LayoutTemplate, ShoppingBag, Grid3X3,
  Star, Settings, Languages, TrendingUp, Wrench,
  Shield,
} from "lucide-react";
import { adminLogout } from "@/lib/api";
import { useBrand } from "./BrandProvider";
import { STORAGE_KEYS, ROUTES } from "@/lib/constants";

type NavItem = {
  type?: "section";
  label: string;
  href?: string;
  icon?: React.ElementType;
  children?: { label: string; href: string }[];
};

const navItems: NavItem[] = [
  // ═══════════════════════════════════
  // COMPANY
  // ═══════════════════════════════════
  { type: "section", label: "Company" },
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  {
    label: "Stores", href: "/stores", icon: Store,
    children: [
      { label: "Store Locations", href: "/stores" },
      { label: "Store Settings", href: "/stores/settings" },
    ],
  },
  {
    label: "Menu", href: "/menu", icon: UtensilsCrossed,
    children: [
      { label: "Categories", href: "/menu/categories" },
      { label: "Items", href: "/menu/items" },
      { label: "Allergens", href: "/menu/allergens" },
      { label: "Dietary Tags", href: "/menu/dietary-tags" },
      { label: "Tax Categories", href: "/menu/tax-categories" },
    ],
  },
  {
    label: "Loyalty", href: "/loyalty", icon: Award,
    children: [
      { label: "Tiers", href: "/loyalty/tiers" },
      { label: "Accounts", href: "/loyalty/accounts" },
      { label: "Ledger", href: "/loyalty/ledger" },
      { label: "Loyalty Settings", href: "/loyalty/settings" },
    ],
  },
  {
    label: "Marketing", href: "/marketing", icon: TrendingUp,
    children: [
      { label: "Rewards", href: "/rewards" },
      { label: "Promotions", href: "/promotions" },
      { label: "Vouchers", href: "/vouchers" },
      { label: "Voucher Report", href: "/vouchers/report" },
      { label: "Surveys", href: "/surveys" },
      { label: "Survey Report", href: "/surveys/report" },
      { label: "Referrals", href: "/referrals" },
      { label: "Referral Settings", href: "/referrals/settings" },
      { label: "Check-ins", href: "/checkins" },
      { label: "Check-in Settings", href: "/checkins/settings" },
      { label: "Campaigns", href: "/marketing/campaigns" },
      { label: "Campaign Settings", href: "/marketing/campaigns/settings" },
    ],
  },
  {
    label: "Content", href: "/content", icon: LayoutTemplate,
    children: [
      { label: "Info Cards", href: "/content/info-cards" },
      { label: "Products", href: "/content/products" },
      { label: "Events", href: "/content/events" },
      { label: "Event RSVP Report", href: "/content/events/report" },
      { label: "System Pages", href: "/content/system" },
      { label: "PWA Splash", href: "/content/pwa-splash" },
    ],
  },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Audit Log", href: "/audit-log", icon: FileText },
  {
    label: "Settings", href: "/settings", icon: Settings,
    children: [
      { label: "App Settings", href: "/settings" },
      { label: "Reservation Settings", href: "/settings/reservations" },
      { label: "Version Control", href: "/settings/version-control" },
    ],
  },
  {
    label: "Admin User", href: "/admins", icon: Shield,
    children: [
      { label: "Admin Listing", href: "/admins" },
      { label: "Admin Roles", href: "/admins/roles" },
      { label: "My Profile", href: "/profile" },
    ],
  },
  { label: "Translations", href: "/translations", icon: Languages },

  // ═══════════════════════════════════
  // SUPPORT
  // ═══════════════════════════════════
  { type: "section", label: "Support" },
  { label: "Customers List", href: "/customers", icon: UserCircle },
  { label: "Customer Consents", href: "/customers/consents", icon: FileText },
  { label: "Customer Devices", href: "/customers/devices", icon: BarChart3 },
  {
    label: "Notifications", href: "/notifications", icon: Bell,
    children: [
      { label: "Notifications List", href: "/notifications" },
      { label: "Templates", href: "/notifications/templates" },
      { label: "Report", href: "/notifications/report" },
    ],
  },
  { label: "Feedback", href: "/feedback", icon: Star },

  // ═══════════════════════════════════
  // STORE OPERATIONS
  // ═══════════════════════════════════
  { type: "section", label: "Store Operations" },
  { label: "Orders", href: "/orders", icon: ShoppingBag },
  { label: "Refunds", href: "/refunds", icon: Wallet },
  {
    label: "Reservations", href: "/reservations", icon: Calendar,
    children: [
      { label: "Reservation List", href: "/reservations" },
    ],
  },
  { label: "Tables", href: "/tables", icon: Grid3X3 },
  {
    label: "Inventory", href: "/inventory", icon: Package,
    children: [
      { label: "Categories", href: "/inventory/categories" },
      { label: "Items", href: "/inventory/items" },
      { label: "Suppliers", href: "/inventory/suppliers" },
      { label: "Movements", href: "/inventory/movements" },
      { label: "Purchase Orders", href: "/inventory/purchase-orders" },
    ],
  },
  { label: "Equipment", href: "/equipment", icon: Wrench, children: [
      { label: "Equipment List", href: "/equipment" },
      { label: "Reports Ledger", href: "/equipment/reports" },
    ] },
  {
    label: "Staff", href: "/staff", icon: Users,
    children: [
      { label: "Staff List", href: "/staff" },
      { label: "Staff Roles", href: "/staff/roles" },
      { label: "Staff Shifts", href: "/staff/shifts" },
      { label: "Attendance", href: "/staff/attendance" },
      { label: "Tips", href: "/staff/tips" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { brandName } = useBrand();
  const computeOpenMenus = useCallback(() => ({
    Stores: pathname.startsWith("/stores"),
    Menu: pathname.startsWith("/menu"),
    Loyalty: pathname.startsWith("/loyalty"),
    Marketing: pathname.startsWith("/marketing") || pathname.startsWith("/rewards") || pathname.startsWith("/vouchers") || pathname.startsWith("/surveys") || pathname.startsWith("/promotions") || pathname.startsWith("/referrals") || pathname.startsWith("/checkins"),
    Content: pathname.startsWith("/content"),
    Inventory: pathname.startsWith("/inventory"),
    Equipment: pathname.startsWith("/equipment"),
    Staff: pathname.startsWith("/staff"),
    Reservations: pathname.startsWith("/reservations"),
    "Customers List": pathname.startsWith("/customers"),
    Notifications: pathname.startsWith("/notifications"),
    "Admin User": pathname.startsWith("/admins"),
    Settings: pathname.startsWith("/settings"),
  }), [pathname]);

  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>(computeOpenMenus);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setOpenMenus(prev => ({ ...prev, ...computeOpenMenus() })); }, [pathname, computeOpenMenus]);

  const toggleMenu = (label: string) => setOpenMenus(prev => ({ ...prev, [label]: !prev[label] }));
  const handleLogout = () => { adminLogout(); router.push(ROUTES.LOGIN); };
  const isActive = (href: string) => pathname === href;

  const [adminEmail, setAdminEmail] = useState("");
  useEffect(() => {
    const read = () => {
      setAdminEmail(typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEYS.ADMIN_EMAIL) || "" : "");
    };
    read();
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, []);

  return (
    <>
      <div className="sb-mobile-header">
        <span className="sb-mobile-brand">{brandName}</span>
        <button type="button" className="sb-mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      <aside className={`sb-aside ${mobileOpen ? "mobile-open" : "mobile-closed"}`}>
        <div className="sb-brand">
          <div className="sb-brand-icon"><Store size={18} /></div>
          <div><div className="sb-brand-name">{brandName}</div><div className="sb-brand-sub">Admin Portal</div></div>
        </div>
        <nav className="sb-nav">
          <ul className="sb-nav-list">
            {navItems.map(item => {
              if (item.type === "section") return <li key={item.label} className="sb-section-label">{item.label}</li>;
              const Icon = item.icon;
              const hasChildren = !!item.children;
              const active = isActive(item.href!) || (hasChildren && pathname.startsWith(item.href!));
              const isOpen = openMenus[item.label] || false;
              return (
                <li key={item.label}>
                  {hasChildren ? (
                    <>
                      <button type="button" className={`sb-nav-link ${active ? "active" : ""}`} onClick={() => toggleMenu(item.label)}>
                        <span className="sb-nav-icon">{Icon && <Icon size={17} />}</span><span>{item.label}</span>
                        <ChevronRight size={14} className={`sb-chevron ${isOpen ? "open" : ""}`} />
                      </button>
                      {isOpen && (
                        <div className="sb-subnav">
                          {item.children!.map(child => (
                            <Link key={child.href} href={child.href} className={`sb-subnav-link ${isActive(child.href) ? "active" : ""}`} onClick={() => setMobileOpen(false)}>{child.label}</Link>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <Link href={item.href!} className={`sb-nav-link ${active ? "active" : ""}`} onClick={() => setMobileOpen(false)}>
                      <span className="sb-nav-icon">{Icon && <Icon size={17} />}</span><span>{item.label}</span>
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="sb-footer">
          <div className="sb-footer-email">{adminEmail}</div>
          <button type="button" className="sb-logout-btn" onClick={handleLogout}><LogOut size={14} className="sb-logout-icon" /> Logout</button>
        </div>
      </aside>
    </>
  );
}
