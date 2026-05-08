"use client";

import { useEffect, useState, useCallback } from "react";
import { getTables, getStores, Table, Store, Order, getOrders } from "@/lib/api";
import TableGrid from "@/components/TableGrid";
import StatusBadge from "@/components/StatusBadge";
import { RefreshCw, Store as StoreIcon, X, ShoppingBag, CalendarCheck, User, Clock } from "lucide-react";

export default function TablesPage() {
  const [tables, setTables] = useState<Table[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<number>(2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [tableOrders, setTableOrders] = useState<Order[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchStores = useCallback(async () => {
    try {
      const data = await getStores();
      setStores(Array.isArray(data) ? data : []);
      const physical = Array.isArray(data) ? data.find((s) => s.type === "physical" || s.id === 2) : undefined;
      if (physical) setStoreId(physical.id);
    } catch {
      // ignore
    }
  }, []);

  const fetchTables = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTables(storeId);
      setTables(Array.isArray(data) ? data : []);
      setError("");
    } catch (err: any) {
      setError(err.message || "Failed to load tables");
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  const handleTableClick = async (table: Table) => {
    setSelectedTable(table);
    if (table.current_order_id || table.status !== "available") {
      setDetailLoading(true);
      try {
        const orders = await getOrders(storeId);
        const relevant = Array.isArray(orders)
          ? orders.filter(
              (o) =>
                o.table_number === table.number ||
                (table.current_order_id && o.id === table.current_order_id)
            )
          : [];
        setTableOrders(relevant);
      } catch {
        setTableOrders([]);
      } finally {
        setDetailLoading(false);
      }
    } else {
      setTableOrders([]);
    }
  };

  const available = tables.filter((t) => t.status === "available").length;
  const occupied = tables.filter((t) => t.status === "occupied").length;
  const reserved = tables.filter((t) => t.status === "reserved").length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Table Management</h2>
        <button
          onClick={fetchTables}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50 transition"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}

      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <StoreIcon size={16} className="text-gray-400" />
          <select
            value={storeId}
            onChange={(e) => setStoreId(Number(e.target.value))}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            {stores.length === 0 && <option value={2}>Store 2</option>}
          </select>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="w-3 h-3 rounded-full bg-green-400" />
          <span className="text-gray-600">Available ({available})</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="w-3 h-3 rounded-full bg-red-400" />
          <span className="text-gray-600">Occupied ({occupied})</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="w-3 h-3 rounded-full bg-amber-400" />
          <span className="text-gray-600">Reserved ({reserved})</span>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-500 text-sm">Loading tables...</div>
      ) : (
        <TableGrid tables={tables} onTableClick={handleTableClick} />
      )}

      {selectedTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg border border-gray-200 shadow-lg w-full max-w-lg max-h-[80vh] overflow-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold">Table {selectedTable.number}</h3>
                <p className="text-sm text-gray-500">{selectedTable.seats} seats</p>
              </div>
              <button
                onClick={() => setSelectedTable(null)}
                className="p-1 rounded hover:bg-gray-100 transition"
              >
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-center gap-2 mb-4">
                <StatusBadge status={selectedTable.status} />
              </div>

              {detailLoading ? (
                <div className="text-sm text-gray-500">Loading details...</div>
              ) : tableOrders.length > 0 ? (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Active Orders</h4>
                  {tableOrders.map((order) => (
                    <div key={order.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <ShoppingBag size={14} className="text-gray-500" />
                          <span className="font-medium text-sm">{order.order_number}</span>
                        </div>
                        <StatusBadge status={order.status} />
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {new Date(order.created_at).toLocaleTimeString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <User size={12} />
                          {order.customer_name || "Walk-in"}
                        </span>
                      </div>
                      <div className="mt-2 text-sm font-semibold">RM {order.total.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              ) : selectedTable.status === "reserved" ? (
                <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 p-3 rounded">
                  <CalendarCheck size={14} />
                  This table is reserved. No active orders yet.
                </div>
              ) : (
                <div className="text-sm text-gray-500">No active orders for this table.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
