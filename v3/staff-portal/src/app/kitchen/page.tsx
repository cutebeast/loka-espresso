"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getOrders, getStores, updateOrderStatus, Order, OrderStatus, Store } from "@/lib/api";
import OrderCard from "@/components/OrderCard";
import { Filter, RefreshCw, Store as StoreIcon, CheckCircle2, ChefHat, PackageCheck, Check, Volume2, VolumeX } from "lucide-react";

const statusFilters: { label: string; value: OrderStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Preparing", value: "preparing" },
  { label: "Ready", value: "ready" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];

const nextStatusMap: Record<OrderStatus, { label: string; next: OrderStatus; icon: React.ReactNode } | null> = {
  pending: { label: "Confirm", next: "confirmed", icon: <CheckCircle2 size={12} /> },
  confirmed: { label: "Prepare", next: "preparing", icon: <ChefHat size={12} /> },
  preparing: { label: "Ready", next: "ready", icon: <PackageCheck size={12} /> },
  ready: { label: "Complete", next: "completed", icon: <Check size={12} /> },
  completed: null,
  cancelled: null,
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<number | undefined>(() => {
    if (typeof window !== "undefined") { const s = localStorage.getItem("staffStoreId"); if (s) return Number(s); }
    return undefined;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const prevCountRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const fetchStores = useCallback(async () => {
    try {
      const data = await getStores();
      setStores(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const data = await getOrders(storeId, filter === "all" ? undefined : filter);
      const list = Array.isArray(data) ? data : [];
      setOrders(list);
      // New order sound notification
      if (soundOn && list.length > prevCountRef.current) {
        try {
          if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
          const ctx = audioCtxRef.current;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.frequency.value = 800;
          osc.type = "sine";
          gain.gain.value = 0.1;
          osc.start(); osc.stop(ctx.currentTime + 0.15);
        } catch {}
      }
      prevCountRef.current = list.length;
      setError("");
    } catch (err: any) {
      setError(err.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [storeId, filter]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const handleUpdateStatus = async (id: string, status: OrderStatus) => {
    setUpdatingId(id);
    try {
      await updateOrderStatus(id, status);
      await fetchOrders();
    } catch (err: any) {
      setError(err.message || "Failed to update order");
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredOrders = filter === "all" ? orders : orders.filter((o) => o.status === filter);

  const counts = statusFilters.reduce((acc, s) => {
    acc[s.value] = s.value === "all" ? orders.length : orders.filter((o) => o.status === s.value).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Orders</h2>
          <button onClick={() => setSoundOn(!soundOn)} className="p-2 rounded-lg hover:bg-gray-100" title={soundOn ? "Mute sound" : "Unmute sound"}>
            {soundOn ? <Volume2 size={16} className="text-gray-500" /> : <VolumeX size={16} className="text-gray-400" />}
          </button>
          <button
          onClick={fetchOrders}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50 transition"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}

      <div className="flex items-center gap-2 mb-4">
        <StoreIcon size={16} className="text-gray-400" />
        <select
          value={storeId ?? ""}
          onChange={(e) => setStoreId(e.target.value ? Number(e.target.value) : undefined)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
        >
          <option value="">All Stores</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
        <Filter size={16} className="text-gray-400 shrink-0" />
        {statusFilters.map((s) => (
          <button
            key={s.value}
            onClick={() => setFilter(s.value)}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition ${
              filter === s.value
                ? "bg-slate-800 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {s.label} ({counts[s.value] ?? 0})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-500 text-sm">Loading orders...</div>
      ) : filteredOrders.length === 0 ? (
        <div className="text-gray-400 text-sm">No orders found.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredOrders.map((order) => {
            const nextAction = nextStatusMap[order.status];
            return (
              <div key={order.id} className="relative">
                <OrderCard order={order} />
                {nextAction && (
                  <div className="absolute top-2 right-2">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleUpdateStatus(order.id, nextAction.next);
                      }}
                      disabled={updatingId === order.id}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 shadow-sm"
                    >
                      {updatingId === order.id ? "..." : nextAction.icon}
                      <span className="hidden sm:inline">{nextAction.label}</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
