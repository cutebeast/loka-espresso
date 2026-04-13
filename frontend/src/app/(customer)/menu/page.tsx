"use client";

import { useState, useEffect } from "react";
import { useApp } from "@/lib/store";
import * as api from "@/lib/api";
import type { MenuCategory, MenuItem } from "@/lib/types";

function CustomizeModal({
  item,
  storeId,
  onClose,
}: {
  item: MenuItem;
  storeId: string;
  onClose: () => void;
}) {
  const { refreshCart } = useApp();
  const [quantity, setQuantity] = useState(1);
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleAdd() {
    setLoading(true);
    try {
      await api.cart.addToCart(storeId, item.id, quantity, undefined, specialInstructions || undefined);
      await refreshCart();
      onClose();
    } catch {
      // handle error
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{item.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <i className="fa-solid fa-xmark text-xl" />
          </button>
        </div>

        <div className="w-full aspect-video rounded-xl bg-[var(--color-bg)] flex items-center justify-center mb-4">
          <i className="fa-solid fa-utensils text-4xl text-gray-300" />
        </div>

        {item.description && (
          <p className="text-sm text-gray-600 mb-4">{item.description}</p>
        )}

        {item.dietary && item.dietary.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {item.dietary.map((d) => (
              <span key={d} className="badge badge-green">
                {d}
              </span>
            ))}
          </div>
        )}

        {item.options && item.options.length > 0 && (
          <div className="space-y-3 mb-4">
            {item.options.map((opt) => (
              <div key={opt.id}>
                <div className="text-sm font-semibold mb-2">{opt.name}</div>
                <div className="flex flex-wrap gap-2">
                  {opt.choices?.map((choice) => (
                    <label
                      key={choice.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm cursor-pointer hover:border-[var(--color-navy)]"
                    >
                      <input type="checkbox" className="accent-[var(--color-navy)]" />
                      <span>{choice.name}</span>
                      {choice.price > 0 && (
                        <span className="text-gray-400">
                          +R{choice.price.toFixed(2)}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mb-4">
          <label className="text-sm font-semibold mb-1 block">Special Instructions</label>
          <input
            placeholder="Any special requests..."
            value={specialInstructions}
            onChange={(e) => setSpecialInstructions(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
            >
              <i className="fa-solid fa-minus text-xs" />
            </button>
            <span className="font-bold text-lg w-6 text-center">{quantity}</span>
            <button
              className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center"
              onClick={() => setQuantity(quantity + 1)}
            >
              <i className="fa-solid fa-plus text-xs" />
            </button>
          </div>
          <button
            className="btn btn-primary px-6"
            onClick={handleAdd}
            disabled={loading}
          >
            {loading ? "Adding..." : `Add - R${(item.price * quantity).toFixed(2)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MenuPage() {
  const { selectedStore, refreshCart } = useApp();
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadMenu() {
      if (!selectedStore) {
        setCategories([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const menu = await api.stores.getStoreMenu(selectedStore.id);
        setCategories(menu);
        if (menu.length > 0) setActiveCategory(menu[0].id);
      } catch {
        setCategories([]);
      } finally {
        setLoading(false);
      }
    }
    loadMenu();
  }, [selectedStore]);

  const visibleItems =
    categories.find((c) => c.id === activeCategory)?.items ?? [];

  if (!selectedStore) {
    return (
      <div className="flex flex-col items-center justify-center h-96 px-6 text-center">
        <i className="fa-solid fa-store text-4xl text-gray-300 mb-4" />
        <h2 className="text-lg font-bold mb-2">No Store Selected</h2>
        <p className="text-sm text-gray-500">
          Please select a store from the header to browse the menu
        </p>
      </div>
    );
  }

  return (
    <div className="pb-4">
      <div className="sticky top-0 z-40 bg-[var(--color-bg)] px-4 pt-3 pb-2">
        <div className="overflow-x-auto flex gap-2 scrollbar-hide">
          {categories.map((cat) => (
            <button
              key={cat.id}
              className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeCategory === cat.id
                  ? "bg-[var(--color-navy)] text-white"
                  : "bg-white text-gray-600 border border-gray-200"
              }`}
              onClick={() => setActiveCategory(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading menu...</div>
      ) : visibleItems.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No items in this category</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 px-4 mt-2">
          {visibleItems.map((item) => (
            <div
              key={item.id}
              className="card p-3 flex flex-col cursor-pointer"
              onClick={() => setSelectedItem(item)}
            >
              <div className="w-full aspect-square rounded-xl bg-[var(--color-bg)] flex items-center justify-center mb-3">
                <i className="fa-solid fa-utensils text-2xl text-gray-300" />
              </div>
              <div className="font-medium text-sm truncate">{item.name}</div>
              {item.description && (
                <div className="text-xs text-gray-400 truncate mt-0.5">
                  {item.description}
                </div>
              )}
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm font-bold text-[var(--color-navy)]">
                  R{item.price.toFixed(2)}
                </span>
                <button
                  className="w-8 h-8 rounded-full bg-[var(--color-navy)] text-white flex items-center justify-center"
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await api.cart.addToCart(selectedStore.id, item.id, 1);
                      await refreshCart();
                    } catch {
                      // handle error
                    }
                  }}
                >
                  <i className="fa-solid fa-plus text-xs" />
                </button>
              </div>
              {!item.isAvailable && (
                <div className="absolute inset-0 bg-white/60 rounded-[20px] flex items-center justify-center">
                  <span className="text-xs font-semibold text-gray-500">Unavailable</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {selectedItem && selectedStore && (
        <CustomizeModal
          item={selectedItem}
          storeId={selectedStore.id}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
}
