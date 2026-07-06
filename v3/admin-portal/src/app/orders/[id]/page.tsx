"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, type OrderDetail } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";

interface Payment {
  id: number;
  provider: string;
  status: string;
  amount: number;
  captured_amount: number;
  refunded_amount: number;
  currency_code: string;
}

const STATUS_FLOW: Record<string, string[]> = {
  pending: ["confirmed", "cancelled_by_merchant"],
  confirmed: ["preparing", "cancelled_by_merchant"],
  preparing: ["ready_for_pickup", "cancelled_by_merchant"],
  ready_for_pickup: ["out_for_delivery", "delivered"],
  out_for_delivery: ["delivered"],
  delivered: ["refunded", "partially_refunded"],
};

export default function OrderDetailPage() {
  const { format } = useCurrency();
  const p = useParams(); const r = useRouter(); const id = Number(p.id);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [updating, setUpdating] = useState(false);
  const [msg, setMsg] = useState("");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [refundLoading, setRefundLoading] = useState<number | null>(null);
  const [refundAmounts, setRefundAmounts] = useState<Record<number, string>>({});
  const [refundReasons, setRefundReasons] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    return api.get<OrderDetail>(`/admin/orders/${id}`);
  }, [id]);

  const loadPayments = useCallback(async () => {
    const res = await api.getRaw<{ items: Payment[] }>(`/payments?order_id=${id}`);
    setPayments(res.items || []);
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((data) => { if (!cancelled) setOrder(data); })
      .catch((e: any) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    loadPayments().catch((e: any) => console.error("Failed to load payments:", e));
    return () => { cancelled = true; };
  }, [load, loadPayments]);

  const update = async (status: string) => { setUpdating(true);
    try { await api.patch(`/admin/orders/${id}/status`, { status, reason: reason || undefined }); setMsg(`Updated to ${status.replace(/_/g, " ")}`); setReason(""); setOrder(await load()); }
    catch (e: any) { setError(e.message); }
    finally { setUpdating(false); }
  };

  const handleRefund = async (payment: Payment) => {
    const amount = parseFloat(refundAmounts[payment.id] || "0");
    if (!amount || amount <= 0) { setError("Refund amount must be greater than 0"); return; }
    const available = (payment.captured_amount || 0) - (payment.refunded_amount || 0);
    if (amount > available + 0.001) { setError(`Refund amount cannot exceed ${format(available)}`); return; }
    setRefundLoading(payment.id);
    setError("");
    try {
      await api.post(`/payments/${payment.id}/refund`, {
        amount,
        reason: refundReasons[payment.id] || "Refund from admin",
        reason_category: "customer_request",
      });
      setMsg(`Refund of ${format(amount)} processed`);
      setRefundAmounts((prev) => ({ ...prev, [payment.id]: "" }));
      setRefundReasons((prev) => ({ ...prev, [payment.id]: "" }));
      await loadPayments();
      setOrder(await load());
    } catch (e: unknown) {
      setError(parseApiError(e, "Refund failed"));
    } finally {
      setRefundLoading(null);
    }
  };

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
        <button type="button" onClick={() => r.push("/orders")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <div><h1 className="page-title" style={{ margin: 0 }}>{order.order_number}</h1><p className="page-subtitle" style={{ marginTop: 2 }}>{order.customer_name || "Unknown"} · {dt(order.created_at)}</p></div>
        <div style={{ marginLeft: "auto" }}>{sb(order.status)}</div>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
      {msg && <div className="alert alert-success" style={{ marginBottom: 12 }}>{msg}</div>}

      {next.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 16, display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Update Status:</label>
          {next.map(s => <button type="button" key={s} onClick={() => update(s)} disabled={updating} className="btn btn-sm btn-primary" style={{ fontSize: 12 }}>{s.replace(/_/g, " ")}</button>)}
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (optional)" style={{ padding: "6px 10px", fontSize: 12, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)", minWidth: 160 }} />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 20 }}>
          {[["Order Type", order.order_type?.replace(/_/g, " ")], ["Payment", order.payment_method || "—"], ["Subtotal", format(order.items_subtotal || 0)], ["Tax", format(order.tax_amount)], ["Delivery Fee", format(order.delivery_fee)], ["Discount", format(order.discount_amount)], ["Total", format(order.total_amount)]].map(([l, v]) => (
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
            <tr key={li.id ?? i}>
              <td style={{ fontWeight: 600 }}>{li.item_name || "—"}</td>
              <td style={{ textAlign: "center" }}>{li.quantity}</td>
              <td style={{ textAlign: "right" }}>{format(li.unit_price)}</td>
              <td style={{ textAlign: "right" }}>{format(li.total_price)}</td>
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
              <tr key={adj.id ?? i}>
                <td style={{ textTransform: "capitalize" }}>{adj.adjustment_type?.replace(/_/g, " ")}</td>
                <td style={{ textAlign: "right", color: Number(adj.amount_delta || 0) < 0 ? "var(--color-error)" : "var(--color-success)", fontWeight: 600 }}>{format(adj.amount_delta)}</td>
                <td style={{ fontSize: 12 }}>{adj.reason || "—"}</td>
                <td style={{ fontSize: 12 }}>{dt(adj.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </>)}

      {payments.length > 0 && (
        <>
          <h4 style={{ marginBottom: 8 }}>Payments</h4>
          <div className="table-container" style={{ marginBottom: 20 }}>
            <table className="data-table">
              <thead><tr><th>Provider</th><th>Status</th><th style={{ textAlign: "right" }}>Amount</th><th style={{ textAlign: "right" }}>Captured</th><th style={{ textAlign: "right" }}>Refunded</th><th style={{ width: 220 }}>Refund</th></tr></thead>
              <tbody>
                {payments.map((p) => {
                  const available = (p.captured_amount || 0) - (p.refunded_amount || 0);
                  const canRefund = available > 0.001 && ["captured", "partially_refunded"].includes(p.status);
                  return (
                    <tr key={p.id}>
                      <td style={{ textTransform: "capitalize", fontSize: 12 }}>{p.provider}</td>
                      <td>{sb(p.status)}</td>
                      <td style={{ textAlign: "right" }}>{format(p.amount)}</td>
                      <td style={{ textAlign: "right" }}>{format(p.captured_amount)}</td>
                      <td style={{ textAlign: "right" }}>{format(p.refunded_amount)}</td>
                      <td>
                        {canRefund ? (
                          <div style={{ display: "flex", gap: 6, flexDirection: "column" }}>
                            <div style={{ display: "flex", gap: 6 }}>
                              <input
                                type="number"
                                min={0.01}
                                step={0.01}
                                max={available}
                                placeholder={`Max ${format(available)}`}
                                value={refundAmounts[p.id] || ""}
                                onChange={(e) => setRefundAmounts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                                style={{ width: 90, padding: "4px 8px", fontSize: 12, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}
                              />
                              <button
                                type="button"
                                className="btn btn-sm btn-error"
                                disabled={refundLoading === p.id}
                                onClick={() => handleRefund(p)}
                              >
                                <RotateCcw size={12} /> {refundLoading === p.id ? "..." : "Refund"}
                              </button>
                            </div>
                            <input
                              type="text"
                              placeholder="Refund reason"
                              value={refundReasons[p.id] || ""}
                              onChange={(e) => setRefundReasons((prev) => ({ ...prev, [p.id]: e.target.value }))}
                              style={{ padding: "4px 8px", fontSize: 12, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}
                            />
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {(order.status_log || []).length > 0 && (<>
        <h4 style={{ marginBottom: 8 }}>Status Log</h4>
        <div className="table-container"><table className="data-table">
          <thead><tr><th>Status</th><th>Date</th><th>Reason</th></tr></thead>
          <tbody>{order.status_log.map((sl: any, i: number) => (<tr key={sl.id ?? i}><td>{sb(sl.status)}</td><td style={{ fontSize: 12 }}>{dt(sl.changed_at)}</td><td style={{ fontSize: 12 }}>{sl.reason || "—"}</td></tr>))}</tbody>
        </table></div>
      </>)}
    </div>
  );
}
