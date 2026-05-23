"use client";

import { OrderStatus, ReservationStatus } from "@/lib/api";

const STATUS_MAP: Record<string, { label: string; variant: "green" | "yellow" | "red" | "blue" | "gray" | "orange" }> = {
  pending: { label: "Pending", variant: "yellow" },
  confirmed: { label: "Confirmed", variant: "blue" },
  preparing: { label: "Preparing", variant: "orange" },
  ready_for_pickup: { label: "Ready", variant: "green" },
  out_for_delivery: { label: "Out for Delivery", variant: "blue" },
  delivered: { label: "Delivered", variant: "green" },
  cancelled_by_customer: { label: "Cancelled", variant: "red" },
  cancelled_by_merchant: { label: "Cancelled", variant: "red" },
  refunded: { label: "Refunded", variant: "gray" },
  partially_refunded: { label: "Partial Refund", variant: "gray" },
  disputed: { label: "Disputed", variant: "orange" },
  // Legacy aliases
  ready: { label: "Ready", variant: "green" },
  completed: { label: "Completed", variant: "green" },
  cancelled: { label: "Cancelled", variant: "red" },
  requested: { label: "Requested", variant: "yellow" },
  seated: { label: "Seated", variant: "blue" },
  no_show: { label: "No Show", variant: "red" },
  available: { label: "Available", variant: "green" },
  occupied: { label: "Occupied", variant: "red" },
  reserved: { label: "Reserved", variant: "yellow" },
  cleaning: { label: "Cleaning", variant: "gray" },
  cancelled_by_guest: { label: "Cancelled", variant: "red" },
};

const STATUS_COLORS: Record<string, string> = {
  green: "badge-green",
  yellow: "badge-yellow",
  red: "badge-red",
  blue: "badge-blue",
  gray: "badge-gray",
  orange: "badge-orange",
};

interface StatusBadgeProps {
  status: OrderStatus | ReservationStatus | string;
  className?: string;
}

export default function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const safeStatus = status == null ? "" : String(status);
  const mapped = STATUS_MAP[safeStatus] || { label: safeStatus.replace(/_/g, " "), variant: "gray" as const };

  return (
    <span className={`badge badge-sm ${STATUS_COLORS[mapped.variant]} ${className}`}>
      {mapped.label}
    </span>
  );
}
