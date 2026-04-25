import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { CartItem } from '@/lib/api';
import { idbStorage } from '@/lib/idbStorage';

interface CartState {
  items: CartItem[];
  orderNote: string;
  setOrderNote: (note: string) => void;
  addItem: (item: CartItem) => void;
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
      orderNote: '',
      setOrderNote: (note) => set({ orderNote: note }),
      addItem: (item) =>
        set((state) => {
          const optIds = (c: CartItem) => {
            if (c.customization_option_ids && Array.isArray(c.customization_option_ids)) {
              return JSON.stringify([...c.customization_option_ids].sort());
            }
            return JSON.stringify(c.customizations ?? null);
          };
          const itemKey = `${item.menu_item_id}:${optIds(item)}`;
          const existingIdx = state.items.findIndex(
            (c) => `${c.menu_item_id}:${optIds(c)}` === itemKey
          );
          if (existingIdx >= 0) {
            return {
              items: state.items.map((c, i) =>
                i === existingIdx ? { ...c, quantity: c.quantity + item.quantity } : c
              ),
            };
          }
          return { items: [...state.items, item] };
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
      clearCart: () => set({ items: [], orderNote: '' }),
      getTotal: () => get().items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      getItemCount: () => get().items.reduce((sum, item) => sum + item.quantity, 0),
    }),
    {
      name: 'loka-cart',
      storage: createJSONStorage(() => idbStorage),
    }
  )
);
