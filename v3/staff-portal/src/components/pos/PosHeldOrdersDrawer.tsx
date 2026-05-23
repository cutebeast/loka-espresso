"use client";

import Drawer from "@/components/Drawer";
import EmptyState from "@/components/EmptyState";
import { RotateCcw, Trash2 } from "lucide-react";
import { type CartItem, type Table } from "@/lib/api";
import { type HeldOrder } from "./usePosState";

interface PosHeldOrdersDrawerProps {
  open: boolean;
  orders: HeldOrder[];
  tables: Table[];
  onClose: () => void;
  onRecall: (held: HeldOrder) => void;
  onDelete: (id: string) => void;
}

export default function PosHeldOrdersDrawer({ open, orders, tables, onClose, onRecall, onDelete }: PosHeldOrdersDrawerProps) {
  return (
    <Drawer open={open} onClose={onClose} title="Parked Orders" position="bottom">
      {orders.length === 0 ? (
        <EmptyState title="No parked orders" description="Orders you park will appear here for up to 2 hours." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {orders.map((held) => (
            <div key={held.id} className="card" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{held.crewName}</span>
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{(() => { const d = new Date(held.createdAt); return isNaN(d.getTime()) ? "—" : d.toLocaleTimeString(); })()}</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 8 }}>
                {held.cart.length} items · RM {(() => { const sum = held.cart.reduce((s: number, ci: CartItem) => s + ((ci.price != null && !isNaN(ci.price) ? ci.price : 0)) * ci.qty, 0); return isNaN(sum) ? "0.00" : sum.toFixed(2); })()} · {held.orderType.replace("_", "-")}
                {held.tableId && ` · Table ${tables.find((t) => t.id === held.tableId)?.table_number || held.tableId}`}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-sm btn-primary flex-1" onClick={() => onRecall(held)}><RotateCcw size={14} /> Recall</button>
                <button className="btn btn-sm btn-danger" onClick={() => onDelete(held.id)} aria-label="Delete held order"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
}
