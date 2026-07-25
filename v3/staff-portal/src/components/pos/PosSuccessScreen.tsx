"use client";

import { useTranslation } from "@/hooks/useTranslation";
import { ShoppingCart, Printer, Archive, Receipt, CheckCircle } from "lucide-react";
import { PaymentMethod } from "./usePosState";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
interface PosSuccessScreenProps {
  mode: "new_order" | "checkout";
  result: {
    order_number?: string | number;
    order_id?: string | number;
    total?: number;
  };
  total: number;
  change: number;
  paymentMethod: PaymentMethod;
  onNewOrder: () => void;
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
            <button type="button" className="btn btn-outline" disabled={!FEATURE_FLAGS.printer} title={t("pos.printer_integration_pending")}>
              <Printer size={16} />{t("pos.print_receipt")}</button>
            {paymentMethod === "cash" && <button type="button" className="btn btn-outline" disabled={!FEATURE_FLAGS.cashDrawer} title={t("pos.cash_drawer_integration_pending")}>
                <Archive size={16} />{t("pos.open_cash_drawer")}</button>}
          </>}
        {mode === "new_order" && <button type="button" className="btn btn-outline" disabled={!FEATURE_FLAGS.kitchenTicketPrinter} title={t("pos.kitchen_ticket_printing_pending")}>
            <Receipt size={16} />{t("pos.print_kitchen_ticket")}</button>}
      </div>
    </div>;
}