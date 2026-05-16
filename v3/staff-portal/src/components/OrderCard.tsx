"use client";
import Link from "next/link";
import { Order } from "@/lib/api";
import StatusBadge from "./StatusBadge";
import { Clock, ShoppingBag, User, AlertTriangle } from "lucide-react";

function timeSince(dateString: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function urgencyLevel(order: Order): "normal" | "warning" | "critical" | "overdue" {
  const elapsed = Date.now() - new Date(order.created_at).getTime();
  const mins = elapsed / 60000;
  if (mins > 15) return "overdue";
  if (mins > 10) return "critical";
  if (mins > 5) return "warning";
  return "normal";
}

const urgencyStyles: Record<string, string> = {
  normal: "border-gray-200",
  warning: "border-yellow-400 bg-yellow-50/30",
  critical: "border-red-400 bg-red-50/30",
  overdue: "border-red-500 bg-red-50 ring-2 ring-red-300 animate-pulse",
};

export default function OrderCard({ order }: { order: Order }) {
  const urgency = urgencyLevel(order);

  return (
    <Link href={`/kitchen/${order.id}`}>
      <div className={`bg-white rounded-lg border p-4 shadow-sm hover:shadow-md transition cursor-pointer ${urgencyStyles[urgency]}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {urgency === "overdue" && <AlertTriangle size={16} className="text-red-600" />}
            <ShoppingBag size={16} className="text-gray-500" />
            <span className="font-semibold text-sm">{order.order_number}</span>
          </div>
          <StatusBadge status={order.status} />
        </div>

        <div className="space-y-2 mb-3">
          {order.items.slice(0, 4).map((item) => (
            <div key={item.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-700">
                <span className="font-medium">{item.quantity}x</span> {item.name}
              </span>
            </div>
          ))}
          {order.items.length > 4 && (
            <p className="text-xs text-gray-400">+{order.items.length - 4} more items</p>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-xs">
          <div className="flex items-center gap-1">
            <Clock size={12} />
            <span className={urgency === "critical" || urgency === "overdue" ? "text-red-600 font-bold" : urgency === "warning" ? "text-yellow-700 font-medium" : "text-gray-500"}>
              {timeSince(order.created_at)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {order.customer_name && (
              <span className="flex items-center gap-1">
                <User size={12} />
                {order.customer_name}
              </span>
            )}
            <span className="font-semibold text-gray-700">RM {order.total.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
