"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthProvider, useAuth } from "@/lib/auth";
import { AppProvider, useApp } from "@/lib/store";
import * as api from "@/lib/api";

const NAV_TABS = [
  { href: "/", icon: "fa-house", label: "Home" },
  { href: "/menu", icon: "fa-utensils", label: "Menu" },
  { href: "/rewards", icon: "fa-star", label: "Rewards" },
  { href: "/cart", icon: "fa-bag-shopping", label: "Cart" },
  { href: "/profile", icon: "fa-user", label: "Profile" },
];

function StoreSelectorModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { setSelectedStore } = useApp();
  const [search, setSearch] = useState("");
  const [stores, setStores] = useState<Awaited<ReturnType<typeof api.stores.listStores>> | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleOpen() {
    setLoading(true);
    try {
      const data = await api.stores.listStores({ search: search || undefined });
      setStores(data);
    } catch {
      setStores(null);
    } finally {
      setLoading(false);
    }
  }

  return open ? (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Select Store</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <i className="fa-solid fa-xmark text-xl" />
          </button>
        </div>
        <div className="flex gap-2 mb-4">
          <input
            placeholder="Search stores..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
          />
          <button className="btn btn-primary" onClick={handleOpen}>
            Search
          </button>
        </div>
        {loading ? (
          <div className="text-center py-8 text-gray-400">Loading...</div>
        ) : stores ? (
          <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
            {stores.data.map((store) => (
              <button
                key={store.id}
                className="card flex items-center gap-3 cursor-pointer hover:border-[var(--color-navy)] transition-colors"
                onClick={() => {
                  setSelectedStore(store);
                  onClose();
                }}
              >
                <div className="w-10 h-10 rounded-xl bg-[var(--color-bg)] flex items-center justify-center">
                  <i className="fa-solid fa-store text-[var(--color-navy)]" />
                </div>
                <div className="text-left flex-1">
                  <div className="font-medium text-sm">{store.name}</div>
                  <div className="text-xs text-gray-500">{store.address}</div>
                </div>
              </button>
            ))}
            {stores.data.length === 0 && (
              <div className="text-center py-4 text-gray-400">No stores found</div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            Search for a store to get started
          </div>
        )}
      </div>
    </div>
  ) : null;
}

function Header() {
  const { selectedStore } = useApp();
  const { isAuthenticated } = useAuth();
  const [storeModalOpen, setStoreModalOpen] = useState(false);

  if (!isAuthenticated) return null;

  return (
    <>
      <header className="sticky top-0 z-50 bg-[var(--color-navy)] text-white px-4 py-3 flex items-center gap-3">
        <button
          className="flex items-center gap-2 flex-1 min-w-0"
          onClick={() => setStoreModalOpen(true)}
        >
          <i className="fa-solid fa-location-dot text-[var(--color-gold)]" />
          <span className="truncate text-sm font-medium">
            {selectedStore?.name ?? "Select Store"}
          </span>
          <i className="fa-solid fa-chevron-down text-xs opacity-70" />
        </button>
        <div className="flex items-center gap-4">
          <button className="relative">
            <i className="fa-solid fa-bell text-lg" />
          </button>
          <button>
            <i className="fa-solid fa-qrcode text-lg" />
          </button>
        </div>
      </header>
      <StoreSelectorModal
        open={storeModalOpen}
        onClose={() => setStoreModalOpen(false)}
      />
    </>
  );
}

function BottomNav() {
  const pathname = usePathname();
  const { cart } = useApp();
  const { isAuthenticated } = useAuth();
  const cartCount = cart?.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  if (!isAuthenticated) return null;

  function getActive(path: string) {
    if (path === "/") return pathname === "/" || pathname === "";
    return pathname.startsWith(path);
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 flex justify-around items-center h-16 safe-area-bottom">
      {NAV_TABS.map((tab) => {
        const active = getActive(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href === "/" ? "/" : tab.href}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 relative ${
              active ? "text-[var(--color-navy)]" : "text-gray-400"
            }`}
          >
            <div className="relative">
              <i className={`fa-solid ${tab.icon} text-lg`} />
              {tab.label === "Cart" && cartCount > 0 && (
                <span className="absolute -top-2 -right-3 bg-[var(--color-red)] text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {cartCount > 9 ? "9+" : cartCount}
                </span>
              )}
            </div>
            <span className={`text-[10px] ${active ? "font-semibold" : ""}`}>
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <AppProvider>
        <div className="min-h-screen flex flex-col bg-[var(--color-bg)]">
          <Header />
          <main className="flex-1 pb-20 page-enter">{children}</main>
          <BottomNav />
        </div>
      </AppProvider>
    </AuthProvider>
  );
}
