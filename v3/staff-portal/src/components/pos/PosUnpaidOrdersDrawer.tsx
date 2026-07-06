"use client";

import { useTranslation } from "@/hooks/useTranslation";
import Drawer from "@/components/Drawer";
import EmptyState from "@/components/EmptyState";
import { type Order } from "@/lib/api";
import { useRouter } from "next/navigation";
interface PosUnpaidOrdersDrawerProps {
  open: boolean;
  orders: Order[];
  loading: boolean;
  onClose: () => void;
}
export default function PosUnpaidOrdersDrawer({
  open,
  orders,
  loading,
  onClose
}: PosUnpaidOrdersDrawerProps) {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const takeaway = orders.filter(o => (o as {
    order_type?: string;
  }).order_type !== "dine_in");
  const dineIn = orders.filter(o => (o as {
    order_type?: string;
  }).order_type === "dine_in");
  return <Drawer open={open} onClose={onClose} title={t("pos.unpaid_orders")} position="bottom">
      {loading ? <div style={{
      padding: 20,
      textAlign: "center"
    }}>{t("pos.loading")}</div> : orders.length === 0 ? <EmptyState title={t("pos.all_paid_up")} description={t("pos.no_unpaid_orders_right_now")} /> : <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 12
    }}>
          {takeaway.length > 0 && <div>
              <h4 style={{
          fontSize: 13,
          fontWeight: 700,
          color: "#DC2626",
          marginBottom: 8
        }}>{t("pos.needs_payment_do_not_hand_over")}</h4>
              <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 8
        }}>
                {takeaway.map(order => <div key={order.id} className="card" style={{
            padding: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
                    <div>
                      <div style={{
                fontWeight: 600,
                fontSize: 14
              }}>{(order as {
                  order_number?: string;
                }).order_number}</div>
                      <div style={{
                fontSize: 12,
                color: "var(--color-text-muted)"
              }}>
                        {(order as {
                  order_type?: string;
                }).order_type === "takeaway" ? "Takeaway" : "Delivery"} · {(order as {
                  customer_name?: string;
                }).customer_name || "Walk-in"} · {(order as {
                  item_count?: number;
                }).item_count}{t("pos.items")}</div>
                    </div>
                    <div style={{
              textAlign: "right"
            }}>
                      <div style={{
                fontWeight: 700
              }}>{t("pos.rm")}{((order as {
                  total_amount?: number;
                }).total_amount ?? 0).toFixed(2)}</div>
                      <button className="btn btn-sm btn-primary" style={{
                marginTop: 4
              }} onClick={() => {
                onClose();
                router.push(`/pos?checkout=${order.id}`);
              }}>{t("pos.checkout")}</button>
                    </div>
                  </div>)}
              </div>
            </div>}
          {dineIn.length > 0 && <div>
              <h4 style={{
          fontSize: 13,
          fontWeight: 700,
          color: "#D97706",
          marginBottom: 8
        }}>{t("pos.dine_in_checks_pay_after_meal")}</h4>
              <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 8
        }}>
                {dineIn.map(order => <div key={order.id} className="card" style={{
            padding: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
                    <div>
                      <div style={{
                fontWeight: 600,
                fontSize: 14
              }}>{(order as {
                  order_number?: string;
                }).order_number}</div>
                      <div style={{
                fontSize: 12,
                color: "var(--color-text-muted)"
              }}>{t("pos.dine_in")}{(order as {
                  customer_name?: string;
                }).customer_name || "Walk-in"} · {(order as {
                  table_number?: string;
                }).table_number ? `Table ${(order as {
                  table_number?: string;
                }).table_number}` : "No table"}
                      </div>
                    </div>
                    <div style={{
              textAlign: "right"
            }}>
                      <div style={{
                fontWeight: 700
              }}>{t("pos.rm_2")}{((order as {
                  total_amount?: number;
                }).total_amount ?? 0).toFixed(2)}</div>
                      <button className="btn btn-sm btn-primary" style={{
                marginTop: 4
              }} onClick={() => {
                onClose();
                router.push(`/pos?checkout=${order.id}`);
              }}>{t("pos.checkout_2")}</button>
                    </div>
                  </div>)}
              </div>
            </div>}
        </div>}
    </Drawer>;
}