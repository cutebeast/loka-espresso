"use client";

import { useEffect, useState } from "react";
import { api, MenuItem } from "@/lib/api";
import { Search, UtensilsCrossed } from "lucide-react";

export default function MenuPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const fetchMenu = async () => {
    try {
      const data = await api.get<MenuItem[]>("/admin/menu/items");
      setItems(Array.isArray(data) ? data : []);
      setError("");
    } catch (err: any) {
      setError(err.message || "Failed to load menu");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMenu();
  }, []);

  const filtered = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    (item.category && item.category.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-6">Menu Reference</h2>

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}

      <div className="relative mb-6 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search menu items..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-slate-500 text-sm"
        />
      </div>

      {loading ? (
        <div className="text-gray-500 text-sm">Loading menu...</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-400 text-sm">No menu items found.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((item) => (
            <div
              key={item.id}
              className={`bg-white rounded-lg border p-4 transition ${
                item.is_available ? "border-gray-200" : "border-gray-200 opacity-60"
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="p-2 bg-gray-100 rounded-md">
                  <UtensilsCrossed size={16} className="text-gray-500" />
                </div>
                <span className="text-sm font-semibold">RM {item.price.toFixed(2)}</span>
              </div>
              <h3 className="font-medium text-sm mb-1">{item.name}</h3>
              {item.description && (
                <p className="text-xs text-gray-500 mb-2 line-clamp-2">{item.description}</p>
              )}
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">{item.category || "Uncategorized"}</span>
                {!item.is_available && (
                  <span className="text-red-600 font-medium">Unavailable</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
