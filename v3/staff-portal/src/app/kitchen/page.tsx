"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getOrders, updateOrderStatus, Order, OrderStatus } from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import OrderCard from "@/components/OrderCard";
import PageHeader from "@/components/PageHeader";
import Alert from "@/components/Alert";
import EmptyState from "@/components/EmptyState";
import SearchInput from "@/components/SearchInput";
import SkeletonCard from "@/components/SkeletonCard";
import {
  Filter, RefreshCw, Volume2, VolumeX, LayoutGrid, List,
  UtensilsCrossed, Package, Truck, Wifi, WifiOff, ChefHat
} from "lucide-react";

const statusFilters: { label: string; value: OrderStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Preparing", value: "preparing" },
  { label: "Ready", value: "ready_for_pickup" },
  { label: "Delivered", value: "delivered" },
];

const kanbanColumns: { status: OrderStatus; label: string; color: string }[] = [
  { status: "pending", label: "Pending", color: "#D97706" },
  { status: "confirmed", label: "Confirmed", color: "#2563EB" },
  { status: "preparing", label: "Preparing", color: "#9B6625" },
  { status: "ready_for_pickup", label: "Ready", color: "#16A34A" },
  { status: "delivered", label: "Delivered", color: "#6B7280" },
];

export default function KitchenPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const storeId = Number(typeof window !== "undefined" ? localStorage.getItem("staffStoreId") || "0" : "0");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"oldest" | "newest" | "value">("oldest");
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [_updatingId, setUpdatingId] = useState<string | number | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [connected, setConnected] = useState(true);
  const prevCountRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchSeqRef = useRef(0);

  const fetchOrders = useCallback(async () => {
    try {
      if (!storeId) { setLoading(false); setError("Store not selected"); return; }
      const data = await getOrders(storeId, undefined);
      const list = Array.isArray(data) ? data : [];
      setOrders(list);
      setConnected(true);
      // Sound notification on new orders
      if (soundOn && list.length > prevCountRef.current && audioCtxRef.current) {
        try {
          const ctx = audioCtxRef.current;
          if (ctx.state === "suspended") await ctx.resume();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.frequency.value = 800;
          osc.type = "sine";
          gain.gain.value = 0.1;
          osc.start(); osc.stop(ctx.currentTime + 0.15);
          osc.onended = () => { osc.disconnect(); gain.disconnect(); };
        } catch (err) { console.error("Audio notification failed:", err); }
      }
      prevCountRef.current = list.length;
      setError("");
    } catch (err: unknown) {
      console.error("Kitchen: Failed to load orders:", err);
      setConnected(false);
      setError(err instanceof Error ? err.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [storeId, soundOn]);

  usePolling(fetchOrders, [storeId, soundOn], { interval: 10000 });

  useEffect(() => {
    prevCountRef.current = 0;
    try {
      audioCtxRef.current = new (window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();
    } catch (e) { console.error("Failed to create AudioContext:", e); }
    return () => {
      if (audioTimerRef.current) clearTimeout(audioTimerRef.current);
      if (audioCtxRef.current) { audioCtxRef.current.close().catch((err) => console.error("AudioContext close failed:", err)); audioCtxRef.current = null; }
    };
  }, []);

  const handleUpdateStatus = async (id: string | number, status: OrderStatus) => {
    setUpdatingId(id);
    const seq = ++fetchSeqRef.current;
    try {
      await updateOrderStatus(id, status);
      if (seq !== fetchSeqRef.current) return;
      await fetchOrders();
    } catch (err: unknown) {
      if (seq !== fetchSeqRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to update order");
    } finally {
      if (seq === fetchSeqRef.current) setUpdatingId(null);
    }
  };

  const filteredOrders = useMemo(() => orders
    .filter((o) => {
      if (filter !== "all" && o.status !== filter) return false;
      if (typeFilter !== "all" && o.order_type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (o.order_number?.toLowerCase() || "").includes(q) ||
          (o.customer_name?.toLowerCase() || "").includes(q) ||
          (o.table_number?.toLowerCase() || "").includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (isNaN(ta) || isNaN(tb)) return 0;
      if (sort === "oldest") return ta - tb;
      if (sort === "newest") return tb - ta;
      if (sort === "value") return (b.total_amount ?? 0) - (a.total_amount ?? 0);
      return 0;
    }), [orders, filter, typeFilter, search, sort]);

  const counts = statusFilters.reduce((acc, s) => {
    acc[s.value] = s.value === "all" ? orders.length : orders.filter((o) => o.status === s.value).length;
    return acc;
  }, {} as Record<string, number>);

  const activeOrders = filteredOrders.filter((o) => o.status !== "delivered" && o.status !== "out_for_delivery" && !o.status.includes("cancelled"));

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <PageHeader
        title="Kitchen Display"
        subtitle={`${activeOrders.length} active orders`}
       
        action={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => setSoundOn(!soundOn)}
              className="btn btn-ghost btn-icon"
              title={soundOn ? "Mute sound" : "Unmute sound"}
              aria-label={soundOn ? "Mute notifications" : "Unmute notifications"}
            >
              {soundOn ? <Volume2 size={16} className="text-gray-500" /> : <VolumeX size={16} className="text-gray-400" />}
            </button>
            <button
              onClick={fetchOrders}
              className="btn btn-ghost btn-sm"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>
        }
      />

      {error && <Alert variant="error" onDismiss={() => setError("")} autoDismiss={5000}>{error}</Alert>}

      {/* Connection & Controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {connected ? (
            <span className="badge badge-green badge-sm flex items-center gap-1"><Wifi size={10} /> Live</span>
          ) : (
            <span className="badge badge-red badge-sm flex items-center gap-1"><WifiOff size={10} /> Offline</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search order #, customer, table..." />
          <select className="form-input" style={{ width: 120 }} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort order">
            <option value="oldest">Oldest First</option>
            <option value="newest">Newest First</option>
            <option value="value">Highest Value</option>
          </select>
          <div style={{ display: "flex", border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
            <button className={`btn btn-sm ${view === "kanban" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("kanban")} style={{ borderRadius: 0, border: "none" }} aria-label="Grid view">
              <LayoutGrid size={14} />
            </button>
            <button className={`btn btn-sm ${view === "list" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("list")} style={{ borderRadius: 0, border: "none" }} aria-label="List view">
              <List size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Status Filters */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
        <Filter size={16} className="text-gray-400 shrink-0" />
        {statusFilters.map((s) => (
          <button
            key={s.value}
            onClick={() => setFilter(s.value)}
            className={`btn btn-sm ${filter === s.value ? "btn-primary" : "btn-ghost"}`}
          >
            {s.label} ({counts[s.value] ?? 0})
          </button>
        ))}
      </div>

      {/* Type Filters */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        {[
          { value: "all", label: "All Types", icon: null },
          { value: "dine_in", label: "Dine-in", icon: <UtensilsCrossed size={12} /> },
          { value: "takeaway", label: "Takeaway", icon: <Package size={12} /> },
          { value: "delivery", label: "Delivery", icon: <Truck size={12} /> },
        ].map((t) => (
          <button
            key={t.value}
            onClick={() => setTypeFilter(t.value)}
            className={`badge badge-sm flex items-center gap-1 cursor-pointer ${typeFilter === t.value ? "badge-primary" : "badge-outline"}`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonCard count={6} />
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          title="All caught up!"
          description="No orders match your filters."
          icon={<ChefHat size={48} />}
        />
      ) : view === "kanban" ? (
        /* ── Kanban View ── */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {kanbanColumns.map((col) => {
            const colOrders = filteredOrders.filter((o) => o.status === col.status);
            return (
              <div key={col.status} style={{ background: "var(--color-bg-muted)", borderRadius: "var(--radius-lg)", padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: col.color }}>{col.label}</h3>
                  <span className="badge badge-sm badge-outline">{colOrders.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {colOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      compact
                      onClick={(o) => router.push(`/kitchen/${o.id}`)}
                      onQuickAction={(o, status) => handleUpdateStatus(o.id, status)}
                    />
                  ))}
                  {colOrders.length === 0 && (
                    <div style={{ textAlign: "center", padding: 24, color: "var(--color-text-muted)", fontSize: 13 }}>
                      No {col.label.toLowerCase()} orders
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── List View ── */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
          {filteredOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onClick={(o) => router.push(`/kitchen/${o.id}`)}
              onQuickAction={(o, status) => handleUpdateStatus(o.id, status)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
