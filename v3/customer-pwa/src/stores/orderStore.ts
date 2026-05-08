import { create } from 'zustand';
import type { Order } from '@/lib/api';

interface OrderState {
  orders: Order[];
  currentOrder: Order | null;
  isLoading: boolean;
  setOrders: (orders: Order[]) => void;
  setCurrentOrder: (order: Order | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  addOrder: (order: Order) => void;
  updateOrder: (id: number, updates: Partial<Order>) => void;
  resetAll: () => void;
}

export const useOrderStore = create<OrderState>((set) => ({
  orders: [],
  currentOrder: null,
  isLoading: false,
  setOrders: (orders) => set({ orders }),
  setCurrentOrder: (currentOrder) => set({ currentOrder }),
  setIsLoading: (isLoading) => set({ isLoading }),
  addOrder: (order) => set((state) => ({ orders: [order, ...state.orders] })),
  updateOrder: (id, updates) =>
    set((state) => ({
      orders: state.orders.map((o) => (o.id === id ? { ...o, ...updates } : o)),
      currentOrder: state.currentOrder?.id === id ? { ...state.currentOrder, ...updates } : state.currentOrder,
    })),
  resetAll: () => set({ orders: [], currentOrder: null }),
}));
