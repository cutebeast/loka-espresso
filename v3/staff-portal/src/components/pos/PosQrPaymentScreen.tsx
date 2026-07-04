"use client";

import { useEffect, useState, useRef } from "react";
import { getOrderById } from "@/lib/api";
import { Smartphone, Loader2, XCircle, CheckCircle } from "lucide-react";

interface PosQrPaymentScreenProps {
  paymentUrl: string;
  orderId: string;
  orderNumber?: string;
  total: number;
  onComplete: (result: { order_id: string; order_number?: string; total: number }) => void;
  onCancel: () => void;
  onError?: (message: string) => void;
}

export default function PosQrPaymentScreen({
  paymentUrl,
  orderId,
  orderNumber,
  total,
  onComplete,
  onCancel,
  onError,
}: PosQrPaymentScreenProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"pending" | "paid" | "failed">("pending");
  const [error, setError] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completeRef = useRef(false);
  const startedAtRef = useRef<number>(0);

  // Generate QR image from the Stripe Checkout URL.
  useEffect(() => {
    let mounted = true;
    import("qrcode")
      .then((QRCode) =>
        QRCode.toDataURL(paymentUrl, {
          width: 280,
          margin: 2,
          color: { dark: "#2C1E16", light: "#FFFFFF" },
          errorCorrectionLevel: "M",
        })
      )
      .then((url) => {
        if (mounted) setQrDataUrl(url);
      })
      .catch((e) => {
        if (mounted) setError("Failed to generate QR code");
        console.error(e);
      });
    return () => {
      mounted = false;
    };
  }, [paymentUrl]);

  // Poll order payment status until captured, failed, or timed out.
  useEffect(() => {
    const POLL_INTERVAL_MS = 3000;
    const TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
    startedAtRef.current = Date.now();

    const stopPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const check = async () => {
      try {
        if (Date.now() - startedAtRef.current > TIMEOUT_MS) {
          setStatus("failed");
          const msg = "Payment session expired";
          setError(msg);
          onError?.(msg);
          stopPolling();
          return;
        }

        const order = await getOrderById(orderId);
        const ps = order.payment_status;
        if (ps === "captured" || ps === "paid" || ps === "settled" || ps === "authorized") {
          setStatus("paid");
          if (!completeRef.current) {
            completeRef.current = true;
            onComplete({ order_id: orderId, order_number: orderNumber || order.order_number, total });
          }
          stopPolling();
        } else if (ps === "failed" || ps === "voided" || ps === "refunded" || ps?.includes("cancelled")) {
          setStatus("failed");
          const msg = `Payment ${ps}`;
          setError(msg);
          onError?.(msg);
          stopPolling();
        }
      } catch (e: unknown) {
        console.error("QR payment polling failed:", e);
      }
    };

    check();
    intervalRef.current = setInterval(check, POLL_INTERVAL_MS);
    return stopPolling;
  }, [orderId, orderNumber, total, onComplete, onError]);

  return (
    <div style={{ padding: 24, maxWidth: 520, margin: "0 auto", textAlign: "center" }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Scan to Pay</h2>
      {orderNumber && <p style={{ color: "var(--color-text-muted)", marginBottom: 16 }}>Order {orderNumber}</p>}
      <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>RM {total.toFixed(2)}</div>

      <div
        style={{
          width: 280,
          height: 280,
          margin: "0 auto 24px",
          background: "white",
          borderRadius: "var(--radius-md)",
          padding: 12,
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="Payment QR code" style={{ width: "100%", height: "100%" }} />
        ) : (
          <div style={{ color: "var(--color-text-muted)" }}>
            <Loader2 size={48} style={{ animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
            <p>Generating QR...</p>
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 24 }}>
        {status === "paid" ? (
          <>
            <CheckCircle size={20} color="var(--color-success)" />
            <span style={{ color: "var(--color-success)", fontWeight: 700 }}>Payment confirmed</span>
          </>
        ) : status === "failed" ? (
          <>
            <XCircle size={20} color="var(--color-error)" />
            <span style={{ color: "var(--color-error)", fontWeight: 700 }}>{error || "Payment failed"}</span>
          </>
        ) : (
          <>
            <Smartphone size={20} color="var(--color-info)" />
            <span style={{ color: "var(--color-text-muted)" }}>Waiting for customer to scan and pay...</span>
          </>
        )}
      </div>

      {status !== "paid" && (
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel QR Payment
        </button>
      )}
    </div>
  );
}
