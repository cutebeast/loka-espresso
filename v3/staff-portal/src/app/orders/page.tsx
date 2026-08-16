"use client";

import { useTranslation } from "@/hooks/useTranslation";
import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getOrders, dispatchDeliveryOrder, type Order } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { usePolling } from "@/hooks/usePolling";
import OrderCard from "@/components/OrderCard";
import DeliveryDispatchDialog from "@/components/orders/DeliveryDispatchDialog";
import PageHeader from "@/components/PageHeader";
import Alert from "@/components/Alert";
import EmptyState from "@/components/EmptyState";
import SearchInput from "@/components/SearchInput";
import SkeletonCard from "@/components/SkeletonCard";
import { RefreshCw, LayoutGrid, ClipboardList, Wallet, CheckCircle, UtensilsCrossed, Package, Truck, Filter } from "lucide-react";
type Tab = "queue" | "unpaid" | "history";
function isPaid(ps?: string): boolean {
  return ps === "paid" || ps === "captured" || ps === "settled" || ps === "authorized";
}
export default function OrdersPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [unpaidList, setUnpaidList] = useState<Order[]>([]);
  const storeId = Number(typeof window !== "undefined" ? localStorage.getItem("staffStoreId") || "0" : "0");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dispatchOrder, setDispatchOrder] = useState<Order | null>(null);
  const [dispatchSaving, setDispatchSaving] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  // Separate state so the message can be translated at render time — calling
  // t() during the mount effect runs before i18n hydration (raw key frozen).
  const [storeMissing, setStoreMissing] = useState(false);
  const [tab, setTab] = useState<Tab>("queue");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const fetchOrders = useCallback(async () => {
    try {
      if (!storeId) {
        setLoading(false);
        setStoreMissing(true);
        return;
      }
      const data = await getOrders(storeId, undefined, undefined, undefined, { timeframe: tab === "history" ? "all" : "24h", issues: tab === "unpaid" }); 
      const list = Array.isArray(data) ? data : [];
      setOrders(list);
      // The Unpaid badge must not depend on the current tab's dataset — on the
      // queue tab it otherwise counts only the 24h non-pending window (36 vs 43).
      if (tab === "unpaid") {
        setUnpaidList(list);
      } else {
        const issues = await getOrders(storeId, undefined, undefined, undefined, { issues: true });
        setUnpaidList(Array.isArray(issues) ? issues : []);
      }
      setError("");
    } catch (err: unknown) {
      console.error("Failed to load orders:", err);
      setError(parseApiError(err, "Failed to load orders"));
    } finally {
      setLoading(false);
    }
  }, [storeId, tab, t]);
  usePolling(fetchOrders, [storeId, tab], {
    interval: 10000
  });
  const filteredOrders = useMemo(() => {
    let list = orders;

    // Tab filter
    if (tab === "queue") {
      list = list.filter(o => o.status !== "delivered" && o.status !== "cancelled_by_customer" && o.status !== "cancelled_by_merchant" && o.status !== "refunded" && o.status !== "partially_refunded" && o.status !== "disputed");
    } else if (tab === "unpaid") {
      list = list.filter(o => !isPaid(o.payment_status) && o.status !== "cancelled_by_customer" && o.status !== "cancelled_by_merchant" && o.status !== "delivered");
    } else if (tab === "history") {
      list = list.filter(o => o.status === "delivered" || o.status === "cancelled_by_customer" || o.status === "cancelled_by_merchant");
    }

    // Type filter
    if (typeFilter !== "all") {
      list = list.filter(o => o.order_type === typeFilter);
    }

    // Search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(o => (o.order_number?.toLowerCase() || "").includes(q) || (o.customer_name?.toLowerCase() || "").includes(q) || (o.table_number?.toLowerCase() || "").includes(q));
    }
    return list;
  }, [orders, tab, typeFilter, search]);
  const unpaidByType = useMemo(() => {
    const all = unpaidList.filter(o => !isPaid(o.payment_status) && o.status !== "cancelled_by_customer" && o.status !== "cancelled_by_merchant" && o.status !== "delivered");
    // payment_flow distinguishes open tabs (pay after meal) from pay-before-food orders
    const isOpenTab = (o: Order) => o.payment_flow === "pay_after_meal" || (o.payment_flow == null && o.order_type === "dine_in");
    return {
      dine_in: all.filter(isOpenTab),
      takeaway: all.filter(o => !isOpenTab(o) && o.order_type === "takeaway"),
      delivery: all.filter(o => !isOpenTab(o) && o.order_type === "delivery")
    };
  }, [unpaidList]);
  const totalUnpaid = unpaidByType.dine_in.length + unpaidByType.takeaway.length + unpaidByType.delivery.length;
  const tabConfig = [{
    key: "queue" as Tab,
    label: t("orders.tab_queue"),
    icon: LayoutGrid
  }, {
    key: "unpaid" as Tab,
    label: totalUnpaid > 0 ? t("orders.unpaid_count", { count: totalUnpaid }) : t("orders.unpaid"),
    icon: Wallet
  }, {
    key: "history" as Tab,
    label: t("orders.tab_history"),
    icon: CheckCircle
  }];
  return <div style={{
    padding: 24,
    maxWidth: 1400,
    margin: "0 auto"
  }}>
      <PageHeader title={t("orders.order_queue")} subtitle={`${orders.filter(o => !o.status.includes("delivered") && !o.status.includes("cancelled")).length} ${t("orders.active")}`} action={<button onClick={fetchOrders} className="btn btn-ghost btn-sm">
            <RefreshCw size={14} />{t("orders.refresh")}</button>} />

      {storeMissing && <Alert variant="error" onDismiss={() => setStoreMissing(false)}>{t("orders.err_store_not_selected")}</Alert>}
      {error && <Alert variant="error" onDismiss={() => setError("")} autoDismiss={5000}>{error}</Alert>}

      {/* Tabs */}
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 16,
      borderBottom: "1px solid var(--color-border-light)",
      paddingBottom: 8
    }}>
        {tabConfig.map(t => <button key={t.key} onClick={() => setTab(t.key)} className={`btn btn-sm ${tab === t.key ? "btn-primary" : "btn-ghost"}`}>
            <t.icon size={14} /> {t.label}
          </button>)}
      </div>

      {/* Filters */}
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
          <Filter size={16} className="text-gray-400 shrink-0" />
          {[{
          value: "all",
          label: t("orders.all_types"),
          icon: null
        }, {
          value: "dine_in",
          label: t("orders.type_dine_in"),
          icon: <UtensilsCrossed size={12} />
        }, {
          value: "takeaway",
          label: t("orders.type_takeaway"),
          icon: <Package size={12} />
        }, {
          value: "delivery",
          label: t("orders.type_delivery"),
          icon: <Truck size={12} />
        }].map(t => <button key={t.value} onClick={() => setTypeFilter(t.value)} className={`badge badge-sm flex items-center gap-1 cursor-pointer ${typeFilter === t.value ? "badge-primary" : "badge-outline"}`}>
              {t.icon}
              {t.label}
            </button>)}
        </div>
        <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8
      }}>
          <SearchInput value={search} onChange={setSearch} placeholder={t("orders.search_order_customer")} />
        </div>
      </div>

      {loading ? <SkeletonCard count={6} /> : filteredOrders.length === 0 ? <EmptyState title={t("orders.no_orders_found")} description={t("orders.no_orders_match", { tab })} icon={<ClipboardList size={48} />} /> : tab === "unpaid" ? (/* ── Unpaid List View ── */
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 20
    }}>
          {/* Takeaway / Delivery unpaid — flagged */}
          {(unpaidByType.takeaway.length > 0 || unpaidByType.delivery.length > 0) && <div>
              <h3 style={{
          fontSize: 14,
          fontWeight: 700,
          color: "#DC2626",
          marginBottom: 10
        }}>{t("orders.needs_payment_do_not_hand_over")}</h3>
              <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: 12
        }}>
                {[...unpaidByType.takeaway, ...unpaidByType.delivery].map(order => <OrderCard key={order.id} order={order} onClick={o => router.push(`/pos?checkout=${o.id}`)} />)}
              </div>
            </div>}

          {/* Dine-in unpaid — normal */}
          {unpaidByType.dine_in.length > 0 && <div>
              <h3 style={{
          fontSize: 14,
          fontWeight: 700,
          color: "#D97706",
          marginBottom: 10
        }}>{t("orders.dine_in_checks_pay_after_meal")}</h3>
              <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: 12
        }}>
                {unpaidByType.dine_in.map(order => <OrderCard key={order.id} order={order} onClick={o => router.push(`/pos?checkout=${o.id}`)} />)}
              </div>
            </div>}
        </div>) : tab === "history" ? (/* ── History List ── */
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
      gap: 12
    }}>
          {filteredOrders.map(order => <OrderCard key={order.id} order={order} onClick={o => router.push(`/kitchen/${o.id}`)} />)}
        </div>) : (/* ── Queue List ── */
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
      gap: 12
    }}>
          {filteredOrders.map(order => <OrderCard key={order.id} order={order} onClick={o => router.push(`/pos?checkout=${o.id}`)} onDispatch={setDispatchOrder} />)}
        </div>)}

      {dispatchOrder && <DeliveryDispatchDialog order={dispatchOrder} saving={dispatchSaving} error={dispatchError} onClose={() => {
      setDispatchOrder(null);
      setDispatchError(null);
    }} onSubmit={async (provider, externalRef) => {
      setDispatchSaving(true);
      setDispatchError(null);
      try {
        await dispatchDeliveryOrder(dispatchOrder.id, provider, externalRef);
        setDispatchOrder(null);
        await fetchOrders();
      } catch (err: unknown) {
        setDispatchError(parseApiError(err, "Failed to record delivery dispatch"));
      } finally {
        setDispatchSaving(false);
      }
    }} />}
    </div>;
}