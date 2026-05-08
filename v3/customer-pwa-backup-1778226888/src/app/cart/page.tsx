"use client";

import { useCart } from "@/contexts/CartContext";
import QuantitySelector from "@/components/QuantitySelector";
import { Trash2 } from "lucide-react";
import Link from "next/link";

export default function CartPage() {
  const { cart, removeFromCart, addToCart, loading } = useCart();

  if (loading && !cart) {
    return (
      <div className="px-4 pt-6 space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="bg-white rounded-2xl h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  const items = cart?.items || [];

  return (
    <div className="px-4 pt-6 pb-4">
      <h1 className="text-xl font-bold text-gray-900 mb-4">Your Cart</h1>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <span className="text-4xl mb-3">🛒</span>
          <p className="text-sm">Your cart is empty</p>
          <Link href="/stores" className="mt-4 text-amber-600 text-sm font-semibold">
            Browse stores
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3">
                <div className="w-16 h-16 bg-gray-200 rounded-xl shrink-0 overflow-hidden">
                  {item.menu_item?.image_url ? (
                    <img src={item.menu_item.image_url} alt={item.menu_item.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50">
                      <span className="text-lg">🍲</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-gray-900 text-sm truncate">{item.menu_item?.name || "Item"}</h4>
                  <p className="text-amber-600 font-bold text-sm mt-0.5">${item.total_price.toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <QuantitySelector
                    quantity={item.quantity}
                    onIncrease={() => addToCart(item.menu_item_id, 1, cart?.store_id)}
                    onDecrease={() => {
                      if (item.quantity <= 1) {
                        removeFromCart(item.id);
                      } else {
                        addToCart(item.menu_item_id, -1, cart?.store_id);
                      }
                    }}
                  />
                  <button
                    onClick={() => removeFromCart(item.id)}
                    className="ml-1 text-gray-400 active:text-red-500"
                    aria-label="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl p-4 mt-4 shadow-sm border border-gray-100">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>Subtotal</span>
              <span>${cart?.total_amount.toFixed(2) || "0.00"}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>Tax</span>
              <span>${((cart?.total_amount || 0) * 0.1).toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900 text-base mt-2 pt-2 border-t border-gray-100">
              <span>Total</span>
              <span>${((cart?.total_amount || 0) * 1.1).toFixed(2)}</span>
            </div>
          </div>

          <Link
            href="/checkout"
            className="block w-full py-3.5 rounded-xl bg-amber-500 text-white font-semibold text-sm shadow-lg text-center mt-4 active:scale-[0.98] transition-transform"
          >
            Checkout
          </Link>
        </>
      )}
    </div>
  );
}
