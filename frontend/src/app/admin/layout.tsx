"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/lib/auth";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: "fa-chart-line" },
  { href: "/admin/orders", label: "Orders", icon: "fa-receipt" },
  { href: "/admin/menu", label: "Menu", icon: "fa-utensils" },
  { href: "/admin/tables", label: "Tables", icon: "fa-chair" },
  { href: "/admin/reports", label: "Reports", icon: "fa-file-chart-column" },
  { href: "/admin/vouchers", label: "Vouchers", icon: "fa-ticket" },
  { href: "/admin/settings", label: "Settings", icon: "fa-gear" },
];

function AdminShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    router.push("/admin/login");
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-[var(--color-navy)] text-white transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-gold)] text-[var(--color-navy)]">
            <i className="fa-solid fa-store text-sm" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight">FNB Super-App</p>
            <p className="text-[11px] text-white/60">Merchant Portal</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-white/15 text-[var(--color-gold)]"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <i className={`fa-solid ${item.icon} w-5 text-center`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-sm">
              {user?.name?.charAt(0)?.toUpperCase() ?? "M"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium">
                {user?.name ?? "Merchant"}
              </p>
              <p className="truncate text-xs text-white/50">
                {user?.email ?? ""}
              </p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 lg:px-8">
          <button
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <i className="fa-solid fa-bars text-lg" />
          </button>

          <div className="hidden lg:block" />

          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              {user?.name ?? "Merchant"}
            </span>
            <button onClick={handleLogout} className="btn btn-sm">
              <i className="fa-solid fa-right-from-bracket" />
              Logout
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <AdminShell>{children}</AdminShell>
    </AuthProvider>
  );
}
