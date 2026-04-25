import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { CartItem } from '@/lib/api';
import { idbStorage } from '@/lib/idbStorage';

interface CartState {
  items: CartItem[];
  storeId: number | null;
  orderNote: string;
  setOrderNote: (note: string) => void;
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
      orderNote: '',
      setOrderNote: (note) => set({ orderNote: note }),
      addItem: (item, storeId = null) =>
        set((state) => {
          const resolvedStoreId = storeId && storeId > 0 ? storeId : state.storeId;
          if (state.storeId && resolvedStoreId && state.storeId !== resolvedStoreId && state.items.length > 0) {
            return { items: [item], storeId: resolvedStoreId };
          }
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
              storeId: resolvedStoreId,
              items: state.items.map((c, i) =>
                i === existingIdx ? { ...c, quantity: c.quantity + item.quantity } : c
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
      clearCart: () => set({ items: [], storeId: null, orderNote: '' }),
      setStoreId: (storeId) => set({ storeId }),
      getTotal: () => get().items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      getItemCount: () => get().items.reduce((sum, item) => sum + item.quantity, 0),
    }),
    {
      name: 'loka-cart',
      storage: createJSONStorage(() => idbStorage),
    }
  )
);
