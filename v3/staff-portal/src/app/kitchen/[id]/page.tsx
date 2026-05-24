"use client";

import { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getOrderById, updateOrderStatus, transferTable, OrderDetail, OrderStatus } from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import PageHeader from "@/components/PageHeader";
import Alert from "@/components/Alert";
import Badge, { type BadgeVariant } from "@/components/Badge";
import SkeletonCard from "@/components/SkeletonCard";
import { ArrowLeft, CheckCircle, Clock, Printer, XCircle, MoveRight } from "lucide-react";

const STATUS_FLOW: Record<string, { next: OrderStatus[]; label: string; color: BadgeVariant }> = {
  pending: { next: ["confirmed", "cancelled_by_merchant"], label: "Pending", color: "yellow" },
  confirmed: { next: ["preparing", "cancelled_by_merchant"], label: "Confirmed", color: "blue" },
  preparing: { next: ["ready_for_pickup", "out_for_delivery", "cancelled_by_merchant"], label: "Preparing", color: "orange" },
  ready_for_pickup: { next: ["delivered", "cancelled_by_merchant"], label: "Ready", color: "green" },
  out_for_delivery: { next: ["delivered", "cancelled_by_merchant"], label: "Out for Delivery", color: "blue" },
  delivered: { next: [], label: "Delivered", color: "green" },
  cancelled_by_customer: { next: [], label: "Cancelled (Customer)", color: "red" },
  cancelled_by_merchant: { next: [], label: "Cancelled (Merchant)", color: "red" },
};

