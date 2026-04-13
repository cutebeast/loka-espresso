"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store";
import * as api from "@/lib/api";
import type { PickupSlot } from "@/lib/types";

export default function CartPage() {
  const router = useRouter();
  const { cart, orderMode, setOrderMode, selectedStore, refreshCart } = useApp();
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoError, setPromoError] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [pickupSlots, setPickupSlots] = useState<PickupSlot[]>([]);

  async function loadPickupSlots() {
    if (!selectedStore) return;
    try {
      const slots = await api.stores.getPickupSlots(selectedStore.id);
      setPickupSlots(slots);
    } catch {
      setPickupSlots([]);
    }
  }

  async function handleApplyPromo() {
    setPromoError("");
    try {
      await api.vouchers.validateVoucher(promoCode);
      setPromoApplied(true);
    } catch {
      setPromoError("Invalid promo code");
      setPromoApplied(false);
    }
  }

  async function handleUpdateQuantity(itemId: string, quantity: number) {
    try {
      if (quantity <= 0) {
        await api.cart.removeCartItem(itemId);
      } else {
        await api.cart.updateCartItem(itemId, quantity);
      }
      await refreshCart();
    } catch {
      // handle error
    }
  }

  async function handlePlaceOrder() {
    if (!selectedStore) return;
    setLoading(true);
    try {
      await api.orders.createOrder({
        storeId: selectedStore.id,
        orderMode,
        pickupSlotId: orderMode === "pickup" ? selectedSlot : undefined,
        deliveryAddress: orderMode === "delivery" ? address : undefined,
        voucherCode: promoApplied ? promoCode : undefined,
        paymentMethod: "wallet",
      });
      await refreshCart();
      router.push("/orders");
    } catch {
      // handle error
    } finally {
      setLoading(false);
    }
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 px-6 text-center">
        <i className="fa-solid fa-bag-shopping text-5xl text-gray-300 mb-4" />
        <h2 className="text-lg font-bold mb-2">Your Cart is Empty</h2>
        <p className="text-sm text-gray-500 mb-4">
          Add items from the menu to get started
        </p>
        <button
          className="btn btn-primary"
          onClick={() => router.push("/menu")}
        >
          Browse Menu
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="flex gap-2">
        {(["dine_in", "pickup", "delivery"] as const).map((mode) => (
          <button
            key={mode}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
              orderMode === mode
                ? "bg-[var(--color-navy)] text-white"
                : "bg-white text-gray-600 border border-gray-200"
            }`}
            onClick={() => {
              setOrderMode(mode);
              if (mode === "pickup") loadPickupSlots();
            }}
          >
            {mode === "dine_in" ? "Dine In" : mode === "pickup" ? "Pickup" : "Delivery"}
          </button>
        ))}
      </div>

      {orderMode === "pickup" && (
        <div className="card">
          <label className="text-sm font-semibold mb-2 block">Pickup Time</label>
          {pickupSlots.length === 0 ? (
            <button className="btn w-full justify-center" onClick={loadPickupSlots}>
              Load Pickup Times
            </button>
          ) : (
            <div className="flex flex-wrap gap-2">
              {pickupSlots.filter((s) => s.isAvailable).map((slot) => (
                <button
                  key={slot.id}
                  className={`px-3 py-2 rounded-xl text-sm ${
                    selectedSlot === slot.id
                      ? "bg-[var(--color-navy)] text-white"
                      : "bg-[var(--color-bg)] text-gray-700"
                  }`}
                  onClick={() => setSelectedSlot(slot.id)}
                >
                  {new Date(slot.startTime).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {orderMode === "delivery" && (
        <div className="card">
          <label className="text-sm font-semibold mb-2 block">Delivery Address</label>
          <input
            placeholder="Enter delivery address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>
      )}

      <div className="space-y-3">
        {cart.items.map((item) => (
          <div key={item.id} className="card flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[var(--color-bg)] flex items-center justify-center flex-shrink-0">
              <i className="fa-solid fa-utensils text-gray-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{item.menuItem.name}</div>
              <div className="text-xs text-gray-500">
                R{item.totalPrice.toFixed(2)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center"
                onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
              >
                <i className="fa-solid fa-minus text-[10px]" />
              </button>
              <span className="text-sm font-bold w-5 text-center">{item.quantity}</span>
              <button
                className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center"
                onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
              >
                <i className="fa-solid fa-plus text-[10px]" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="flex gap-2">
          <input
            placeholder="Promo code"
            value={promoCode}
            onChange={(e) => {
              setPromoCode(e.target.value);
              setPromoApplied(false);
              setPromoError("");
            }}
            className="flex-1"
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={handleApplyPromo}
            disabled={!promoCode || promoApplied}
          >
            {promoApplied ? "Applied" : "Apply"}
          </button>
        </div>
        {promoError && (
          <div className="text-red-500 text-xs mt-2">{promoError}</div>
        )}
        {promoApplied && (
          <div className="text-green-600 text-xs mt-2">
            <i className="fa-solid fa-check mr-1" /> Promo applied
          </div>
        )}
      </div>

      <div className="card space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Subtotal</span>
          <span>R{cart.subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Service Fee</span>
          <span>R{cart.serviceFee.toFixed(2)}</span>
        </div>
        {orderMode === "delivery" && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Delivery Fee</span>
            <span>R{cart.deliveryFee.toFixed(2)}</span>
          </div>
        )}
        <div className="border-t border-gray-100 pt-2 flex justify-between font-bold">
          <span>Total</span>
          <span className="text-[var(--color-navy)]">R{cart.total.toFixed(2)}</span>
        </div>
      </div>

      <button
        className="btn btn-primary w-full py-3 text-base justify-center"
        onClick={handlePlaceOrder}
        disabled={loading}
      >
        {loading ? "Placing Order..." : `Place Order - R${cart.total.toFixed(2)}`}
      </button>
    </div>
  );
}
