"use client";
import { RoleGuard, canUseKitchen } from "@/hooks/useStaffRole";

import { useTranslation } from "@/hooks/useTranslation";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getOrders, updateOrderStatus, Order, OrderStatus } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { usePolling } from "@/hooks/usePolling";
import OrderCard from "@/components/OrderCard";
import PageHeader from "@/components/PageHeader";
import Alert from "@/components/Alert";
import EmptyState from "@/components/EmptyState";
import SearchInput from "@/components/SearchInput";
import SkeletonCard from "@/components/SkeletonCard";
import { Filter, RefreshCw, Volume2, VolumeX, LayoutGrid, List, UtensilsCrossed, Package, Wifi, WifiOff, ChefHat } from "lucide-react";
const statusFilters: {
  labelKey: string;
  value: OrderStatus | "all";
}[] = [{
  labelKey: "kitchen.filter_all",
  value: "all"
}, {
  labelKey: "kitchen.filter_new",
  value: "confirmed"
}, {
  labelKey: "kitchen.filter_preparing",
  value: "preparing"
}, {
  labelKey: "kitchen.filter_done",
  value: "ready_for_pickup"
}];
const kanbanColumns: {
  status: OrderStatus;
  labelKey: string;
  color: string;
}[] = [{
  status: "confirmed",
  labelKey: "kitchen.column_new",
  color: "#2563EB"
}, {
  status: "preparing",
  labelKey: "kitchen.column_preparing",
  color: "#9B6625"
}, {
  status: "ready_for_pickup",
  labelKey: "kitchen.column_done",
  color: "#16A34A"
}];
export default function KitchenPage() {
  return <RoleGuard allowed={canUseKitchen}>
    <KitchenPageContent />
  </RoleGuard>;
}
function KitchenPageContent() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  // Display mode: view-only wall-screen variant (no controls, larger layout)
  const isDisplay = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("mode") === "display";
  }, []);
  const [orders, setOrders] = useState<Order[]>([]);
  const storeId = Number(typeof window !== "undefined" ? localStorage.getItem("staffStoreId") || "0" : "0");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Store-missing is a separate state so the message can be translated at
  // RENDER time — calling t() during the mount effect runs before i18n
  // hydration and would freeze the raw key into the error string.
  const [storeMissing, setStoreMissing] = useState(false);
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [station, setStation] = useState<"all" | "bar" | "kitchen">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"oldest" | "newest" | "value">("oldest");
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [soundOn, setSoundOn] = useState(true);
  const [connected, setConnected] = useState(true);
  const prevCountRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchSeqRef = useRef(0);
  const isFirstFetchRef = useRef(true);
  const fetchOrders = useCallback(async () => {
    let list: Order[] = [];
    try {
      if (!storeId) {
        setLoading(false);
        setStoreMissing(true);
        return;
      }
      const data = await getOrders(storeId, undefined, undefined, station === "all" ? undefined : station);
      list = Array.isArray(data) ? data : [];
      setOrders(list);
      setConnected(true);
      // Sound notification on new orders
      if (!isFirstFetchRef.current && soundOn && list.length > prevCountRef.current && audioCtxRef.current) {
        try {
          const ctx = audioCtxRef.current;
          if (ctx.state === "suspended") await ctx.resume();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 800;
          osc.type = "sine";
          gain.gain.value = 0.1;
          osc.start();
          osc.stop(ctx.currentTime + 0.15);
          osc.onended = () => {
            osc.disconnect();
            gain.disconnect();
          };
        } catch (err) {
          console.error("Audio notification failed:", err);
        }
      }
      setError("");
    } catch (err: unknown) {
      console.error("Kitchen: Failed to load orders:", err);
      setConnected(false);
      setError(parseApiError(err, "Failed to load orders"));
    } finally {
      prevCountRef.current = list.length;
      isFirstFetchRef.current = false;
      setLoading(false);
    }
  }, [storeId, soundOn, station, t]);
  usePolling(fetchOrders, [storeId, soundOn, station], {
    interval: isDisplay ? 3000 : 5000
  });
  useEffect(() => {
    prevCountRef.current = 0;
    try {
      audioCtxRef.current = new (window.AudioContext || (window as {
        webkitAudioContext?: typeof AudioContext;
      }).webkitAudioContext)();
    } catch (e) {
      console.error("Failed to create AudioContext:", e);
    }
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- ref set asynchronously, must capture in cleanup
      const timer = audioTimerRef.current;
      if (timer) clearTimeout(timer);
      const ctx = audioCtxRef.current;
      if (ctx) {
        ctx.close().catch(err => console.error("AudioContext close failed:", err));
        audioCtxRef.current = null;
      }
    };
  }, []);
  const handleUpdateStatus = async (id: string | number, status: OrderStatus) => {
    const seq = ++fetchSeqRef.current;
    try {
      await updateOrderStatus(id, status);
      if (seq !== fetchSeqRef.current) return;
      await fetchOrders();
    } catch (err: unknown) {
      if (seq !== fetchSeqRef.current) return;
      setError(parseApiError(err, "Failed to update order"));
    }
  };
  const filteredOrders = useMemo(() => orders.filter(o => {
    // Kitchen only cares about preparation — exclude delivered/cancelled/refunded
    const kitchenStatuses: OrderStatus[] = ["confirmed", "preparing", "ready_for_pickup"];
    if (!kitchenStatuses.includes(o.status)) return false;
    if (filter !== "all" && o.status !== filter) return false;
    if (typeFilter === "dine_in" && o.order_type !== "dine_in") return false;
    if (typeFilter === "pack_away" && !["takeaway", "delivery"].includes(o.order_type)) return false;
    if (search) {
      const q = search.toLowerCase();
      return (o.order_number?.toLowerCase() || "").includes(q) || (o.customer_name?.toLowerCase() || "").includes(q) || (o.table_number?.toLowerCase() || "").includes(q);
    }
    return true;
  }).sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (isNaN(ta) || isNaN(tb)) return 0;
    if (sort === "oldest") return ta - tb;
    if (sort === "newest") return tb - ta;
    if (sort === "value") return (b.total_amount ?? 0) - (a.total_amount ?? 0);
    return 0;
    }), [orders, filter, typeFilter, search, sort]);
  const filterLabelMap: Record<string, string> = {
    all: t("kitchen.filter_all"),
    confirmed: t("kitchen.filter_new"),
    preparing: t("kitchen.filter_preparing"),
    ready_for_pickup: t("kitchen.filter_done"),
  };
  const columnLabelMap: Record<string, string> = {
    confirmed: t("kitchen.column_new"),
    preparing: t("kitchen.column_preparing"),
    ready_for_pickup: t("kitchen.column_done"),
  };
  const counts = statusFilters.reduce((acc, s) => {
    // "All" must count what the board can actually show (kitchen statuses),
    // not every order in the fetch window (incl. delivered/refunded).
    acc[s.value] = s.value === "all"
      ? orders.filter(o => ["confirmed", "preparing", "ready_for_pickup"].includes(o.status)).length
      : orders.filter(o => o.status === s.value).length;
    return acc;
  }, {} as Record<string, number>);
  const activeOrders = filteredOrders.filter(o => o.status !== "ready_for_pickup");
  if (isDisplay) {
    return <div style={{
      padding: 16,
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      background: "var(--color-bg-page)"
    }}>
        {/* Compact display header */}
        <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12
    }}>
          <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8
      }}>
            <ChefHat size={22} style={{
          color: "var(--color-primary)"
        }} />
            <span style={{
          fontSize: 18,
          fontWeight: 800
        }}>{t("kitchen.kitchen_display")}</span>
          </div>
          <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12
      }}>
            {connected ? <span className="badge badge-green badge-sm flex items-center gap-1"><Wifi size={10} />{t("kitchen.live")}</span> : <span className="badge badge-red badge-sm flex items-center gap-1"><WifiOff size={10} />{t("kitchen.offline")}</span>}
            <span style={{
          fontSize: 14,
          color: "var(--color-text-muted)"
        }}>{activeOrders.length} {t("staff.status.active")}</span>
          </div>
        </div>

        {storeMissing && <Alert variant="error">{t("kitchen.err_store_not_selected")}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}

        {/* Full-height kanban */}
        <div style={{
      flex: 1,
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
      gap: 12,
      overflow: "hidden"
    }}>
          {kanbanColumns.map(col => {
        const colOrders = filteredOrders.filter(o => o.status === col.status);
        return <div key={col.status} style={{
          background: "var(--color-bg-muted)",
          borderRadius: "var(--radius-lg)",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}>
                <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
            flexShrink: 0
          }}>
                  <h3 style={{
              fontSize: 18,
              fontWeight: 800,
              color: col.color
            }}>{columnLabelMap[col.status] || t(col.labelKey)}</h3>
                  <span className="badge badge-lg badge-outline" style={{
              fontSize: 16,
              minWidth: 32,
              justifyContent: "center"
            }}>{colOrders.length}</span>
                </div>
                <div style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            overflowY: "auto"
          }}>
                  {colOrders.map(order => <OrderCard key={order.id} order={order} compact />)}
                  {colOrders.length === 0 && <div style={{
              textAlign: "center",
              padding: 24,
              color: "var(--color-text-muted)",
              fontSize: 14
            }}>{t("kitchen.no")}{(columnLabelMap[col.status] || t(col.labelKey)).toLowerCase()}{t("kitchen.orders")}</div>}
                </div>
              </div>;
      })}
        </div>
      </div>;
  }

  return <div style={{
    padding: 24,
    maxWidth: 1400,
    margin: "0 auto"
  }}>
      <PageHeader title={t("kitchen.kitchen_display")} subtitle={`${activeOrders.length} ${t("staff.status.active")}`} action={<div style={{
      display: "flex",
      alignItems: "center",
      gap: 8
    }}>
            <button onClick={() => setSoundOn(!soundOn)} className="btn btn-ghost btn-icon" title={soundOn ? t("kitchen.mute") : t("kitchen.unmute")} aria-label={soundOn ? t("kitchen.mute") : t("kitchen.unmute")}>
              {soundOn ? <Volume2 size={16} className="text-gray-500" /> : <VolumeX size={16} className="text-gray-400" />}
            </button>
            <button onClick={fetchOrders} className="btn btn-ghost btn-sm">
              <RefreshCw size={14} />{t("kitchen.refresh")}</button>
          </div>} />

      {storeMissing && <Alert variant="error" onDismiss={() => setStoreMissing(false)}>{t("kitchen.err_store_not_selected")}</Alert>}
      {error && <Alert variant="error" onDismiss={() => setError("")} autoDismiss={5000}>{error}</Alert>}

      {/* Connection & Controls */}
      <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 12,
      marginBottom: 16
    }}>
        <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8
      }}>
          {connected ? <span className="badge badge-green badge-sm flex items-center gap-1"><Wifi size={10} />{t("kitchen.live")}</span> : <span className="badge badge-red badge-sm flex items-center gap-1"><WifiOff size={10} />{t("kitchen.offline")}</span>}
        </div>
        <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8
      }}>
          <SearchInput value={search} onChange={setSearch} placeholder={t("kitchen.search_order_customer_table")} />
          <select className="form-input" style={{
          width: 120
        }} value={sort} onChange={e => setSort(e.target.value as typeof sort)} aria-label={t("kitchen.sort_order")}>
            <option value="oldest">{t("kitchen.oldest_first")}</option>
            <option value="newest">{t("kitchen.newest_first")}</option>
            <option value="value">{t("kitchen.highest_value")}</option>
          </select>
          <div style={{
          display: "flex",
          border: "1px solid var(--color-border-light)",
          borderRadius: "var(--radius-md)",
          overflow: "hidden"
        }}>
            <button className={`btn btn-sm ${view === "kanban" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("kanban")} style={{
            borderRadius: 0,
            border: "none"
          }} aria-label={t("kitchen.grid_view")}>
              <LayoutGrid size={14} />
            </button>
            <button className={`btn btn-sm ${view === "list" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("list")} style={{
            borderRadius: 0,
            border: "none"
          }} aria-label={t("kitchen.list_view")}>
              <List size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Station Tabs (KDS routing — bar vs kitchen) */}
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 16,
      overflowX: "auto",
      paddingBottom: 4
    }}>
        {([{
        value: "all",
        label: t("kitchen.filter_all")
      }, {
        value: "bar",
        label: t("kitchen.station_bar")
      }, {
        value: "kitchen",
        label: t("kitchen.station_kitchen")
      }] as const).map(s => <button key={s.value} onClick={() => setStation(s.value)} className={`btn btn-sm ${station === s.value ? "btn-primary" : "btn-ghost"}`}>
            {s.label}
          </button>)}
      </div>

      {/* Status Filters */}
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 16,
      overflowX: "auto",
      paddingBottom: 4
    }}>
        <Filter size={16} className="text-gray-400 shrink-0" />
        {statusFilters.map(s => <button key={s.value} onClick={() => setFilter(s.value)} className={`btn btn-sm ${filter === s.value ? "btn-primary" : "btn-ghost"}`}>
            {filterLabelMap[s.value] || t(s.labelKey)} ({counts[s.value] ?? 0})
          </button>)}
      </div>

      {/* Type Filters */}
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 20
    }}>
        {[{
        value: "all",
        label: t("kitchen.all_types"),
        icon: null
      }, {
        value: "dine_in",
        label: t("kitchen.dine_in"),
        icon: <UtensilsCrossed size={12} />
      }, {
        value: "pack_away",
        label: t("kitchen.pack_away"),
        icon: <Package size={12} />
      }].map(t => <button key={t.value} onClick={() => setTypeFilter(t.value)} className={`badge badge-sm flex items-center gap-1 cursor-pointer ${typeFilter === t.value ? "badge-primary" : "badge-outline"}`}>
            {t.icon}
            {t.label}
          </button>)}
      </div>

      {loading ? <SkeletonCard count={6} /> : filteredOrders.length === 0 ? <EmptyState title={t("kitchen.all_caught_up")} description={t("kitchen.no_orders_match_your_filters")} icon={<ChefHat size={48} />} /> : view === "kanban" ? (/* ── Kanban View ── */
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
      gap: 16
    }}>
          {kanbanColumns.map(col => {
        const colOrders = filteredOrders.filter(o => o.status === col.status);
        return <div key={col.status} style={{
          background: "var(--color-bg-muted)",
          borderRadius: "var(--radius-lg)",
          padding: 12
        }}>
                <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12
          }}>
                  <h3 style={{
              fontSize: 14,
              fontWeight: 700,
              color: col.color
            }}>{columnLabelMap[col.status] || t(col.labelKey)}</h3>
                  <span className="badge badge-sm badge-outline">{colOrders.length}</span>
                </div>
                <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 10
          }}>
                  {colOrders.map(order => <OrderCard key={order.id} order={order} compact onClick={o => router.push(`/kitchen/${o.id}`)} onQuickAction={(o, status) => handleUpdateStatus(o.id, status)} />)}
                  {colOrders.length === 0 && <div style={{
              textAlign: "center",
              padding: 24,
              color: "var(--color-text-muted)",
              fontSize: 13
            }}>{t("kitchen.no")}{(columnLabelMap[col.status] || t(col.labelKey)).toLowerCase()}{t("kitchen.orders")}</div>}
                </div>
              </div>;
      })}
        </div>) : (/* ── List View ── */
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
      gap: 12
    }}>
          {filteredOrders.map(order => <OrderCard key={order.id} order={order} onClick={o => router.push(`/kitchen/${o.id}`)} onQuickAction={(o, status) => handleUpdateStatus(o.id, status)} />)}
        </div>)}
    </div>;
}