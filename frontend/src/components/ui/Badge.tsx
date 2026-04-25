'use client';

import { ReactNode } from 'react';

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: string;
}

export function Badge({
  children,
  variant = 'default',
  size = 'sm',
  icon,
}: BadgeProps) {


  return (
    <span
      className={`badge-base badge-${variant} badge-${size}`}
    >
      {icon && <i className={`fas ${icon} badge-icon-${size}`} />}
      {children}
    </span>
  );
}

// Status badge for orders/tasks
interface StatusBadgeProps {
  status: 'pending' | 'processing' | 'completed' | 'cancelled' | 'paid' | 'ready' | 'delivering';
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const statusConfig: Record<string, { variant: BadgeVariant; icon: string; label: string }> = {
    pending: { variant: 'warning', icon: 'fa-clock', label: 'Pending' },
    processing: { variant: 'primary', icon: 'fa-spinner', label: 'Processing' },
    completed: { variant: 'success', icon: 'fa-check', label: 'Completed' },
    cancelled: { variant: 'danger', icon: 'fa-times', label: 'Cancelled' },
    paid: { variant: 'success', icon: 'fa-check-circle', label: 'Paid' },
    ready: { variant: 'info', icon: 'fa-box', label: 'Ready' },
    delivering: { variant: 'primary', icon: 'fa-truck', label: 'Delivering' },
  };

  const config = statusConfig[status] || statusConfig.pending;

  return (
    <Badge variant={config.variant} icon={config.icon}>
      {config.label}
    </Badge>
  );
}
