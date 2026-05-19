"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getOrders, type Order, type OrderStatus } from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import OrderCard from "@/components/OrderCard";
import PageHeader from "@/components/PageHeader";
import Alert from "@/components/Alert";
import EmptyState from "@/components/EmptyState";
import SearchInput from "@/components/SearchInput";
import SkeletonCard from "@/components/SkeletonCard";
import {
  RefreshCw, LayoutGrid, List, ClipboardList, Wallet, CheckCircle,
  UtensilsCrossed, Package, Truck, Filter
} from "lucide-react";

type Tab = "queue" | "unpaid" | "history";

const queueColumns: { status: OrderStatus; label: string; color: string }[] = [
  { status: "pending", label: "Pending", color: "#D97706" },
  { status: "confirmed", label: "Confirmed", color: "#2563EB" },
  { status: "preparing", label: "Preparing", color: "#9B6625" },
  { status: "ready_for_pickup", label: "Ready", color: "#16A34A" },
];

function isPaid(ps?: string): boolean {
  return ps === "paid" || ps === "captured" || ps === "settled" || ps === "authorized";
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const storeId = Number(typeof window !== "undefined" ? localStorage.getItem("staffStoreId") || "0" : "0");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("queue");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"kanban" | "list">("kanban");

  const fetchOrders = useCallback(async () => {
    try {
      if (!storeId) { setLoading(false); setError("Store not selected"); return; }
      const data = await getOrders(storeId, undefined);
      const list = Array.isArray(data) ? data : [];
      setOrders(list);
      setError("");
    } catch (err: any) {
      setError(err.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  usePolling(fetchOrders, [storeId], { interval: 10000 });

  const filteredOrders = useMemo(() => {
    let list = orders;

    // Tab filter
    if (tab === "queue") {
      list = list.filter((o) => !o.status.includes("delivered") && !o.status.includes("cancelled"));
    } else if (tab === "unpaid") {
      list = list.filter((o) => !isPaid(o.payment_status) && !o.status.includes("cancelled") && !o.status.includes("delivered"));
    } else if (tab === "history") {
      list = list.filter((o) => o.status.includes("delivered") || o.status.includes("cancelled"));
    }

    // Type filter
    if (typeFilter !== "all") {
      list = list.filter((o) => o.order_type === typeFilter);
    }

    // Search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((o) =>
        (o.order_number?.toLowerCase() || "").includes(q) ||
        (o.customer_name?.toLowerCase() || "").includes(q) ||
        (o.table_number?.toLowerCase() || "").includes(q)
      );
    }

    return list;
  }, [orders, tab, typeFilter, search]);

  const unpaidByType = useMemo(() => {
    const all = orders.filter((o) => !isPaid(o.payment_status) && !o.status.includes("cancelled") && !o.status.includes("delivered"));
    return {
      dine_in: all.filter((o) => o.order_type === "dine_in"),
      takeaway: all.filter((o) => o.order_type === "takeaway"),
      delivery: all.filter((o) => o.order_type === "delivery"),
    };
  }, [orders]);

  const totalUnpaid = unpaidByType.dine_in.length + unpaidByType.takeaway.length + unpaidByType.delivery.length;

  const tabConfig = [
    { key: "queue" as Tab, label: "Queue", icon: LayoutGrid },
    { key: "unpaid" as Tab, label: `Unpaid${totalUnpaid > 0 ? ` (${totalUnpaid})` : ""}`, icon: Wallet },
    { key: "history" as Tab, label: "History", icon: CheckCircle },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <PageHeader
        title="Order Queue"
        subtitle={`${orders.filter((o) => !o.status.includes("delivered") && !o.status.includes("cancelled")).length} active`}
        action={
          <button onClick={fetchOrders} className="btn btn-ghost btn-sm">
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      {error && <Alert variant="error" onDismiss={() => setError("")} autoDismiss={5000}>{error}</Alert>}

      {/* Tabs */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, borderBottom: "1px solid var(--color-border-light)", paddingBottom: 8 }}>
        {tabConfig.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`btn btn-sm ${tab === t.key ? "btn-primary" : "btn-ghost"}`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Filter size={16} className="text-gray-400 shrink-0" />
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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search order #, customer..." />
          {tab === "queue" && (
            <div style={{ display: "flex", border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
              <button className={`btn btn-sm ${view === "kanban" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("kanban")} style={{ borderRadius: 0, border: "none" }}>
                <LayoutGrid size={14} />
              </button>
              <button className={`btn btn-sm ${view === "list" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("list")} style={{ borderRadius: 0, border: "none" }}>
                <List size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <SkeletonCard count={6} />
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          title="No orders found"
          description={`No ${tab} orders match your filters.`}
          icon={<ClipboardList size={48} />}
        />
      ) : tab === "unpaid" ? (
        /* ── Unpaid List View ── */
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Takeaway / Delivery unpaid — flagged */}
          {(unpaidByType.takeaway.length > 0 || unpaidByType.delivery.length > 0) && (
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#DC2626", marginBottom: 10 }}>Needs Payment (Do Not Hand Over)</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
                {[...unpaidByType.takeaway, ...unpaidByType.delivery].map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onClick={(o) => router.push(`/pos?checkout=${o.id}`)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Dine-in unpaid — normal */}
          {unpaidByType.dine_in.length > 0 && (
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#D97706", marginBottom: 10 }}>Dine-in Checks (Pay After Meal)</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
                {unpaidByType.dine_in.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onClick={(o) => router.push(`/pos?checkout=${o.id}`)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : tab === "history" ? (
        /* ── History List View ── */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {filteredOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onClick={(o) => router.push(`/kitchen/${o.id}`)}
            />
          ))}
        </div>
      ) : view === "kanban" ? (
        /* ── Kanban Queue View ── */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          {queueColumns.map((col) => {
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
        /* ── List Queue View ── */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
          {filteredOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onClick={(o) => router.push(`/kitchen/${o.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
