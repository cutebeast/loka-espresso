"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { api, Cart, CartItem } from "@/lib/api";

type CartContextType = {
  cart: Cart | null;
  loading: boolean;
  refreshCart: () => Promise<void>;
  addToCart: (menuItemId: string, quantity: number, storeId?: string) => Promise<void>;
  removeFromCart: (cartItemId: string) => Promise<void>;
  cartCount: number;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshCart = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get<Cart>("/cart");
      setCart(data);
    } catch {
      setCart(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const addToCart = useCallback(async (menuItemId: string, quantity: number, storeId?: string) => {
    await api.post("/cart/items", { menu_item_id: menuItemId, quantity, store_id: storeId });
    await refreshCart();
  }, [refreshCart]);

  const removeFromCart = useCallback(async (cartItemId: string) => {
    await api.del(`/cart/items/${cartItemId}`);
    await refreshCart();
  }, [refreshCart]);

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  const cartCount = cart?.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

  return (
    <CartContext.Provider value={{ cart, loading, refreshCart, addToCart, removeFromCart, cartCount }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
