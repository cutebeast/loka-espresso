"use client";

import { useEffect, useState } from "react";
import { api, InventoryItem } from "@/lib/api";
import { Search, AlertTriangle, Package } from "lucide-react";

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const fetchInventory = async () => {
    try {
      // Using admin inventory endpoint pattern
      const data = await api.get<InventoryItem[]>("/admin/inventory/items");
      setItems(Array.isArray(data) ? data : []);
      setError("");
    } catch (err: any) {
      setError(err.message || "Failed to load inventory");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  const filtered = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    (item.category && item.category.toLowerCase().includes(search.toLowerCase()))
  );

  const lowStockCount = items.filter((item) => item.quantity <= item.low_stock_threshold).length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Inventory</h2>
        {lowStockCount > 0 && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-1.5 rounded">
            <AlertTriangle size={14} />
            {lowStockCount} item{lowStockCount > 1 ? "s" : ""} low on stock
          </div>
        )}
      </div>

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}

      <div className="relative mb-6 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search inventory..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-slate-500 text-sm"
        />
      </div>

      {loading ? (
        <div className="text-gray-500 text-sm">Loading inventory...</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-400 text-sm">No inventory items found.</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Item</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Category</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Stock</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Threshold</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((item) => {
                const isLow = item.quantity <= item.low_stock_threshold;
                return (
                  <tr key={item.id} className={isLow ? "bg-red-50" : ""}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Package size={14} className="text-gray-400" />
                        <span className="font-medium">{item.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{item.category || "—"}</td>
                    <td className="px-4 py-3 text-right font-medium">{item.quantity}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{item.low_stock_threshold}</td>
                    <td className="px-4 py-3">
                      {isLow ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
                          <AlertTriangle size={12} />
                          Low Stock
                        </span>
                      ) : (
                        <span className="text-xs text-green-700 font-medium">OK</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
