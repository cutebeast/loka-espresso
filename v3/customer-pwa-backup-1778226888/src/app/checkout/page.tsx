"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, UtensilsCrossed, Package, Bike, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useCart } from "@/contexts/CartContext";

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, refreshCart } = useCart();
  const [orderType, setOrderType] = useState<"dine_in" | "takeaway" | "delivery">("dine_in");
  const [tableNumber, setTableNumber] = useState("");
  const [instructions, setInstructions] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"card" | "cash">("card");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const items = cart?.items || [];
  const subtotal = cart?.total_amount || 0;
  const tax = subtotal * 0.1;
  const total = subtotal + tax;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!cart?.store_id) {
      setError("No store selected");
      return;
    }
    setLoading(true);
    try {
      const order = await api.post<{ id: string }>("/orders", {
        store_id: cart.store_id,
        order_type: orderType,
        table_number: orderType === "dine_in" ? tableNumber : undefined,
        special_instructions: instructions || undefined,
        payment_method: paymentMethod,
      });
      await refreshCart();
      router.push(`/orders/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order failed");
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="px-4 pt-6 text-center">
        <span className="text-4xl">🛒</span>
        <p className="text-gray-400 text-sm mt-3">Your cart is empty</p>
        <Link href="/stores" className="text-amber-600 text-sm font-semibold mt-2 inline-block">
          Browse stores
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-6">
      <Link href="/cart" className="inline-flex items-center text-sm text-gray-500 mb-4">
        <ChevronLeft className="w-4 h-4" />
        Back to cart
      </Link>
      <h1 className="text-xl font-bold text-gray-900 mb-4">Checkout</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Order Type</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: "dine_in", label: "Dine In", icon: UtensilsCrossed },
              { key: "takeaway", label: "Takeaway", icon: Package },
              { key: "delivery", label: "Delivery", icon: Bike },
            ].map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setOrderType(opt.key as typeof orderType)}
                className={`flex flex-col items-center gap-1 py-3 rounded-xl border text-sm font-medium transition-colors ${
                  orderType === opt.key
                    ? "bg-amber-50 border-amber-500 text-amber-700"
                    : "bg-white border-gray-200 text-gray-600"
                }`}
              >
                <opt.icon className="w-5 h-5" />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {orderType === "dine_in" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Table Number</label>
            <input
              type="text"
              required={orderType === "dine_in"}
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="e.g. A12"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Special Instructions</label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
            rows={3}
            placeholder="Allergies, preferences..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
          <div className="flex gap-2">
            {[
              { key: "card", label: "Card", icon: CreditCard },
              { key: "cash", label: "Cash", icon: Package },
            ].map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setPaymentMethod(opt.key as typeof paymentMethod)}
                className={`flex items-center gap-2 flex-1 py-3 rounded-xl border text-sm font-medium transition-colors justify-center ${
                  paymentMethod === opt.key
                    ? "bg-amber-50 border-amber-500 text-amber-700"
                    : "bg-white border-gray-200 text-gray-600"
                }`}
              >
                <opt.icon className="w-4 h-4" />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Tax</span>
            <span>${tax.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-bold text-gray-900 text-base mt-2 pt-2 border-t border-gray-100">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 rounded-xl bg-amber-500 text-white font-semibold text-sm shadow-lg active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          {loading ? "Placing order..." : `Place Order • $${total.toFixed(2)}`}
        </button>
      </form>
    </div>
  );
}
