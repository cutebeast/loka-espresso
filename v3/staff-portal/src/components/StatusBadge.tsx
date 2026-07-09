"use client";

import { useTranslation } from "@/hooks/useTranslation";
import { OrderStatus, ReservationStatus } from "@/lib/api";

const STATUS_MAP: Record<string, { labelKey: string; variant: "green" | "yellow" | "red" | "blue" | "gray" | "orange" }> = {
  pending: { labelKey: "staff.status.pending", variant: "yellow" },
  confirmed: { labelKey: "staff.status.confirmed", variant: "blue" },
  preparing: { labelKey: "staff.status.preparing", variant: "orange" },
  ready_for_pickup: { labelKey: "staff.status.ready", variant: "green" },
  out_for_delivery: { labelKey: "staff.status.out_for_delivery", variant: "blue" },
  delivered: { labelKey: "staff.status.delivered", variant: "green" },
  cancelled_by_customer: { labelKey: "staff.status.cancelled_by_customer", variant: "red" },
  cancelled_by_merchant: { labelKey: "staff.status.cancelled_by_merchant", variant: "red" },
  refunded: { labelKey: "staff.status.refunded", variant: "gray" },
  partially_refunded: { labelKey: "staff.status.partially_refunded", variant: "gray" },
  disputed: { labelKey: "staff.status.disputed", variant: "orange" },
  // Legacy aliases
  ready: { labelKey: "staff.status.ready", variant: "green" },
  completed: { labelKey: "staff.status.completed", variant: "green" },
  cancelled: { labelKey: "staff.status.cancelled", variant: "red" },
  requested: { labelKey: "staff.status.requested", variant: "yellow" },
  seated: { labelKey: "staff.status.seated", variant: "blue" },
  no_show: { labelKey: "staff.status.no_show", variant: "red" },
  available: { labelKey: "staff.status.available", variant: "green" },
  occupied: { labelKey: "staff.status.occupied", variant: "red" },
  reserved: { labelKey: "staff.status.reserved", variant: "yellow" },
  cleaning: { labelKey: "staff.status.cleaning", variant: "gray" },
  cancelled_by_guest: { labelKey: "staff.status.cancelled", variant: "red" },
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
  const { t } = useTranslation();
  const safeStatus = status == null ? "" : String(status);
  const normalizedStatus = safeStatus.replace(/-/g, "_");
  const mapped = STATUS_MAP[normalizedStatus] || { labelKey: `staff.status.${normalizedStatus}`, variant: "gray" as const };

  return (
    <span className={`badge badge-sm ${STATUS_COLORS[mapped.variant]} ${className}`}>
      {t(mapped.labelKey)}
    </span>
  );
}
