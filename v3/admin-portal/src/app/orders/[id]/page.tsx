"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, type OrderDetail } from "@/lib/api";
import { ArrowLeft } from "lucide-react";

const STATUS_FLOW: Record<string, string[]> = {
  pending: ["confirmed", "cancelled_by_merchant"],
  confirmed: ["preparing", "cancelled_by_merchant"],
  preparing: ["ready_for_pickup", "cancelled_by_merchant"],
  ready_for_pickup: ["out_for_delivery", "delivered"],
  out_for_delivery: ["delivered"],
  delivered: ["refunded", "partially_refunded"],
};

export default function OrderDetailPage() {
  const p = useParams(); const r = useRouter(); const id = Number(p.id);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [updating, setUpdating] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => { setLoading(true);
    try { setOrder(await api.get<OrderDetail>(`/admin/orders/${id}`)); } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [id]);

  const update = async (status: string) => { setUpdating(true);
    try { await api.patch(`/admin/orders/${id}/status`, { status, reason: reason || undefined }); setMsg(`Updated to ${status.replace(/_/g, " ")}`); setReason(""); await load(); }
    catch (e: any) { setError(e.message); }
    finally { setUpdating(false); }
  };

  const fmt = (v: number) => `RM ${Number(v || 0).toFixed(2)}`;
  const dt = (s: string | null) => s ? new Date(s).toLocaleString() : "—";
  const sb = (s: string) => {
    const m: Record<string, string> = { pending: "badge-yellow", confirmed: "badge-blue", preparing: "badge-orange", ready_for_pickup: "badge-green", out_for_delivery: "badge-blue", delivered: "badge-green", cancelled_by_customer: "badge-red", cancelled_by_merchant: "badge-red", refunded: "badge-gray", partially_refunded: "badge-gray" };
    return <span className={`badge badge-sm ${m[s] || "badge-gray"}`}>{s?.replace(/_/g, " ")}</span>;
  };

  if (loading) return <div style={{ padding: 32 }}>Loading...</div>;
  if (!order) return <div style={{ padding: 32 }}>{error || "Not found"}</div>;

  const next = STATUS_FLOW[order.status] || [];

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => r.push("/orders")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <div><h1 className="page-title" style={{ margin: 0 }}>{order.order_number}</h1><p className="page-subtitle" style={{ marginTop: 2 }}>{order.customer_name || "Unknown"} · {dt(order.created_at)}</p></div>
        <div style={{ marginLeft: "auto" }}>{sb(order.status)}</div>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
      {msg && <div className="alert alert-success" style={{ marginBottom: 12 }}>{msg}</div>}

      {next.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 16, display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Update Status:</label>
          {next.map(s => <button key={s} onClick={() => update(s)} disabled={updating} className="btn btn-sm btn-primary" style={{ fontSize: 12 }}>{s.replace(/_/g, " ")}</button>)}
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (optional)" style={{ padding: "6px 10px", fontSize: 12, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)", minWidth: 160 }} />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 20 }}>
          {[["Order Type", order.order_type?.replace(/_/g, " ")], ["Payment", order.payment_method || "—"], ["Subtotal", fmt(order.items_subtotal || 0)], ["Tax", fmt(order.tax_amount)], ["Delivery Fee", fmt(order.delivery_fee)], ["Discount", fmt(order.discount_amount)], ["Total", fmt(order.total_amount)]].map(([l, v]) => (
          <div key={l} className="card" style={{ padding: 12, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{l}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: l === "Total" ? "var(--color-primary)" : "inherit" }}>{v}</div>
          </div>
        ))}
      </div>

      <h4 style={{ marginBottom: 8 }}>Line Items</h4>
      <div className="table-container" style={{ marginBottom: 20 }}><table className="data-table">
        <thead><tr><th>Item</th><th style={{ textAlign: "center" }}>Qty</th><th style={{ textAlign: "right" }}>Unit Price</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
        <tbody>
          {(order.line_items || []).map((li: any, i: number) => (
            <tr key={i}>
              <td style={{ fontWeight: 600 }}>{li.item_name || "—"}</td>
              <td style={{ textAlign: "center" }}>{li.quantity}</td>
              <td style={{ textAlign: "right" }}>{fmt(li.unit_price)}</td>
              <td style={{ textAlign: "right" }}>{fmt(li.total_price)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>

      {(order.adjustments || []).length > 0 && (<>
        <h4 style={{ marginBottom: 8 }}>Adjustments</h4>
        <div className="table-container" style={{ marginBottom: 20 }}><table className="data-table">
          <thead><tr><th>Type</th><th style={{ textAlign: "right" }}>Amount</th><th>Reason</th><th>Date</th></tr></thead>
          <tbody>
            {(order.adjustments || []).map((adj: any, i: number) => (
              <tr key={i}>
                <td style={{ textTransform: "capitalize" }}>{adj.adjustment_type?.replace(/_/g, " ")}</td>
                <td style={{ textAlign: "right", color: Number(adj.amount_delta || 0) < 0 ? "var(--color-error)" : "var(--color-success)", fontWeight: 600 }}>{fmt(adj.amount_delta)}</td>
                <td style={{ fontSize: 12 }}>{adj.reason || "—"}</td>
                <td style={{ fontSize: 12 }}>{dt(adj.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </>)}

      {(order.status_log || []).length > 0 && (<>
        <h4 style={{ marginBottom: 8 }}>Status Log</h4>
        <div className="table-container"><table className="data-table">
          <thead><tr><th>Status</th><th>Date</th><th>Reason</th></tr></thead>
          <tbody>{order.status_log.map((sl: any, i: number) => (<tr key={i}><td>{sb(sl.status)}</td><td style={{ fontSize: 12 }}>{dt(sl.changed_at)}</td><td style={{ fontSize: 12 }}>{sl.reason || "—"}</td></tr>))}</tbody>
        </table></div>
      </>)}
    </div>
  );
}
