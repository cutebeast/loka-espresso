"use client";

import { RoleGuard, canUseKitchen } from "@/hooks/useStaffRole";
import { useTranslation } from "@/hooks/useTranslation";
import { useState, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { getOrderById, getOrderEinvoice, getOrders, getTables, updateOrderStatus, cancelOrder, transferTable, mergeOrder, OrderDetail, OrderEinvoice, OrderStatus, type Order, type Table } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { usePolling } from "@/hooks/usePolling";
import PageHeader from "@/components/PageHeader";
import Alert from "@/components/Alert";
import Badge, { type BadgeVariant } from "@/components/Badge";
import SkeletonCard from "@/components/SkeletonCard";
import { ArrowLeft, CheckCircle, Clock, Printer, XCircle, MoveRight, Copy, Receipt } from "lucide-react";
const STATUS_FLOW: Record<string, {
  next: OrderStatus[];
  labelKey: string;
  color: BadgeVariant;
}> = {
  pending: {
    next: ["confirmed", "cancelled_by_merchant"],
    labelKey: "staff.status.pending",
    color: "yellow"
  },
  confirmed: {
    next: ["preparing", "cancelled_by_merchant"],
    labelKey: "staff.status.confirmed",
    color: "blue"
  },
  preparing: {
    next: ["ready_for_pickup", "out_for_delivery", "cancelled_by_merchant"],
    labelKey: "staff.status.preparing",
    color: "orange"
  },
  ready_for_pickup: {
    next: ["delivered", "cancelled_by_merchant"],
    labelKey: "staff.status.ready",
    color: "green"
  },
  out_for_delivery: {
    next: ["delivered", "cancelled_by_merchant"],
    labelKey: "staff.status.out_for_delivery",
    color: "blue"
  },
  delivered: {
    next: [],
    labelKey: "staff.status.delivered",
    color: "green"
  },
  cancelled_by_customer: {
    next: [],
    labelKey: "staff.status.cancelled_by_customer",
    color: "red"
  },
  cancelled_by_merchant: {
    next: [],
    labelKey: "staff.status.cancelled_by_merchant",
    color: "red"
  },
  refunded: {
    next: [],
    labelKey: "staff.status.refunded",
    color: "purple"
  },
  partially_refunded: {
    next: [],
    labelKey: "staff.status.partially_refunded",
    color: "yellow"
  },
  disputed: {
    next: [],
    labelKey: "staff.status.disputed",
    color: "orange"
  }
};
export default function KitchenDetailPage() {
  return <RoleGuard allowed={canUseKitchen}>
    <KitchenDetailPageContent />
  </RoleGuard>;
}
function KitchenDetailPageContent() {
  const {
    t
  } = useTranslation();
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
  const [availableTables, setAvailableTables] = useState<Pick<Table, 'id' | 'table_number' | 'current_status'>[]>([]);
  const [transferring, setTransferring] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [mergeCandidates, setMergeCandidates] = useState<Order[]>([]);
  const [merging, setMerging] = useState(false);
  const [einvoice, setEinvoice] = useState<OrderEinvoice | null>(null);
  const [einvoiceQr, setEinvoiceQr] = useState("");
  const [einvoiceCopied, setEinvoiceCopied] = useState(false);
  const load = useCallback(async () => {
    try {
      const data = await getOrderById(id);
      setOrder(data);
      setError("");
    } catch (e: unknown) {
      console.error("Failed to load kitchen order:", e);
      setError(parseApiError(e, "Failed to load order"));
    } finally {
      setLoading(false);
    }
    // E-invoice chip is supplementary — never let it break the order view.
    try {
      setEinvoice(await getOrderEinvoice(id));
    } catch {
      setEinvoice(null);
    }
  }, [id]);
  usePolling(load, [id], {
    interval: 10000
  });
  // Render the MyInvois validation link as a QR (same `qrcode` package the POS
  // payment screens use) so customers can scan it straight off the screen.
  useEffect(() => {
    const link = einvoice?.validation_link;
    if (!link) { setEinvoiceQr(""); return; }
    let cancelled = false;
    import("qrcode").then(QRCode => QRCode.toDataURL(link, { width: 160, margin: 1 })).then(url => {
      if (!cancelled) setEinvoiceQr(url);
    }).catch(() => { if (!cancelled) setEinvoiceQr(""); });
    return () => { cancelled = true; };
  }, [einvoice?.validation_link]);
  const copyEinvoiceLink = async () => {
    if (!einvoice?.validation_link) return;
    try {
      await navigator.clipboard.writeText(einvoice.validation_link);
      setEinvoiceCopied(true);
      setTimeout(() => setEinvoiceCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };
  const handleUpdate = async (status: OrderStatus) => {
    setUpdating(true);
    try {
      // Cancellations must go through the dedicated cancel endpoint (it
      // reverses loyalty/vouchers/stock and blocks captured orders) — the
      // generic status PATCH rejects cancelled_* statuses.
      if (status.includes("cancelled")) {
        await cancelOrder(id, cancelReason || undefined);
      } else {
        await updateOrderStatus(id, status);
      }
      setMsg(t("kitchen.order_updated", { status: t(`staff.status.${status.replace(/-/g, "_")}`) }));
      setCancelReason("");
      const updated = await getOrderById(id);
      setOrder(updated);
    } catch (e: unknown) {
      setError(parseApiError(e, "Failed to update order"));
    } finally {
      setUpdating(false);
    }
  };
  const handleTransfer = async (newTableId: number) => {
    setTransferring(true);
    try {
      await transferTable(id, newTableId);
      setMsg(t("kitchen.table_transferred"));
      setShowTableTransfer(false);
      const updated = await getOrderById(id);
      setOrder(updated);
    } catch (e: unknown) {
      setError(parseApiError(e, "Failed to transfer table"));
    } finally {
      setTransferring(false);
    }
  };
  const loadTables = async () => {
    const storeId = typeof window !== "undefined" ? localStorage.getItem("staffStoreId") : null;
    if (!storeId) {
      setError(t("kitchen.err_store_not_selected"));
      return;
    }
    try {
      const items = await getTables(Number(storeId));
      setAvailableTables(Array.isArray(items) ? items.filter(t => t.current_status === "available") : []);
      setShowTableTransfer(true);
    } catch {
      setError(t("kitchen.err_load_tables"));
    }
  };
  const loadMergeCandidates = async () => {
    try {
      const items = await getOrders();
      const paid = (ps?: string) => ps === "paid" || ps === "captured" || ps === "settled" || ps === "authorized" || ps === "partially_refunded";
      const terminal = ["delivered", "cancelled_by_customer", "cancelled_by_merchant", "refunded", "partially_refunded", "disputed"];
      setMergeCandidates((Array.isArray(items) ? items : []).filter(o => String(o.id) !== String(id) && !paid(o.payment_status) && !terminal.includes(o.status)));
      setShowMerge(true);
    } catch {
      setError(t("kitchen.err_load_merge"));
    }
  };
  const handleMerge = async (targetId: number) => {
    setMerging(true);
    try {
      const res = await mergeOrder(id, targetId);
      setMsg(t("kitchen.merged_into", { order: res.order_number }));
      setShowMerge(false);
      router.push(`/kitchen/${targetId}`);
    } catch (e: unknown) {
      setError(parseApiError(e, "Failed to merge order"));
    } finally {
      setMerging(false);
    }
  };
  const fmt = (v: number) => `${Number(v || 0).toFixed(2)}`;
  const dt = (s: string | null) => {
    if (!s) return "—";
    const d = new Date(s);
    return isNaN(d.getTime()) ? "—" : d.toLocaleString();
  };
  if (loading) {
    return <div style={{
      padding: 24,
      maxWidth: 800,
      margin: "0 auto"
    }}>
        <SkeletonCard count={4} />
      </div>;
  }
  if (!order) {
    return <div style={{
      padding: 24,
      maxWidth: 800,
      margin: "0 auto"
    }}>
        <Alert variant="error">{error || t("kitchen.order_not_found")}</Alert>
        <button className="btn btn-primary" onClick={() => router.push("/orders")} style={{
        marginTop: 16
      }}>
          <ArrowLeft size={16} />{t("kitchen.back_to_orders")}</button>
      </div>;
  }
  const flow = STATUS_FLOW[order.status] || STATUS_FLOW.pending!;
  const statusLabelMap: Record<string, string> = {
    pending: t("kitchen.status_pending"),
    confirmed: t("kitchen.status_confirmed"),
    preparing: t("kitchen.status_preparing"),
    ready_for_pickup: t("kitchen.status_ready"),
    out_for_delivery: t("kitchen.status_out_for_delivery"),
    delivered: t("kitchen.status_delivered"),
    cancelled_by_customer: t("kitchen.status_cancelled_customer"),
    cancelled_by_merchant: t("kitchen.status_cancelled_merchant"),
    refunded: t("kitchen.status_refunded"),
    partially_refunded: t("kitchen.status_partially_refunded"),
    disputed: t("kitchen.status_disputed"),
  };
  return <div style={{
    padding: 24,
    maxWidth: 800,
    margin: "0 auto"
  }}>
      <PageHeader title={order.order_number} subtitle={`${order.customer_name || t("kitchen.walk_in")} · ${dt(order.created_at)}`} back="/orders" action={<Badge variant={flow.color}>{statusLabelMap[order.status] || t(flow.labelKey)}</Badge>} />

      {error && <Alert variant="error" onDismiss={() => setError("")}>{error}</Alert>}
      {msg && <Alert variant="success" onDismiss={() => setMsg("")} autoDismiss={3000}>{msg}</Alert>}

      {/* Status Actions */}
      {flow.next.length > 0 && <div className="card" style={{
      marginBottom: 20
    }}>
          <h4 style={{
        fontSize: 14,
        fontWeight: 700,
        marginBottom: 12
      }}>{t("kitchen.update_status")}</h4>
          <div style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        alignItems: "end"
      }}>
            {flow.next.map(s => <button key={s} onClick={() => handleUpdate(s)} disabled={updating} className={`btn btn-sm ${s.includes("cancelled") ? "btn-danger" : "btn-primary"}`}>
                {s.includes("cancelled") ? <XCircle size={14} /> : <CheckCircle size={14} />}
                {t(`staff.status.${s.replace(/-/g, "_")}`)}
              </button>)}
            {flow.next.some(s => s.includes("cancelled")) && <input className="form-input" style={{
          minWidth: 200
        }} placeholder={t("kitchen.reason_for_cancellation_optional")} value={cancelReason} onChange={e => setCancelReason(e.target.value)} />}
        </div>
      </div>}

      {/* Table Transfer — dine-in only */}
      {order.order_type === "dine_in" && order.dining_table_id && !["delivered", "cancelled_by_customer", "cancelled_by_merchant", "refunded", "partially_refunded", "disputed"].includes(order.status) && <div className="card" style={{
      marginBottom: 20
    }}>
          <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }}>
            <h4 style={{
          fontSize: 14,
          fontWeight: 700,
          margin: 0
        }}>{t("kitchen.table")}<span style={{
            color: "var(--color-primary)"
          }}>{order.table_number || "—"}</span>
            </h4>
            {!showTableTransfer ? <button className="btn btn-sm btn-ghost" onClick={loadTables} disabled={transferring}>
                <MoveRight size={14} />{t("kitchen.transfer")}</button> : <button className="btn btn-sm btn-ghost" onClick={() => setShowTableTransfer(false)}>{t("kitchen.cancel")}</button>}
          </div>
          {showTableTransfer && <div style={{
        marginTop: 12
      }}>
              {availableTables.length === 0 ? <p style={{
          fontSize: 13,
          color: "var(--color-text-muted)"
        }}>{t("kitchen.no_available_tables")}</p> : <div style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap"
        }}>
                  {availableTables.map(t => <button key={t.id} className="btn btn-sm btn-outline" onClick={() => handleTransfer(t.id)} disabled={transferring}>
                      {t.table_number}
                    </button>)}
                </div>}
            </div>}
        </div>}

      {/* Merge into another unpaid order */}
      {!["delivered", "cancelled_by_customer", "cancelled_by_merchant", "refunded", "partially_refunded", "disputed"].includes(order.status) && !["paid", "captured", "settled", "authorized", "partially_refunded"].includes(order.payment_status || "") && <div className="card" style={{
      marginBottom: 20
    }}>
          <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }}>
            <h4 style={{
          fontSize: 14,
          fontWeight: 700,
          margin: 0
        }}>{t("kitchen.merge_order")}</h4>
            {!showMerge ? <button className="btn btn-sm btn-ghost" onClick={loadMergeCandidates} disabled={merging}>
                <MoveRight size={14} />{t("kitchen.merge_into")}</button> : <button className="btn btn-sm btn-ghost" onClick={() => setShowMerge(false)}>{t("kitchen.cancel")}</button>}
          </div>
          {showMerge && <div style={{
        marginTop: 12
      }}>
              {mergeCandidates.length === 0 ? <p style={{
          fontSize: 13,
          color: "var(--color-text-muted)"
        }}>{t("kitchen.no_merge_candidates")}</p> : <div style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap"
        }}>
                  {mergeCandidates.map(o => <button key={o.id} className="btn btn-sm btn-outline" onClick={() => handleMerge(Number(o.id))} disabled={merging}>
                      {o.order_number}{o.table_number ? ` · ${o.table_number}` : ""} · {fmt(Number(o.total_amount))}
                    </button>)}
                </div>}
              <p style={{
          fontSize: 12,
          color: "var(--color-text-muted)",
          marginTop: 8
        }}>{t("kitchen.merge_hint")}</p>
            </div>}
        </div>}

      {/* Order Summary */}
      <div className="card" style={{
      marginBottom: 20
    }}>
        <h4 style={{
        fontSize: 14,
        fontWeight: 700,
        marginBottom: 12
      }}>{t("kitchen.order_summary")}</h4>
        <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 12
      }}>
          {[[t("kitchen.order_type"), order.order_type?.replace(/_/g, " ")], [t("kitchen.payment"), order.payment_method || "—"], [t("kitchen.payment_status"), order.payment_status || "—"], [t("kitchen.subtotal"), fmt(order.items_subtotal || 0)], [t("kitchen.tax"), fmt(order.tax_amount || 0)], [t("kitchen.delivery_fee"), fmt(order.delivery_fee || 0)], [t("kitchen.discount"), fmt(order.discount_amount || 0)], [t("kitchen.total"), fmt(order.total_amount || 0)]].map(([label, value]) => <div key={label as string} style={{
          textAlign: "center",
          padding: 10,
          background: "var(--color-bg-muted)",
          borderRadius: "var(--radius-md)"
        }}>
              <div style={{
            fontSize: 11,
            color: "var(--color-text-muted)",
            marginBottom: 2
          }}>{label}</div>
              <div style={{
            fontSize: 15,
            fontWeight: 700,
            color: label === "Total" ? "var(--color-primary)" : "inherit"
          }}>{value}</div>
            </div>)}
        </div>
      </div>

      {/* E-Invoice (LHDN MyInvois) — shown when a document exists for this order */}
      {einvoice && <div className="card" style={{
      marginBottom: 20
    }}>
          <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap"
      }}>
            <Receipt size={16} style={{
          color: "var(--color-primary)"
        }} />
            <h4 style={{
          fontSize: 14,
          fontWeight: 700,
          margin: 0
        }}>{t("kitchen.einvoice_title")}</h4>
            <Badge variant={einvoice.status === "validated" ? "green" : einvoice.status === "rejected" || einvoice.status === "failed" ? "red" : "yellow"} size="sm">
              {t(`kitchen.einvoice_status_${einvoice.status}`)}
            </Badge>
            <span style={{
          fontSize: 12,
          fontFamily: "monospace",
          color: "var(--color-text-secondary)"
        }}>{einvoice.code_number}</span>
            <span style={{
          fontSize: 12,
          color: "var(--color-text-muted)"
        }}>{einvoice.document_type === "04" ? t("kitchen.einvoice_type_refund") : t("kitchen.einvoice_type_invoice")}</span>
          </div>
          {einvoice.validation_link && <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginTop: 12,
        flexWrap: "wrap"
      }}>
              {einvoiceQr && <img src={einvoiceQr} alt={t("kitchen.einvoice_scan_hint")} width={80} height={80} style={{
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--color-border-light)"
        }} />}
              <div style={{
          flex: 1,
          minWidth: 200
        }}>
                <div style={{
            fontSize: 11,
            color: "var(--color-text-muted)",
            marginBottom: 4
          }}>{t("kitchen.einvoice_scan_hint")}</div>
                <div style={{
            display: "flex",
            gap: 6,
            alignItems: "center"
          }}>
                  <a href={einvoice.validation_link} target="_blank" rel="noopener noreferrer" style={{
              fontSize: 12,
              color: "var(--color-primary)",
              wordBreak: "break-all",
              flex: 1
            }}>{einvoice.validation_link}</a>
                  <button className="btn btn-sm btn-outline" onClick={copyEinvoiceLink}>
                    <Copy size={12} />{einvoiceCopied ? t("kitchen.einvoice_copied") : t("kitchen.einvoice_copy_link")}</button>
                </div>
              </div>
            </div>}
        </div>}

      {/* Line Items */}
      <div className="card" style={{
      marginBottom: 20
    }}>
        <h4 style={{
        fontSize: 14,
        fontWeight: 700,
        marginBottom: 12
      }}>{t("kitchen.line_items")}</h4>
        <div className="table-container" style={{
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--color-border-light)"
      }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("kitchen.item")}</th>
                <th style={{
                textAlign: "center"
              }}>{t("kitchen.qty")}</th>
                <th style={{
                textAlign: "right"
              }}>{t("kitchen.unit_price")}</th>
                <th style={{
                textAlign: "right"
              }}>{t("kitchen.total")}</th>
              </tr>
            </thead>
            <tbody>
              {(order.line_items || order.items || []).map(li => <tr key={`${li.menu_item_id || li.id || li.item_name}-${li.modifiers_label || "none"}`}>
                  <td style={{
                fontWeight: 600
              }}>
                    {li.item_name || li.name || "—"}
                    {li.notes && <div style={{
                  fontSize: 12,
                  color: "var(--color-text-muted)",
                  fontWeight: 400
                }}>{t("kitchen.note")}{li.notes}</div>}
                    {li.modifiers_label && <div style={{
                  fontSize: 12,
                  color: "var(--color-text-muted)",
                  fontWeight: 400
                }}>{li.modifiers_label}</div>}
                  </td>
                  <td style={{
                textAlign: "center"
              }}>{li.quantity}</td>
                  <td style={{
                textAlign: "right"
              }}>{fmt(li.unit_price || li.price || 0)}</td>
                  <td style={{
                textAlign: "right"
              }}>{fmt((li.unit_price || li.price || 0) * li.quantity)}</td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </div>

      {/* Status Timeline */}
      {(order.status_log || []).length > 0 && <div className="card" style={{
      marginBottom: 20
    }}>
          <h4 style={{
        fontSize: 14,
        fontWeight: 700,
        marginBottom: 16
      }}>{t("kitchen.status_timeline")}</h4>
          <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 0
      }}>
            {(order.status_log || []).map((sl, i, arr) => {
          const isLast = i === arr.length - 1;
          return <div key={`${sl.to_status}-${sl.created_at || i}`} style={{
            display: "flex",
            gap: 12
          }}>
                  <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center"
            }}>
                    <div style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: isLast ? "var(--color-primary)" : "var(--color-border-light)",
                border: `2px solid ${isLast ? "var(--color-primary)" : "var(--color-border-light)"}`
              }} />
                    {!isLast && <div style={{
                width: 2,
                flex: 1,
                background: "var(--color-border-light)",
                margin: "4px 0"
              }} />}
                  </div>
                  <div style={{
              paddingBottom: isLast ? 0 : 16
            }}>
                    <Badge variant={STATUS_FLOW[sl.to_status]?.color || "gray"} size="sm">
                      {statusLabelMap[sl.to_status] || sl.to_status?.replace(/_/g, " ")}
                    </Badge>
                    <div style={{
                fontSize: 12,
                color: "var(--color-text-muted)",
                marginTop: 4
              }}>
                      <Clock size={10} style={{
                  display: "inline",
                  marginRight: 4
                }} />
                      {dt(sl.created_at)}
                      {sl.actor_type && <>{t("kitchen.by")}{sl.actor_type}{sl.actor_id ? ` #${sl.actor_id}` : ""}</>}
                    </div>
                    {sl.reason && <div style={{
                fontSize: 12,
                color: "var(--color-text-secondary)",
                marginTop: 2
              }}>{t("kitchen.reason")}{sl.reason}</div>}
                  </div>
                </div>;
        })}
          </div>
        </div>}

      {/* Print Ticket */}
      <div style={{
      display: "flex",
      gap: 8
    }}>
        <button className="btn btn-outline" disabled title={t("kitchen.printer_integration_pending")}>
          <Printer size={16} />{t("kitchen.print_kitchen_ticket")}</button>
      </div>
    </div>;
}