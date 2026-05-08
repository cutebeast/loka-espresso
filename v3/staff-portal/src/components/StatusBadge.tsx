"use client";

import { OrderStatus, ReservationStatus } from "@/lib/api";

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-amber-100", text: "text-amber-800", label: "Pending" },
  confirmed: { bg: "bg-blue-100", text: "text-blue-800", label: "Confirmed" },
  preparing: { bg: "bg-amber-100", text: "text-amber-800", label: "Preparing" },
  ready: { bg: "bg-green-100", text: "text-green-800", label: "Ready" },
  completed: { bg: "bg-slate-100", text: "text-slate-800", label: "Completed" },
  cancelled: { bg: "bg-red-100", text: "text-red-800", label: "Cancelled" },
  available: { bg: "bg-green-100", text: "text-green-800", label: "Available" },
  occupied: { bg: "bg-red-100", text: "text-red-800", label: "Occupied" },
  reserved: { bg: "bg-amber-100", text: "text-amber-800", label: "Reserved" },
  requested: { bg: "bg-amber-100", text: "text-amber-800", label: "Requested" },
  seated: { bg: "bg-blue-100", text: "text-blue-800", label: "Seated" },
  no_show: { bg: "bg-red-100", text: "text-red-800", label: "No Show" },
};

export default function StatusBadge({ status }: { status: OrderStatus | ReservationStatus | string }) {
  const config = statusConfig[status] || { bg: "bg-gray-100", text: "text-gray-800", label: status };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}
