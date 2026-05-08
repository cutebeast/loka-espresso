"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ChevronLeft, Clock, MapPin, Phone } from "lucide-react";
import Link from "next/link";
import MenuItemCard from "@/components/MenuItemCard";
import { api, Store, MenuCategory, MenuItem } from "@/lib/api";

export default function MenuPage() {
  const { id } = useParams() as { id: string };
  const [store, setStore] = useState<Store | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [s, cats] = await Promise.all([
          api.get<Store>(`/stores/${id}`),
          api.get<MenuCategory[]>(`/menu/categories?store_id=${id}`),
        ]);
        setStore(s);
        setCategories(cats || []);
        if (cats && cats.length > 0) {
          setActiveCategory(cats[0].id);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  useEffect(() => {
    if (!activeCategory) return;
    api.get<MenuItem[]>(`/menu/items?store_id=${id}&category_id=${activeCategory}`)
      .then((data) => setItems(data || []))
      .catch(() => setItems([]));
  }, [activeCategory, id]);

  if (loading) {
    return (
      <div className="px-4 pt-4 space-y-4">
        <div className="h-8 bg-gray-200 rounded-lg w-1/3 animate-pulse" />
        <div className="h-10 bg-gray-200 rounded-lg animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl h-28 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-white px-4 pt-4 pb-3 shadow-sm">
        <Link href="/stores" className="inline-flex items-center text-sm text-gray-500 mb-2">
          <ChevronLeft className="w-4 h-4" />
          Back
        </Link>
        <h1 className="text-xl font-bold text-gray-900">{store?.name || "Store"}</h1>
        <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {store?.address || "Nearby"}</span>
          <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {store?.phone || "-"}</span>
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Open</span>
        </div>
      </div>

      <div className="sticky top-0 z-30 bg-gray-50 px-4 py-3 border-b border-gray-200">
        <div className="flex gap-2 overflow-x-auto hide-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeCategory === cat.id
                  ? "bg-amber-500 text-white shadow-sm"
                  : "bg-white text-gray-600 border border-gray-200"
              }`}
            >
              {cat.name}
            </button>
          ))}
          {categories.length === 0 && (
            <span className="text-sm text-gray-400">No categories</span>
          )}
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">
        {items.map((item) => (
          <MenuItemCard key={item.id} item={item} storeId={id} />
        ))}
        {items.length === 0 && (
          <div className="text-center text-gray-400 py-12 text-sm">No items in this category</div>
        )}
      </div>
    </div>
  );
}
