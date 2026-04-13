"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useApp } from "@/lib/store";
import * as api from "@/lib/api";
import type { Promo, MenuItem } from "@/lib/types";

export default function HomePage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { selectedStore, refreshCart } = useApp();
  const [promos, setPromos] = useState<Promo[]>([]);
  const [popularItems, setPopularItems] = useState<MenuItem[]>([]);
  const [loyaltyPoints, setLoyaltyPoints] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [promoData, loyaltyData] = await Promise.all([
          api.promos.listPromos().catch(() => []),
          api.loyalty.getBalance().catch(() => null),
        ]);
        setPromos(Array.isArray(promoData) ? promoData : []);
        if (loyaltyData) setLoyaltyPoints(loyaltyData.points);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    if (isAuthenticated) loadData();
  }, [isAuthenticated]);

  useEffect(() => {
    async function loadMenu() {
      if (!selectedStore) {
        setPopularItems([]);
        return;
      }
      try {
        const menu = await api.stores.getStoreMenu(selectedStore.id);
        const allItems = menu.flatMap((cat) => cat.items);
        setPopularItems(allItems.slice(0, 8));
      } catch {
        setPopularItems([]);
      }
    }
    if (isAuthenticated) loadMenu();
  }, [isAuthenticated, selectedStore]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-96 px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-[var(--color-navy)] flex items-center justify-center mb-6">
          <i className="fa-solid fa-user text-white text-2xl" />
        </div>
        <h1 className="text-xl font-bold mb-2">Welcome to FNB</h1>
        <p className="text-gray-500 text-sm mb-6">
          Sign in to order food, earn rewards, and more
        </p>
        <Link href="/login" className="btn btn-primary px-8 py-3 text-base">
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-6">
      {!selectedStore && (
        <div className="card flex items-center gap-3 border-[var(--color-gold)] bg-[var(--color-gold)]/10">
          <i className="fa-solid fa-location-dot text-[var(--color-gold)]" />
          <div>
            <p className="text-sm font-medium">Select a store</p>
            <p className="text-xs text-gray-500">Tap the header to choose a store</p>
          </div>
        </div>
      )}

      {promos.length > 0 && (
        <div className="overflow-x-auto flex gap-3 pb-2 -mx-4 px-4 scrollbar-hide">
          {promos.map((promo) => (
            <div
              key={promo.id}
              className="min-w-[280px] rounded-2xl overflow-hidden bg-gradient-to-r from-[var(--color-navy)] to-[var(--color-navy-light)] text-white p-5 flex-shrink-0"
            >
              <div className="text-xs font-semibold uppercase tracking-wide opacity-80 mb-1">
                Promo
              </div>
              <div className="text-lg font-bold mb-1">{promo.title}</div>
              {promo.description && (
                <div className="text-sm opacity-80">{promo.description}</div>
              )}
              {promo.code && (
                <div className="mt-3 inline-block bg-white/20 rounded-lg px-3 py-1 text-sm font-mono">
                  {promo.code}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {loyaltyPoints !== null && (
        <div className="card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--color-gold)]/20 flex items-center justify-center">
                <i className="fa-solid fa-star text-[var(--color-gold)]" />
              </div>
              <div>
                <div className="text-xs text-gray-500">Loyalty Points</div>
                <div className="text-lg font-bold text-[var(--color-navy)]">
                  {loyaltyPoints.toLocaleString()} pts
                </div>
              </div>
            </div>
            <Link
              href="/rewards"
              className="btn btn-sm"
            >
              View
            </Link>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Popular Items</h2>
          {selectedStore && (
            <Link href="/menu" className="text-sm text-[var(--color-navy)] font-medium">
              See All
            </Link>
          )}
        </div>
        {!selectedStore ? (
          <div className="card text-center py-8 text-gray-400">
            Select a store to see menu items
          </div>
        ) : loading ? (
          <div className="text-center py-8 text-gray-400">Loading...</div>
        ) : popularItems.length === 0 ? (
          <div className="card text-center py-8 text-gray-400">
            No items available
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {popularItems.map((item) => (
              <div key={item.id} className="card p-3 flex flex-col">
                <div className="w-full aspect-square rounded-xl bg-[var(--color-bg)] flex items-center justify-center mb-3">
                  <i className="fa-solid fa-utensils text-2xl text-gray-300" />
                </div>
                <div className="font-medium text-sm truncate">{item.name}</div>
                <div className="text-xs text-gray-500 mb-2">
                  R{item.price.toFixed(2)}
                </div>
                <button
                  className="btn btn-primary btn-sm mt-auto justify-center w-full"
                  onClick={async () => {
                    try {
                      await api.cart.addToCart(selectedStore.id, item.id, 1);
                      await refreshCart();
                    } catch {
                      // handle error
                    }
                  }}
                >
                  <i className="fa-solid fa-plus text-xs" /> Add
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
