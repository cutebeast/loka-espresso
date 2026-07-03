"use client";

import { useEffect, useState } from "react";
import { ShoppingCart, Printer, Archive, Receipt, CheckCircle } from "lucide-react";
import { PaymentMethod } from "./usePosState";
import { FEATURE_FLAGS, showFeatureToast } from "@/lib/featureFlags";

interface PosSuccessScreenProps {
  mode: "new_order" | "checkout";
  result: { order_number?: string | number; order_id?: string | number; total?: number };
  total: number;
  change: number;
  paymentMethod: PaymentMethod;
  onNewOrder: () => void;
}

export default function PosSuccessScreen({ mode, result, total, change, paymentMethod, onNewOrder }: PosSuccessScreenProps) {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const { message } = (e as CustomEvent<{ message: string }>).detail;
      setToast(message);
      setTimeout(() => setToast(null), 3000);
    };
    window.addEventListener("pos:toast", handler);
    return () => window.removeEventListener("pos:toast", handler);
  }, []);

  return (
    <div style={{ padding: 24, maxWidth: 500, margin: "0 auto", textAlign: "center" }}>
      <div style={{ fontSize: 56, marginBottom: 16, color: "var(--color-success)" }}><CheckCircle size={56} /></div>
      <h2 style={{ margin: "0 0 4px" }}>{mode === "checkout" ? "Payment Successful" : "Order Sent to Kitchen"}</h2>
      <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>#{result.order_number || result.order_id}</p>
      <p style={{ fontSize: 13, opacity: 0.7, margin: "4px 0 0" }}>
        {mode === "checkout" ? `${paymentMethod === "stripe_qr" ? "QR" : paymentMethod.toUpperCase()}` : "Kitchen notified"} · Total: RM {(result.total ?? total).toFixed(2)}
      </p>
      {change > 0 && <p style={{ fontSize: 13, opacity: 0.7 }}>Change: RM {change.toFixed(2)}</p>}

      {toast && (
        <div className="alert alert-info" style={{ marginBottom: 16, textAlign: "center" }}>{toast}</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
        <button type="button" className="btn btn-primary" style={{ padding: "14px", fontSize: 16 }} onClick={onNewOrder}>
          <ShoppingCart size={18} /> New Order
        </button>
        {mode === "checkout" && (
          <>
            <button type="button" className="btn btn-outline" onClick={() => FEATURE_FLAGS.printer ? window.print() : showFeatureToast("Printer")} title="Printer integration pending">
              <Printer size={16} /> Print Receipt
            </button>
            {paymentMethod === "cash" && (
              <button type="button" className="btn btn-outline" onClick={() => FEATURE_FLAGS.cashDrawer ? console.warn("Cash drawer: open") : showFeatureToast("Cash Drawer")} title="Cash drawer integration pending">
                <Archive size={16} /> Open Cash Drawer
              </button>
            )}
          </>
        )}
        {mode === "new_order" && (
          <button type="button" className="btn btn-outline" onClick={() => FEATURE_FLAGS.kitchenTicketPrinter ? window.print() : showFeatureToast("Kitchen Ticket Printer")} title="Kitchen ticket printing pending">
            <Receipt size={16} /> Print Kitchen Ticket
          </button>
        )}
      </div>
    </div>
  );
}
