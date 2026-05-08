"use client";

import { Minus, Plus } from "lucide-react";

export default function QuantitySelector({
  quantity,
  onIncrease,
  onDecrease,
}: {
  quantity: number;
  onIncrease: () => void;
  onDecrease: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onDecrease}
        className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 active:bg-gray-100"
        aria-label="Decrease"
      >
        <Minus className="w-3 h-3" />
      </button>
      <span className="text-sm font-semibold w-5 text-center">{quantity}</span>
      <button
        onClick={onIncrease}
        className="w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-sm active:bg-amber-600"
        aria-label="Increase"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
}
