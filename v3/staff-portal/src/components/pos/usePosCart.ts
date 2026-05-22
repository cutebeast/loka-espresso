"use client";

import { useState, useCallback } from "react";
import type { MenuItem, CartItem, Customer } from "@/lib/api";

export interface HeldOrder {
  id: string;
  cart: CartItem[];
  tableId: number | null;
  customer: Customer | null;
  orderType: string;
  notes: string;
  createdAt: number;
  crewName: string;
}

export function usePosCart(storeId: number, crewName: string) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [modifierItem, setModifierItem] = useState<MenuItem | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<Record<number, number[]>>({});
  const [modifierQty, setModifierQty] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [tableId, setTableId] = useState<number | null>(null);
  const [orderType, setOrderType] = useState<string>("dine_in");
  const [orderNotes, setOrderNotes] = useState("");
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([]);
  const [showHeld, setShowHeld] = useState(false);

  const addToCart = useCallback((item: MenuItem, modifiers: Record<number, number[]> = {}, modifierLabel = "", qty = 1) => {
    const modPrice = Object.values(modifiers).flat().reduce((sum, modId) => {
      for (const g of item.modifier_groups || []) {
        const m = g.options.find((x) => x.id === modId);
        if (m) return sum + m.price_adjustment;
      }
      return sum;
    }, 0);

    const modifierIds = Object.values(modifiers).flat().sort((a, b) => a - b);
    setCart((prev) => {
      const existing = prev.find(
        (c) => c.menu_item_id === item.id &&
        JSON.stringify([...c.modifier_ids].sort((a, b) => a - b)) === JSON.stringify(modifierIds)
      );
      if (existing) {
        return prev.map((c) =>
          c.menu_item_id === item.id &&
          JSON.stringify([...c.modifier_ids].sort((a, b) => a - b)) === JSON.stringify(modifierIds)
            ? { ...c, qty: c.qty + qty }
            : c
        );
      }
      return [...prev, {
        menu_item_id: item.id,
        name: item.item_name,
        qty,
        price: item.base_price + modPrice,
        modifier_ids: modifierIds,
        modifiers_label: modifierLabel,
      }];
    });
  }, []);

  const handleItemClick = useCallback((item: MenuItem) => {
    if (item.modifier_groups && item.modifier_groups.length > 0) {
      setModifierItem(item);
      setSelectedModifiers({});
      setModifierQty(1);
    } else {
      addToCart(item);
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20);
    }
  }, [addToCart]);

  const applyModifiers = useCallback(() => {
    if (!modifierItem) return;
    const label = Object.entries(selectedModifiers)
      .flatMap(([groupId, modIds]) => {
        const group = modifierItem.modifier_groups?.find((g) => g.id === Number(groupId));
        return modIds.map((id) => group?.options.find((m) => m.id === id)?.option_name).filter(Boolean);
      })
      .join(", ");
    addToCart(modifierItem, selectedModifiers, label, modifierQty);
    setModifierItem(null);
    setModifierQty(1);
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20);
  }, [modifierItem, selectedModifiers, modifierQty, addToCart]);

  const removeFromCart = useCallback((menu_item_id: number, modifier_ids: number[]) => {
    const sorted = [...modifier_ids].sort((a, b) => a - b);
    setCart((prev) => prev.filter(
      (c) => !(c.menu_item_id === menu_item_id && JSON.stringify([...c.modifier_ids].sort((a, b) => a - b)) === JSON.stringify(sorted))
    ));
  }, []);

  const updateQty = useCallback((menu_item_id: number, modifier_ids: number[], delta: number) => {
    const sorted = [...modifier_ids].sort((a, b) => a - b);
    setCart((prev) => prev.map((c) => {
      if (c.menu_item_id !== menu_item_id || JSON.stringify([...c.modifier_ids].sort((a, b) => a - b)) !== JSON.stringify(sorted))
        return c;
      const newQty = Math.max(0, c.qty + delta);
      return newQty === 0 ? null : { ...c, qty: newQty };
    }).filter(Boolean) as CartItem[]);
  }, []);

  const holdOrder = useCallback(() => {
    if (cart.length === 0) return;
    const held: HeldOrder = {
      id: `held_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      cart: [...cart],
      tableId,
      customer: selectedCustomer,
      orderType,
      notes: orderNotes,
      createdAt: Date.now(),
      crewName,
    };
    setHeldOrders((prev) => {
      const updated = [...prev.filter((h) => Date.now() - h.createdAt < 2 * 60 * 60 * 1000), held];
      localStorage.setItem("pos_held_orders", JSON.stringify(updated));
      return updated;
    });
    return held;
  }, [cart, tableId, selectedCustomer, orderType, orderNotes, crewName]);

  const recallOrder = useCallback((held: HeldOrder) => {
    setCart(held.cart);
    setTableId(held.tableId);
    setSelectedCustomer(held.customer);
    setOrderType(held.orderType);
    setOrderNotes(held.notes);
    setShowHeld(false);
  }, []);

  const newOrder = useCallback(() => {
    setCart([]);
    setSelectedCustomer(null);
    setTableId(null);
    setOrderType("dine_in");
    setOrderNotes("");
  }, []);

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

  return {
    cart, setCart,
    modifierItem, setModifierItem,
    selectedModifiers, setSelectedModifiers,
    modifierQty, setModifierQty,
    selectedCustomer, setSelectedCustomer,
    tableId, setTableId,
    orderType, setOrderType,
    orderNotes, setOrderNotes,
    heldOrders, setHeldOrders,
    showHeld, setShowHeld,
    addToCart,
    handleItemClick,
    applyModifiers,
    removeFromCart,
    updateQty,
    holdOrder,
    recallOrder,
    newOrder,
    subtotal,
  };
}
