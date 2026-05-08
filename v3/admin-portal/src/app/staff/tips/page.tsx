"use client";

import { useEffect, useState } from "react";
import { getTipAllocations, type TipAllocation } from "@/lib/api";

export default function StaffTipsPage() {
  const [items, setItems] = useState<TipAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = () => {
    setLoading(true);
    getTipAllocations()
      .then((data) => setItems(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Tip Allocations</h1>
      </div>
      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Order</th>
              <th className="text-left px-4 py-3 font-semibold">Store</th>
              <th className="text-left px-4 py-3 font-semibold">Total Tip</th>
              <th className="text-left px-4 py-3 font-semibold">Method</th>
              <th className="text-left px-4 py-3 font-semibold">Distributed By</th>
              <th className="text-left px-4 py-3 font-semibold">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                  No tip allocations found.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-4 py-3 font-mono">{item.order_number}</td>
                  <td className="px-4 py-3">{item.store_name}</td>
                  <td className="px-4 py-3 font-medium">RM {item.total_tip.toFixed(2)}</td>
                  <td className="px-4 py-3">{item.method}</td>
                  <td className="px-4 py-3">{item.distributed_by}</td>
                  <td className="px-4 py-3">{new Date(item.created_at).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
