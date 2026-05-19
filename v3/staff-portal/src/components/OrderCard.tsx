"use client";

import { Order, OrderStatus } from "@/lib/api";
import StatusBadge from "./StatusBadge";
import Timer from "./Timer";
import { Clock, ShoppingBag, User, AlertTriangle, UtensilsCrossed, Package, Truck, ChevronRight } from "lucide-react";

interface OrderCardProps {
  order: Order;
  onClick?: (order: Order) => void;
  onQuickAction?: (order: Order, nextStatus: OrderStatus) => void;
  compact?: boolean;
}

function urgencyLevel(order: Order): "normal" | "warning" | "critical" | "overdue" {
  const createdAt = new Date(order.created_at).getTime();
  if (isNaN(createdAt)) return "normal";
  const elapsed = Date.now() - createdAt;
  const mins = elapsed / 60000;
  // Different thresholds per order type
  const thresholds = {
    dine_in: { warning: 10, critical: 15, overdue: 20 },
    takeaway: { warning: 8, critical: 12, overdue: 18 },
    delivery: { warning: 12, critical: 18, overdue: 25 },
  };
  const t = thresholds[order.order_type as keyof typeof thresholds] || thresholds.dine_in;
  if (mins > t.overdue) return "overdue";
  if (mins > t.critical) return "critical";
  if (mins > t.warning) return "warning";
  return "normal";
}

const urgencyStyles: Record<string, string> = {
  normal: "border-gray-200",
  warning: "border-yellow-400 bg-yellow-50/30",
  critical: "border-red-400 bg-red-50/30",
  overdue: "border-red-500 bg-red-50 ring-2 ring-red-300 animate-pulse",
};

const typeIcons: Record<string, React.ReactNode> = {
  dine_in: <UtensilsCrossed size={14} />,
  takeaway: <Package size={14} />,
  delivery: <Truck size={14} />,
};

const typeLabels: Record<string, string> = {
  dine_in: "Dine-in",
  takeaway: "Takeaway",
  delivery: "Delivery",
};

function isPaid(ps?: string): boolean {
  return ps === "paid" || ps === "captured" || ps === "settled" || ps === "authorized";
}

function paymentIndicator(order: Order): { color: string; label: string } | null {
  if (isPaid(order.payment_status)) return { color: "#16A34A", label: "Paid" };
  if (order.order_type === "dine_in") return { color: "#D97706", label: "Unpaid" };
  return { color: "#DC2626", label: "NEEDS PAYMENT" };
}

const nextMap: Partial<Record<OrderStatus, OrderStatus | null>> = {
  pending: "confirmed",
  confirmed: "preparing",
  preparing: "ready_for_pickup",
  ready_for_pickup: "delivered",
  delivered: null,
  cancelled_by_customer: null,
  cancelled_by_merchant: null,
};

export default function OrderCard({ order, onClick, onQuickAction, compact = false }: OrderCardProps) {
  const urgency = urgencyLevel(order);
  const next = nextMap[order.status];
  const orderType = order.order_type as keyof typeof typeLabels;
  const typeLabel = typeLabels[orderType] || order.order_type;
  const typeIcon = typeIcons[orderType] || null;
  const payInd = paymentIndicator(order);

  const items = order.items || order.line_items || [];
  const visibleItems = items.slice(0, compact ? 2 : 4);
  const hiddenCount = items.length - visibleItems.length;

  return (
    <div
      role="button"
      tabIndex={0}
      className={`bg-white rounded-xl border p-4 shadow-sm hover:shadow-md transition cursor-pointer ${urgencyStyles[urgency]} ${compact ? "" : "mb-3"}`}
      onClick={() => onClick?.(order)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(order); } }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          {urgency === "overdue" && <AlertTriangle size={16} className="text-red-600" />}
          <ShoppingBag size={16} className="text-gray-500" />
          <span className="font-semibold text-sm">{order.order_number}</span>
          <span className="badge badge-sm badge-outline flex items-center gap-1">
            {typeIcon}
            {typeLabel}
          </span>
          {order.table_number && (
            <span className="badge badge-sm badge-primary">Table {order.table_number}</span>
          )}
          {payInd && (
            <span className="badge badge-sm flex items-center gap-1" style={{ background: payInd.color + "15", color: payInd.color, borderColor: payInd.color + "40" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: payInd.color, display: "inline-block" }} />
              {payInd.label}
            </span>
          )}
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="space-y-2 mb-3">
        {visibleItems.map((item) => (
          <div key={item.id} className="flex items-center justify-between text-sm">
            <span className="text-gray-700">
              <span className="font-medium">{item.quantity}x</span> {item.name}
              {item.modifiers_label && <span className="text-gray-400 text-xs ml-1">({item.modifiers_label})</span>}
            </span>
          </div>
        ))}
        {hiddenCount > 0 && (
          <p className="text-xs text-gray-400">+{hiddenCount} more items</p>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <Clock size={12} />
            <span className={urgency === "critical" || urgency === "overdue" ? "text-red-600 font-bold" : urgency === "warning" ? "text-yellow-700 font-medium" : "text-gray-500"}>
              <Timer startTime={order.created_at} />
            </span>
          </div>
          {order.customer_name && (
            <span className="flex items-center gap-1">
              <User size={12} />
              {order.customer_name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-semibold text-gray-700">RM {typeof order.total_amount === "number" ? order.total_amount.toFixed(2) : "0.00"}</span>
          {next && onQuickAction && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onQuickAction(order, next); }}
              className="btn btn-sm btn-primary"
            >
              {next.replace(/_/g, " ")}
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
