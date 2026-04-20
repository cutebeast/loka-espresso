import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem } from '@/lib/api';

interface CartState {
  items: CartItem[];
  storeId: number | null;
  addItem: (item: CartItem, storeId: number) => void;
  removeItem: (index: number) => void;
  updateQuantity: (index: number, quantity: number) => void;
  clearCart: () => void;
  getTotal: () => number;
  getItemCount: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      storeId: null,
      addItem: (item, storeId) =>
        set((state) => {
          if (state.storeId && state.storeId !== storeId) {
            return { items: [item], storeId };
          }
          const existing = state.items.find(
            (c) => c.menu_item_id === item.menu_item_id && JSON.stringify(c.customizations) === JSON.stringify(item.customizations)
          );
          if (existing) {
            return {
              items: state.items.map((c) =>
                c.menu_item_id === item.menu_item_id && JSON.stringify(c.customizations) === JSON.stringify(item.customizations)
                  ? { ...c, quantity: c.quantity + item.quantity }
                  : c
              ),
              storeId,
            };
          }
          return { items: [...state.items, item], storeId };
        }),
      removeItem: (index) =>
        set((state) => ({
          items: state.items.filter((_, i) => i !== index),
        })),
      updateQuantity: (index, quantity) =>
        set((state) => ({
          items: state.items
            .map((item, i) => (i === index ? { ...item, quantity: Math.max(0, quantity) } : item))
            .filter((item) => item.quantity > 0),
        })),
      clearCart: () => set({ items: [], storeId: null }),
      getTotal: () => get().items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      getItemCount: () => get().items.reduce((sum, item) => sum + item.quantity, 0),
    }),
    {
      name: 'loka-cart',
    }
  )
);
