"use client";

import { useCart } from "@/contexts/CartContext";

export default function CartBadge() {
  const { cartCount } = useCart();
  if (cartCount === 0) return null;
  return (
    <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
      {cartCount > 99 ? "99+" : cartCount}
    </span>
  );
}
