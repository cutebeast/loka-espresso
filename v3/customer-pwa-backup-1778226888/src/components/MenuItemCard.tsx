"use client";

import { Plus } from "lucide-react";
import { MenuItem } from "@/lib/api";
import { useCart } from "@/contexts/CartContext";

export default function MenuItemCard({ item, storeId }: { item: MenuItem; storeId: string }) {
  const { addToCart } = useCart();

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex">
      <div className="w-28 h-28 bg-gray-200 shrink-0">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50">
            <span className="text-2xl">🍲</span>
          </div>
        )}
      </div>
      <div className="flex-1 p-3 flex flex-col justify-between">
        <div>
          <h4 className="font-semibold text-gray-900 text-sm leading-tight">{item.name}</h4>
          {item.description && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description}</p>
          )}
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="font-bold text-amber-600 text-sm">${item.price.toFixed(2)}</span>
          <button
            onClick={() => addToCart(item.id, 1, storeId)}
            className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-md active:scale-90 transition-transform"
            aria-label="Add to cart"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
