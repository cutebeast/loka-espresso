"use client";

import { useTranslation } from "@/hooks/useTranslation";
import { useState } from "react";
import { ShoppingCart, Printer, Archive, Receipt, CheckCircle } from "lucide-react";
import { PaymentMethod } from "./usePosState";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import { openCashDrawer, printReceipt } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
interface PosSuccessScreenProps {
  mode: "new_order" | "checkout";
  result: {
    order_number?: string | number;
    order_id?: string | number;
    total?: number;
    stock_warnings?: string[];
  };
  total: number;
  change: number;
  paymentMethod: PaymentMethod;
  onNewOrder: () => void;
}

function showToast(message: string, type: "success" | "error") {
  window.dispatchEvent(new CustomEvent("pos:toast", { detail: { message, type } }));
}

export default function PosSuccessScreen({
  mode,
  result,
  total,
  change,
  paymentMethod,
  onNewOrder
}: PosSuccessScreenProps) {
  const {
    t
  } = useTranslation();
  const [printing, setPrinting] = useState(false);
  const [kicking, setKicking] = useState(false);

  const handlePrintReceipt = async () => {
    if (!result.order_id || printing) return;
    setPrinting(true);
    try {
      await printReceipt(result.order_id);
      showToast(t("pos.receipt_sent_to_printer"), "success");
    } catch (err: unknown) {
      showToast(parseApiError(err, t("pos.print_failed")), "error");
    } finally {
      setPrinting(false);
    }
  };

  const handleOpenDrawer = async () => {
    if (kicking) return;
    setKicking(true);
    try {
      await openCashDrawer();
      showToast(t("pos.drawer_kick_sent"), "success");
    } catch (err: unknown) {
      showToast(parseApiError(err, t("pos.drawer_kick_failed")), "error");
    } finally {
      setKicking(false);
    }
  };

  return <div style={{
    padding: 24,
    maxWidth: 500,
    margin: "0 auto",
    textAlign: "center"
  }}>
      <div style={{
      fontSize: 56,
      marginBottom: 16,
      color: "var(--color-success)"
    }}><CheckCircle size={56} /></div>
      <h2 style={{
      margin: "0 0 4px"
    }}>{mode === "checkout" ? t("pos.payment_successful") : t("pos.order_sent_to_kitchen")}</h2>
      <p style={{
      fontSize: 14,
      fontWeight: 700,
      margin: 0
    }}>#{result.order_number || result.order_id}</p>
      <p style={{
      fontSize: 13,
      opacity: 0.7,
      margin: "4px 0 0"
    }}>
        {mode === "checkout" ? `${paymentMethod === "stripe_qr" ? "QR" : t(`pos.${paymentMethod}_label`)} ` : `${t("pos.kitchen_notified")} `}{t("pos.total_rm")}{Number(result.total ?? total ?? 0).toFixed(2)}
      </p>
      {change > 0 && <p style={{
      fontSize: 13,
      opacity: 0.7
    }}>{t("pos.change_rm")}{Number(change ?? 0).toFixed(2)}</p>}

      {Array.isArray(result.stock_warnings) && result.stock_warnings.length > 0 && <div style={{
      marginTop: 16,
      padding: 12,
      textAlign: "left",
      fontSize: 13,
      color: "var(--color-warning, #b45309)",
      background: "#FFFBEB",
      border: "1px solid #FCD34D",
      borderRadius: 8
    }}>
          <div style={{
        fontWeight: 700,
        marginBottom: 4
      }}>{t("pos.stock_warnings")}</div>
          {result.stock_warnings.map((w, i) => <div key={i}>{w}</div>)}
        </div>}

      <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 10,
      marginTop: 24
    }}>
        <button type="button" className="btn btn-primary" style={{
        padding: "14px",
        fontSize: 16
      }} onClick={onNewOrder}>
          <ShoppingCart size={18} />{t("pos.new_order")}</button>
        {mode === "checkout" && <>
            <button type="button" className="btn btn-outline" disabled={printing || !result.order_id} onClick={handlePrintReceipt}>
              <Printer size={16} />{printing ? t("common.sending") : t("pos.print_receipt")}</button>
            {paymentMethod === "cash" && <button type="button" className="btn btn-outline" disabled={kicking} onClick={handleOpenDrawer}>
                <Archive size={16} />{kicking ? t("common.sending") : t("pos.open_cash_drawer")}</button>}
          </>}
        {mode === "new_order" && <button type="button" className="btn btn-outline" disabled={!FEATURE_FLAGS.kitchenTicketPrinter} title={t("pos.kitchen_ticket_printing_pending")}>
            <Receipt size={16} />{t("pos.print_kitchen_ticket")}</button>}
      </div>
    </div>;
}