export default function KitchenDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [updating, setUpdating] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showTableTransfer, setShowTableTransfer] = useState(false);
  const [availableTables, setAvailableTables] = useState<{ id: number; table_number: string; status: string }[]>([]);
  const [transferring, setTransferring] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getOrderById(id);
      setOrder(data);
      setError("");
    } catch (e: unknown) {
      console.error("Failed to load kitchen order:", e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  usePolling(load, [id], { interval: 10000 });

  const handleUpdate = async (status: OrderStatus) => {
    setUpdating(true);
    try {
      await updateOrderStatus(id, status, status.includes("cancelled") ? cancelReason : undefined);
      setMsg(`Order updated to ${status}`);
      setCancelReason("");
      const updated = await getOrderById(id);
      setOrder(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUpdating(false);
    }
  };

  const handleTransfer = async (newTableId: number) => {
    setTransferring(true);
    try {
      await transferTable(id, newTableId);
      setMsg("Table transferred successfully");
      setShowTableTransfer(false);
      const updated = await getOrderById(id);
      setOrder(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setTransferring(false); }
  };

  const loadTables = async () => {
    const storeId = typeof window !== "undefined" ? localStorage.getItem("staffStoreId") : null;
    if (!storeId) return;
    try {
      const data = await fetch(`/api/v1/admin/stores/${storeId}/tables`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      }).then((r) => r.json());
      const items = data?.data?.items || data?.items || data || [];
      setAvailableTables(Array.isArray(items) ? items.filter((t: { status: string }) => t.status === "available") : []);
      setShowTableTransfer(true);
    } catch { setError("Failed to load tables"); }
  };
  const fmt = (v: number) => `RM ${Number(v || 0).toFixed(2)}`;
  const dt = (s: string | null) => {
    if (!s) return "—";
    const d = new Date(s);
    return isNaN(d.getTime()) ? "—" : d.toLocaleString();
  };

  if (loading) {
    return (
      <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
        <SkeletonCard count={4} />
      </div>
    );
  }

  if (!order) {
    return (
      <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
        <Alert variant="error">{error || "Order not found"}</Alert>
        <button className="btn btn-primary" onClick={() => router.push("/kitchen")} style={{ marginTop: 16 }}>
          <ArrowLeft size={16} /> Back to Kitchen
        </button>
      </div>
    );
  }

  const flow = STATUS_FLOW[order.status] || STATUS_FLOW.pending!;

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <PageHeader
        title={order.order_number}
        subtitle={`${order.customer_name || "Walk-in"} · ${dt(order.created_at)}`}
       
        action={<Badge variant={flow.color}>{flow.label}</Badge>}
      />

      {error && <Alert variant="error" onDismiss={() => setError("")}>{error}</Alert>}
      {msg && <Alert variant="success" onDismiss={() => setMsg("")} autoDismiss={3000}>{msg}</Alert>}

      {/* Status Actions */}
      {flow.next.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Update Status</h4>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
            {flow.next.map((s) => (
              <button
                key={s}
                onClick={() => handleUpdate(s)}
                disabled={updating}
                className={`btn btn-sm ${s.includes("cancelled") ? "btn-danger" : "btn-primary"}`}
              >
                {s.includes("cancelled") ? <XCircle size={14} /> : <CheckCircle size={14} />}
                {s.replace("_", " ")}
              </button>
            ))}
            {flow.next.some((s) => s.includes("cancelled")) && (
              <input
                className="form-input"
                style={{ minWidth: 200 }}
                placeholder="Reason for cancellation (optional)"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            )}
        </div>
      </div>
      )}

      {/* Table Transfer — dine-in only */}
      {order.order_type === "dine_in" && order.dining_table_id && !["delivered", "cancelled_by_customer", "cancelled_by_merchant"].includes(order.status) && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>
              Table: <span style={{ color: "var(--color-primary)" }}>{order.table_number || "—"}</span>
            </h4>
            {!showTableTransfer ? (
              <button className="btn btn-sm btn-ghost" onClick={loadTables} disabled={transferring}>
                <MoveRight size={14} /> Transfer
              </button>
            ) : (
              <button className="btn btn-sm btn-ghost" onClick={() => setShowTableTransfer(false)}>Cancel</button>
            )}
          </div>
          {showTableTransfer && (
            <div style={{ marginTop: 12 }}>
              {availableTables.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>No available tables</p>
              ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {availableTables.map((t) => (
                    <button
                      key={t.id}
                      className="btn btn-sm btn-outline"
                      onClick={() => handleTransfer(t.id)}
                      disabled={transferring}
                    >
                      {t.table_number}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Order Summary */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Order Summary</h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          {[
            ["Order Type", order.order_type?.replace(/_/g, " ")],
            ["Payment", order.payment_method || "—"],
            ["Payment Status", order.payment_status || "—"],
            ["Subtotal", fmt(order.items_subtotal || 0)],
            ["Tax", fmt(order.tax_amount || 0)],
            ["Discount", fmt(order.discount_amount || 0)],
            ["Total", fmt(order.total_amount || 0)],
          ].map(([label, value]) => (
            <div key={label as string} style={{ textAlign: "center", padding: 10, background: "var(--color-bg-muted)", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: label === "Total" ? "var(--color-primary)" : "inherit" }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Line Items */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Line Items</h4>
        <div className="table-container" style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-light)" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Item</th>
                <th style={{ textAlign: "center" }}>Qty</th>
                <th style={{ textAlign: "right" }}>Unit Price</th>
                <th style={{ textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {(order.line_items || []).map((li) => (
                <tr key={`${li.menu_item_id || li.id || li.item_name}-${li.modifiers_label || "none"}`}>
                  <td style={{ fontWeight: 600 }}>
                    {li.item_name || li.name || "—"}
                    {li.notes && <div style={{ fontSize: 12, color: "var(--color-text-muted)", fontWeight: 400 }}>Note: {li.notes}</div>}
                    {li.modifiers_label && <div style={{ fontSize: 12, color: "var(--color-text-muted)", fontWeight: 400 }}>{li.modifiers_label}</div>}
                  </td>
                  <td style={{ textAlign: "center" }}>{li.quantity}</td>
                  <td style={{ textAlign: "right" }}>{fmt(li.unit_price || li.price || 0)}</td>
                  <td style={{ textAlign: "right" }}>{fmt((li.unit_price || li.price || 0) * li.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Status Timeline */}
      {(order.status_log || []).length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Status Timeline</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {(order.status_log || []).map((sl, i, arr) => {
              const isLast = i === arr.length - 1;
              return (
                <div key={`${sl.to_status}-${sl.created_at || i}`} style={{ display: "flex", gap: 12 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{
                      width: 12, height: 12, borderRadius: "50%",
                      background: isLast ? "var(--color-primary)" : "var(--color-border-light)",
                      border: `2px solid ${isLast ? "var(--color-primary)" : "var(--color-border-light)"}`,
                    }} />
                    {!isLast && <div style={{ width: 2, flex: 1, background: "var(--color-border-light)", margin: "4px 0" }} />}
                  </div>
                  <div style={{ paddingBottom: isLast ? 0 : 16 }}>
                    <Badge variant={STATUS_FLOW[sl.to_status]?.color || "gray"} size="sm">
                      {sl.to_status?.replace(/_/g, " ")}
                    </Badge>
                    <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>
                      <Clock size={10} style={{ display: "inline", marginRight: 4 }} />
                      {dt(sl.created_at)}
                      {sl.actor_type && <> · by {sl.actor_type}{sl.actor_id ? ` #${sl.actor_id}` : ""}</>}
                    </div>
                    {sl.reason && <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>Reason: {sl.reason}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Print Ticket */}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-outline" disabled title="Printer integration pending">
          <Printer size={16} /> Print Kitchen Ticket
        </button>
      </div>
    </div>
  );
}
