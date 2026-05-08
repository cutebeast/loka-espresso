"use client";

import { useEffect, useState } from "react";
import { getInventoryMovements, type InventoryMovement } from "@/lib/api";

export default function InventoryMovementsPage() {
  const [items, setItems] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [movementTypeFilter, setMovementTypeFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const fetchData = () => {
    setLoading(true);
    getInventoryMovements({
      movement_type: movementTypeFilter || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
    })
      .then((data) => setItems(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, [movementTypeFilter, fromDate, toDate]);

  const typeClass = (type: string) => {
    switch (type) {
      case "in":
        return "bg-green-100 text-green-700";
      case "out":
        return "bg-red-100 text-red-700";
      case "adjustment":
        return "bg-blue-100 text-blue-700";
      case "waste":
        return "bg-orange-100 text-orange-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="p-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold">Inventory Movement Log</h1>
        <div className="flex flex-wrap gap-3">
          <select
            value={movementTypeFilter}
            onChange={(e) => setMovementTypeFilter(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="">All Types</option>
            <option value="in">In</option>
            <option value="out">Out</option>
            <option value="adjustment">Adjustment</option>
            <option value="waste">Waste</option>
          </select>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          />
        </div>
      </div>
      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Item</th>
              <th className="text-left px-4 py-3 font-semibold">Type</th>
              <th className="text-left px-4 py-3 font-semibold">Quantity</th>
              <th className="text-left px-4 py-3 font-semibold">Unit Cost</th>
              <th className="text-left px-4 py-3 font-semibold">Date</th>
              <th className="text-left px-4 py-3 font-semibold">Performed By</th>
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
                  No movements found.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-4 py-3">{item.item_name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${typeClass(item.movement_type)}`}>
                      {item.movement_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">{item.quantity}</td>
                  <td className="px-4 py-3">{item.unit_cost ? `RM ${item.unit_cost.toFixed(2)}` : "—"}</td>
                  <td className="px-4 py-3">{new Date(item.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3">{item.performed_by}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
