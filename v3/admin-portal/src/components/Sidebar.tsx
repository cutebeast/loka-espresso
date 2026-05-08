"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Store,
  UtensilsCrossed,
  Package,
  Users,
  LogOut,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  Calendar,
  Award,
  Wallet,
  Tag,
  Gift,
  FileText,
  Bell,
  UserCircle,
  Clock,
  Banknote,
  LayoutTemplate,
  Megaphone,
  Share2,
  ClipboardList,
} from "lucide-react";
import { adminLogout, getToken } from "@/lib/api";

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Stores", href: "/stores", icon: Store },
  {
    label: "Menu",
    href: "/menu",
    icon: UtensilsCrossed,
    children: [
      { label: "Categories", href: "/menu/categories" },
      { label: "Items", href: "/menu/items" },
      { label: "Allergens", href: "/menu/allergens" },
      { label: "Tax Categories", href: "/menu/tax-categories" },
    ],
  },
  {
    label: "Inventory",
    href: "/inventory",
    icon: Package,
    children: [
      { label: "Categories", href: "/inventory/categories" },
      { label: "Items", href: "/inventory/items" },
      { label: "Suppliers", href: "/inventory/suppliers" },
      { label: "Movements", href: "/inventory/movements" },
      { label: "Purchase Orders", href: "/inventory/purchase-orders" },
    ],
  },
  {
    label: "Staff",
    href: "/staff",
    icon: Users,
    children: [
      { label: "Staff List", href: "/staff" },
      { label: "Time Events", href: "/staff/time-events" },
      { label: "Tips", href: "/staff/tips" },
    ],
  },
  {
    label: "Customers",
    href: "/customers",
    icon: UserCircle,
    children: [
      { label: "Consents", href: "/customers/consents" },
      { label: "Devices", href: "/customers/devices" },
    ],
  },
  { label: "Reservations", href: "/reservations", icon: Calendar },
  {
    label: "Loyalty",
    href: "/loyalty",
    icon: Award,
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
    label: "Content",
    href: "/content",
    icon: LayoutTemplate,
    children: [
      { label: "Blocks", href: "/content/blocks" },
      { label: "Splash Screens", href: "/content/splash-screens" },
    ],
  },
  {
    label: "Marketing",
    href: "/marketing",
    icon: Megaphone,
    children: [
      { label: "Campaigns", href: "/marketing/campaigns" },
    ],
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

  const adminEmail = typeof window !== "undefined" ? localStorage.getItem("adminEmail") || "admin@lokaespresso.my" : "";

  return (
    <>
      {/* Mobile header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-slate-800 text-white">
        <span className="font-semibold">Admin Portal</span>
        <button onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={`${
          mobileOpen ? "block" : "hidden"
        } md:flex flex-col w-64 bg-slate-800 text-white h-screen sticky top-0`}
      >
        <div className="p-4 text-lg font-bold border-b border-slate-700">Admin Portal</div>
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1">
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
                        className={`w-full flex items-center justify-between px-4 py-2 hover:bg-slate-700 transition ${
                          active ? "bg-slate-700" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {Icon && <Icon size={18} />}
                          <span>{item.label}</span>
                        </div>
                        {openMenus[item.href] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                      {openMenus[item.href] && (
                        <ul className="ml-6 mt-1 space-y-1">
                          {item.children.map((child) => (
                            <li key={child.href}>
                              <Link
                                href={child.href}
                                className={`block px-4 py-1.5 rounded hover:bg-slate-700 transition ${
                                  isActive(child.href) ? "bg-slate-700" : ""
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
                      className={`flex items-center gap-3 px-4 py-2 hover:bg-slate-700 transition ${
                        active ? "bg-slate-700" : ""
                      }`}
                      onClick={() => setMobileOpen(false)}
                    >
                      {Icon && <Icon size={18} />}
                      <span>{item.label}</span>
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="p-4 border-t border-slate-700">
          <div className="text-sm text-slate-300 mb-2 truncate">{adminEmail}</div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded transition"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
