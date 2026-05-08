"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import StoreCard from "@/components/StoreCard";
import { api, Store } from "@/lib/api";

export default function StoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [filtered, setFiltered] = useState<Store[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Store[]>("/stores")
      .then((data) => {
        setStores(data || []);
        setFiltered(data || []);
      })
      .catch(() => {
        setStores([]);
        setFiltered([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const q = query.toLowerCase();
    setFiltered(stores.filter((s) => s.name.toLowerCase().includes(q) || (s.address || "").toLowerCase().includes(q)));
  }, [query, stores]);

  return (
    <div className="px-4 pt-6 pb-4">
      <h1 className="text-xl font-bold text-gray-900 mb-4">Discover Stores</h1>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search stores..."
          className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl h-64 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((store) => (
            <StoreCard key={store.id} store={store} />
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-gray-400 py-12 text-sm">No stores found</div>
          )}
        </div>
      )}
    </div>
  );
}
