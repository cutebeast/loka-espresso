"use client";

import { MapPin, Star } from "lucide-react";
import Link from "next/link";
import { Store } from "@/lib/api";

export default function StoreCard({ store }: { store: Store }) {
  return (
    <Link
      href={`/stores/${store.id}/menu`}
      className="block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden active:scale-[0.98] transition-transform"
    >
      <div className="h-40 bg-gray-200 relative">
        {store.image_url ? (
          <img src={store.image_url} alt={store.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-100 to-orange-100">
            <span className="text-4xl">🍽️</span>
          </div>
        )}
        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg flex items-center gap-1 text-xs font-semibold shadow-sm">
          <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
          4.5
        </div>
      </div>
      <div className="p-4">
        <h3 className="font-bold text-gray-900 text-lg">{store.name}</h3>
        {store.description && (
          <p className="text-sm text-gray-500 mt-1 line-clamp-2">{store.description}</p>
        )}
        <div className="flex items-center gap-1 text-gray-400 text-xs mt-2">
          <MapPin className="w-3 h-3" />
          <span className="line-clamp-1">{store.address || "Nearby"}</span>
        </div>
      </div>
    </Link>
  );
}
