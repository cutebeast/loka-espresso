import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem } from '@/lib/api';

interface CartState {
  items: CartItem[];
  storeId: number | null;
  addItem: (item: CartItem, storeId?: number | null) => void;
  removeItem: (index: number) => void;
  updateQuantity: (index: number, quantity: number) => void;
  clearCart: () => void;
  setStoreId: (storeId: number | null) => void;
  getTotal: () => number;
  getItemCount: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      storeId: null,
      addItem: (item, storeId = null) =>
        set((state) => {
          const resolvedStoreId = storeId && storeId > 0 ? storeId : state.storeId;
          if (state.storeId && resolvedStoreId && state.storeId !== resolvedStoreId && state.items.length > 0) {
            return { items: [item], storeId: resolvedStoreId };
          }
          const existing = state.items.find(
            (c) => c.menu_item_id === item.menu_item_id && JSON.stringify(c.customizations) === JSON.stringify(item.customizations)
          );
          if (existing) {
            return {
              storeId: resolvedStoreId,
              items: state.items.map((c) =>
                c.menu_item_id === item.menu_item_id && JSON.stringify(c.customizations) === JSON.stringify(item.customizations)
                  ? { ...c, quantity: c.quantity + item.quantity }
                  : c
              ),
            };
          }
          return { items: [...state.items, item], storeId: resolvedStoreId };
        }),
      removeItem: (index) =>
        set((state) => {
          const items = state.items.filter((_, i) => i !== index);
          return { items, storeId: items.length > 0 ? state.storeId : null };
        }),
      updateQuantity: (index, quantity) =>
        set((state) => {
          const items = state.items
            .map((item, i) => (i === index ? { ...item, quantity: Math.max(0, quantity) } : item))
            .filter((item) => item.quantity > 0);
          return { items, storeId: items.length > 0 ? state.storeId : null };
        }),
      clearCart: () => set({ items: [], storeId: null }),
      setStoreId: (storeId) => set({ storeId }),
      getTotal: () => get().items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      getItemCount: () => get().items.reduce((sum, item) => sum + item.quantity, 0),
    }),
    {
      name: 'loka-cart',
    }
  )
);
