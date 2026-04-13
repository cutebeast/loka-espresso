"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { Store, Cart, OrderMode } from "./types";
import * as api from "./api";

interface AppContextValue {
  selectedStore: Store | null;
  setSelectedStore: (store: Store | null) => void;
  selectedTable: string | null;
  setSelectedTable: (table: string | null) => void;
  orderMode: OrderMode;
  setOrderMode: (mode: OrderMode) => void;
  cart: Cart | null;
  refreshCart: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [orderMode, setOrderMode] = useState<OrderMode>("dine_in");
  const [cart, setCart] = useState<Cart | null>(null);

  const refreshCart = useCallback(async () => {
    try {
      const data = await api.cart.getCart();
      setCart(data);
    } catch {
      setCart(null);
    }
  }, []);

  return (
    <AppContext.Provider
      value={{
        selectedStore,
        setSelectedStore,
        selectedTable,
        setSelectedTable,
        orderMode,
        setOrderMode,
        cart,
        refreshCart,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return ctx;
}
