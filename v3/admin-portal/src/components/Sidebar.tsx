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
  Shield, ClipboardCheck,
} from "lucide-react";
import { adminLogout } from "@/lib/api";
import { useBrand } from "./BrandProvider";
import { useTranslation } from "@/lib/i18n";
import LanguageSelector from "./LanguageSelector";
import { STORAGE_KEYS, ROUTES } from "@/lib/constants";

type NavItem = {
  type?: "section";
  id: string;
  labelKey: string;
  href?: string;
  icon?: React.ElementType;
  children?: { id: string; labelKey: string; href: string }[];
};

const navItems: NavItem[] = [
  { type: "section", id: "company", labelKey: "admin.nav.section.company" },
  { id: "dashboard", labelKey: "admin.nav.dashboard", href: "/", icon: LayoutDashboard },
  {
    id: "stores", labelKey: "admin.nav.stores", href: "/stores", icon: Store,
    children: [
      { id: "storeLocations", labelKey: "admin.nav.stores.locations", href: "/stores" },
      { id: "storeSettings", labelKey: "admin.nav.stores.settings", href: "/stores/settings" },
    ],
  },
  {
    id: "menu", labelKey: "admin.nav.menu", href: "/menu", icon: UtensilsCrossed,
    children: [
      { id: "menuCategories", labelKey: "admin.nav.menu.categories", href: "/menu/categories" },
      { id: "menuItems", labelKey: "admin.nav.menu.items", href: "/menu/items" },
      { id: "menuBundles", labelKey: "admin.nav.menu.bundleProducts", href: "/menu/bundle-products" },
      { id: "menuAllergens", labelKey: "admin.nav.menu.allergens", href: "/menu/allergens" },
      { id: "menuDietary", labelKey: "admin.nav.menu.dietaryTags", href: "/menu/dietary-tags" },
      { id: "menuTax", labelKey: "admin.nav.menu.taxCategories", href: "/menu/tax-categories" },
    ],
  },
  {
    id: "loyalty", labelKey: "admin.nav.loyalty", href: "/loyalty", icon: Award,
    children: [
      { id: "loyaltyTiers", labelKey: "admin.nav.loyalty.tiers", href: "/loyalty/tiers" },
      { id: "loyaltyAccounts", labelKey: "admin.nav.loyalty.accounts", href: "/loyalty/accounts" },
      { id: "loyaltyLedger", labelKey: "admin.nav.loyalty.ledger", href: "/loyalty/ledger" },
      { id: "loyaltySettings", labelKey: "admin.nav.loyalty.settings", href: "/loyalty/settings" },
    ],
  },
  {
    id: "marketing", labelKey: "admin.nav.marketing", href: "/marketing", icon: TrendingUp,
    children: [
      { id: "marketingRewards", labelKey: "admin.nav.marketing.rewards", href: "/rewards" },
      { id: "marketingPromotions", labelKey: "admin.nav.marketing.promotions", href: "/promotions" },
      { id: "marketingVouchers", labelKey: "admin.nav.marketing.vouchers", href: "/vouchers" },
      { id: "marketingVoucherReport", labelKey: "admin.nav.marketing.voucherReport", href: "/vouchers/report" },
      { id: "marketingSurveys", labelKey: "admin.nav.marketing.surveys", href: "/surveys" },
      { id: "marketingSurveyReport", labelKey: "admin.nav.marketing.surveyReport", href: "/surveys/report" },
      { id: "marketingReferrals", labelKey: "admin.nav.marketing.referrals", href: "/referrals" },
      { id: "marketingReferralSettings", labelKey: "admin.nav.marketing.referralSettings", href: "/referrals/settings" },
      { id: "marketingCheckins", labelKey: "admin.nav.marketing.checkins", href: "/checkins" },
      { id: "marketingCheckinSettings", labelKey: "admin.nav.marketing.checkinSettings", href: "/checkins/settings" },
      { id: "marketingCampaigns", labelKey: "admin.nav.marketing.campaigns", href: "/marketing/campaigns" },
      { id: "marketingCampaignSettings", labelKey: "admin.nav.marketing.campaignSettings", href: "/marketing/campaigns/settings" },
    ],
  },
  {
    id: "content", labelKey: "admin.nav.content", href: "/content", icon: LayoutTemplate,
    children: [
      { id: "contentInfoCards", labelKey: "admin.nav.content.infoCards", href: "/content/info-cards" },
      { id: "contentProducts", labelKey: "admin.nav.content.products", href: "/content/products" },
      { id: "contentEvents", labelKey: "admin.nav.content.events", href: "/content/events" },
      { id: "contentEventReport", labelKey: "admin.nav.content.eventReport", href: "/content/events/report" },
      { id: "contentSystem", labelKey: "admin.nav.content.systemPages", href: "/content/system" },
      { id: "contentPwaSplash", labelKey: "admin.nav.content.pwaSplash", href: "/content/pwa-splash" },
    ],
  },
  { id: "reports", labelKey: "admin.nav.reports", href: "/reports", icon: BarChart3 },
  { id: "auditLog", labelKey: "admin.nav.auditLog", href: "/audit-log", icon: FileText },
  {
    id: "settings", labelKey: "admin.nav.settings", href: "/settings", icon: Settings,
    children: [
      { id: "settingsApp", labelKey: "admin.nav.settings.app", href: "/settings" },
      { id: "settingsPayment", labelKey: "admin.nav.settings.paymentGateway", href: "/settings/payment-gateway" },
      { id: "settingsTwilioVerify", labelKey: "admin.nav.settings.twilioVerify", href: "/settings/twilio-verify" },
      { id: "settingsVersion", labelKey: "admin.nav.settings.versionControl", href: "/settings/version-control" },
    ],
  },
  {
    id: "adminUser", labelKey: "admin.nav.adminUser", href: "/admins", icon: Shield,
    children: [
      { id: "adminListing", labelKey: "admin.nav.adminUser.listing", href: "/admins" },
      { id: "adminRoles", labelKey: "admin.nav.adminUser.roles", href: "/admins/roles" },
      { id: "adminProfile", labelKey: "admin.nav.adminUser.profile", href: "/profile" },
    ],
  },
  { id: "translations", labelKey: "admin.nav.translations", href: "/translations", icon: Languages },

  { type: "section", id: "support", labelKey: "admin.nav.section.support" },
  { id: "customers", labelKey: "admin.nav.customers", href: "/customers", icon: UserCircle },
  { id: "customerConsents", labelKey: "admin.nav.customers.consents", href: "/customers/consents", icon: FileText },
  { id: "customerDevices", labelKey: "admin.nav.customers.devices", href: "/customers/devices", icon: BarChart3 },
  {
    id: "notifications", labelKey: "admin.nav.notifications", href: "/notifications", icon: Bell,
    children: [
      { id: "notificationsList", labelKey: "admin.nav.notifications.list", href: "/notifications" },
      { id: "notificationsTemplates", labelKey: "admin.nav.notifications.templates", href: "/notifications/templates" },
      { id: "notificationsReport", labelKey: "admin.nav.notifications.report", href: "/notifications/report" },
    ],
  },
  { id: "feedback", labelKey: "admin.nav.feedback", href: "/feedback", icon: Star },

  { type: "section", id: "storeOps", labelKey: "admin.nav.section.storeOps" },
  { id: "orders", labelKey: "admin.nav.orders", href: "/orders", icon: ShoppingBag },
  { id: "refunds", labelKey: "admin.nav.refunds", href: "/refunds", icon: Wallet },
  {
    id: "reservations", labelKey: "admin.nav.reservations", href: "/reservations", icon: Calendar,
    children: [
      { id: "reservationsList", labelKey: "admin.nav.reservations.list", href: "/reservations" },
    ],
  },
  { id: "tables", labelKey: "admin.nav.tables", href: "/tables", icon: Grid3X3 },
  {
    id: "inventory", labelKey: "admin.nav.inventory", href: "/inventory", icon: Package,
    children: [
      { id: "inventoryCategories", labelKey: "admin.nav.inventory.categories", href: "/inventory/categories" },
      { id: "inventoryItems", labelKey: "admin.nav.inventory.items", href: "/inventory/items" },
      { id: "inventoryStock", labelKey: "admin.nav.inventory.stockLevels", href: "/inventory/stocks" },
      { id: "inventorySuppliers", labelKey: "admin.nav.inventory.suppliers", href: "/inventory/suppliers" },
      { id: "inventoryMovements", labelKey: "admin.nav.inventory.movements", href: "/inventory/movements" },
      { id: "inventoryPurchase", labelKey: "admin.nav.inventory.purchaseOrders", href: "/inventory/purchase-orders" },
    ],
  },
  { id: "equipment", labelKey: "admin.nav.equipment", href: "/equipment", icon: Wrench, children: [
      { id: "equipmentList", labelKey: "admin.nav.equipment.list", href: "/equipment" },
      { id: "equipmentReports", labelKey: "admin.nav.equipment.reports", href: "/equipment/reports" },
    ] },
  { id: "hygiene", labelKey: "admin.nav.hygiene", href: "/hygiene", icon: ClipboardCheck },
  {
    id: "staff", labelKey: "admin.nav.staff", href: "/staff", icon: Users,
    children: [
      { id: "staffList", labelKey: "admin.nav.staff.list", href: "/staff" },
      { id: "staffRoles", labelKey: "admin.nav.staff.roles", href: "/staff/roles" },
      { id: "staffShifts", labelKey: "admin.nav.staff.shifts", href: "/staff/shifts" },
      { id: "staffAttendance", labelKey: "admin.nav.staff.attendance", href: "/staff/attendance" },
      { id: "staffTips", labelKey: "admin.nav.staff.tips", href: "/staff/tips" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { brandName } = useBrand();
  const { t } = useTranslation();
  const computeOpenMenus = useCallback(() => ({
    stores: pathname.startsWith("/stores"),
    menu: pathname.startsWith("/menu"),
    loyalty: pathname.startsWith("/loyalty"),
    marketing: pathname.startsWith("/marketing") || pathname.startsWith("/rewards") || pathname.startsWith("/vouchers") || pathname.startsWith("/surveys") || pathname.startsWith("/promotions") || pathname.startsWith("/referrals") || pathname.startsWith("/checkins"),
    content: pathname.startsWith("/content"),
    inventory: pathname.startsWith("/inventory"),
    equipment: pathname.startsWith("/equipment"),
    hygiene: pathname.startsWith("/hygiene"),
    staff: pathname.startsWith("/staff"),
    reservations: pathname.startsWith("/reservations"),
    customers: pathname.startsWith("/customers"),
    notifications: pathname.startsWith("/notifications"),
    adminUser: pathname.startsWith("/admins"),
    settings: pathname.startsWith("/settings"),
  }), [pathname]);

  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>(computeOpenMenus);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setOpenMenus(prev => ({ ...prev, ...computeOpenMenus() })); }, [pathname, computeOpenMenus]);

  const toggleMenu = (id: string) => setOpenMenus(prev => ({ ...prev, [id]: !prev[id] }));
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
          <div><div className="sb-brand-name">{brandName}</div><div className="sb-brand-sub">{t("admin.app.adminPortal")}</div></div>
        </div>
        <nav className="sb-nav">
          <ul className="sb-nav-list">
            {navItems.map(item => {
              if (item.type === "section") return <li key={item.id} className="sb-section-label">{t(item.labelKey)}</li>;
              const Icon = item.icon;
              const hasChildren = !!item.children;
              const active = isActive(item.href!) || (hasChildren && pathname.startsWith(item.href!));
              const isOpen = openMenus[item.id] || false;
              return (
                <li key={item.id}>
                  {hasChildren ? (
                    <>
                      <button type="button" className={`sb-nav-link ${active ? "active" : ""}`} onClick={() => toggleMenu(item.id)}>
                        <span className="sb-nav-icon">{Icon && <Icon size={17} />}</span><span>{t(item.labelKey)}</span>
                        <ChevronRight size={14} className={`sb-chevron ${isOpen ? "open" : ""}`} />
                      </button>
                      {isOpen && (
                        <div className="sb-subnav">
                          {item.children!.map(child => (
                            <Link key={child.href} href={child.href} className={`sb-subnav-link ${isActive(child.href) ? "active" : ""}`} onClick={() => setMobileOpen(false)}>{t(child.labelKey)}</Link>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <Link href={item.href!} className={`sb-nav-link ${active ? "active" : ""}`} onClick={() => setMobileOpen(false)}>
                      <span className="sb-nav-icon">{Icon && <Icon size={17} />}</span><span>{t(item.labelKey)}</span>
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="sb-footer">
          <div className="sb-footer-email">{adminEmail}</div>
          <div style={{ marginBottom: 10 }}><LanguageSelector /></div>
          <button type="button" className="sb-logout-btn" onClick={handleLogout}><LogOut size={14} className="sb-logout-icon" /> {t("admin.common.logout")}</button>
        </div>
      </aside>
    </>
  );
}
