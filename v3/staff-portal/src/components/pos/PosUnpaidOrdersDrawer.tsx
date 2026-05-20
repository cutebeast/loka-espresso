"use client";

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

export default function PosUnpaidOrdersDrawer({ open, orders, loading, onClose }: PosUnpaidOrdersDrawerProps) {
  const router = useRouter();

  const takeaway = orders.filter((o) => (o as { order_type?: string }).order_type !== "dine_in");
  const dineIn = orders.filter((o) => (o as { order_type?: string }).order_type === "dine_in");

  return (
    <Drawer open={open} onClose={onClose} title="Unpaid Orders" position="bottom">
      {loading ? (
        <div style={{ padding: 20, textAlign: "center" }}>Loading...</div>
      ) : orders.length === 0 ? (
        <EmptyState title="All paid up" description="No unpaid orders right now." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {takeaway.length > 0 && (
            <div>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: "#DC2626", marginBottom: 8 }}>Needs Payment (Do Not Hand Over)</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {takeaway.map((order) => (
                  <div key={order.id} className="card" style={{ padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{(order as { order_number?: string }).order_number}</div>
                      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                        {(order as { order_type?: string }).order_type === "takeaway" ? "Takeaway" : "Delivery"} · {(order as { customer_name?: string }).customer_name || "Walk-in"} · {(order as { item_count?: number }).item_count} items
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700 }}>RM {((order as { total_amount?: number }).total_amount ?? 0).toFixed(2)}</div>
                      <button className="btn btn-sm btn-primary" style={{ marginTop: 4 }} onClick={() => { onClose(); router.push(`/pos?checkout=${order.id}`); }}>
                        Checkout
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {dineIn.length > 0 && (
            <div>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: "#D97706", marginBottom: 8 }}>Dine-in Checks (Pay After Meal)</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {dineIn.map((order) => (
                  <div key={order.id} className="card" style={{ padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{(order as { order_number?: string }).order_number}</div>
                      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                        Dine-in · {(order as { customer_name?: string }).customer_name || "Walk-in"} · {(order as { table_number?: string }).table_number ? `Table ${(order as { table_number?: string }).table_number}` : "No table"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700 }}>RM {((order as { total_amount?: number }).total_amount ?? 0).toFixed(2)}</div>
                      <button className="btn btn-sm btn-primary" style={{ marginTop: 4 }} onClick={() => { onClose(); router.push(`/pos?checkout=${order.id}`); }}>
                        Checkout
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
