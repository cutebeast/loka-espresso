"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Store, UtensilsCrossed, Package, Users, LogOut,
  ChevronDown, ChevronRight, Menu, X, Calendar, Award, Wallet,
  Tag, Gift, FileText, Bell, UserCircle, Clock, Banknote,
  LayoutTemplate, Megaphone, Share2, ClipboardList,
} from "lucide-react";
import { adminLogout } from "@/lib/api";

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Stores", href: "/stores", icon: Store },
  {
    label: "Menu", href: "/menu", icon: UtensilsCrossed,
    children: [
      { label: "Categories", href: "/menu/categories" },
      { label: "Items", href: "/menu/items" },
      { label: "Allergens", href: "/menu/allergens" },
      { label: "Tax Categories", href: "/menu/tax-categories" },
    ],
  },
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
  {
    label: "Staff", href: "/staff", icon: Users,
    children: [
      { label: "Staff List", href: "/staff" },
      { label: "Time Events", href: "/staff/time-events" },
      { label: "Tips", href: "/staff/tips" },
    ],
  },
  {
    label: "Customers", href: "/customers", icon: UserCircle,
    children: [
      { label: "Consents", href: "/customers/consents" },
      { label: "Devices", href: "/customers/devices" },
    ],
  },
  { label: "Reservations", href: "/reservations", icon: Calendar },
  {
    label: "Loyalty", href: "/loyalty", icon: Award,
    children: [
      { label: "Tiers", href: "/loyalty/tiers" },
      { label: "Accounts", href: "/loyalty/accounts" },
      { label: "Ledger", href: "/loyalty/ledger" },
    ],
  },
  { label: "Wallets", href: "/wallets", icon: Wallet },
  { label: "Vouchers", href: "/vouchers", icon: Tag },
  { label: "Rewards", href: "/rewards", icon: Gift },
  { label: "Audit Log", href: "/audit-log", icon: FileText },
  { label: "Notifications", href: "/notifications", icon: Bell },
  {
    label: "Content", href: "/content", icon: LayoutTemplate,
    children: [
      { label: "Blocks", href: "/content/blocks" },
      { label: "Splash Screens", href: "/content/splash-screens" },
    ],
  },
  {
    label: "Marketing", href: "/marketing", icon: Megaphone,
    children: [{ label: "Campaigns", href: "/marketing/campaigns" }],
  },
  { label: "Referrals", href: "/referrals", icon: Share2 },
  { label: "Surveys", href: "/surveys", icon: ClipboardList },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({
    "/menu": pathname.startsWith("/menu"),
    "/inventory": pathname.startsWith("/inventory"),
    "/loyalty": pathname.startsWith("/loyalty"),
    "/staff": pathname.startsWith("/staff"),
    "/customers": pathname.startsWith("/customers"),
    "/content": pathname.startsWith("/content"),
    "/marketing": pathname.startsWith("/marketing"),
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleMenu = (href: string) => {
    setOpenMenus((prev) => ({ ...prev, [href]: !prev[href] }));
  };

  const handleLogout = () => {
    adminLogout();
    router.push("/login");
  };

  const isActive = (href: string) => pathname === href;
  const adminEmail = typeof window !== "undefined" ? localStorage.getItem("adminEmail") || "admin@loyaltysystem.uk" : "";

  return (
    <>
      {/* Mobile header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-brand-sidebar text-white">
        <span className="font-semibold">Admin Portal</span>
        <button onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`${mobileOpen ? "block" : "hidden"} md:flex flex-col w-64 bg-brand-sidebar text-white h-screen sticky top-0`}>
        {/* Brand header */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-brand flex items-center justify-center">
              <Store size={18} className="text-white" />
            </div>
            <div>
              <div className="text-base font-bold leading-tight">Loka Espresso</div>
              <div className="text-xs text-white/50">Admin Portal</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          <ul className="space-y-0.5 px-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const hasChildren = !!item.children;
              const active = isActive(item.href) || (hasChildren && pathname.startsWith(item.href));
              return (
                <li key={item.href}>
                  {hasChildren ? (
                    <>
                      <button
                        onClick={() => toggleMenu(item.href)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-md transition ${
                          active ? "bg-brand-sidebar-active text-white" : "text-white/70 hover:bg-brand-sidebar-hover hover:text-white"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {Icon && <Icon size={17} className={active ? "text-gold" : "text-white/50"} />}
                          <span className="text-sm font-medium">{item.label}</span>
                        </div>
                        {openMenus[item.href] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      {openMenus[item.href] && (
                        <ul className="mt-0.5 space-y-0.5 pl-9 pr-2">
                          {item.children.map((child) => (
                            <li key={child.href}>
                              <Link
                                href={child.href}
                                className={`block px-3 py-1.5 rounded-md text-sm transition ${
                                  isActive(child.href)
                                    ? "bg-brand-sidebar-active text-white font-medium"
                                    : "text-white/60 hover:bg-brand-sidebar-hover hover:text-white"
                                }`}
                                onClick={() => setMobileOpen(false)}
                              >
                                {child.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md transition ${
                        active
                          ? "bg-brand-sidebar-active text-white font-medium"
                          : "text-white/70 hover:bg-brand-sidebar-hover hover:text-white"
                      }`}
                      onClick={() => setMobileOpen(false)}
                    >
                      {Icon && <Icon size={17} className={active ? "text-gold" : "text-white/50"} />}
                      <span className="text-sm font-medium">{item.label}</span>
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User section */}
        <div className="p-3 border-t border-white/10">
          <div className="text-xs text-white/40 mb-2 truncate px-1">{adminEmail}</div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md bg-white/5 hover:bg-white/10 transition text-white/80 hover:text-white"
          >
            <LogOut size={15} />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
