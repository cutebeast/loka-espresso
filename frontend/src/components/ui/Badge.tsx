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
  const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
    default: {
      background: '#f1f5f9',
      color: '#64748b',
    },
    primary: {
      background: '#f0f9f6',
      color: '#1a3e2f',
    },
    success: {
      background: '#ecfdf5',
      color: '#059669',
    },
    warning: {
      background: '#fffbeb',
      color: '#d97706',
    },
    danger: {
      background: '#fef2f2',
      color: '#dc2626',
    },
    info: {
      background: '#eff6ff',
      color: '#2563eb',
    },
  };

  const sizeStyles: Record<BadgeSize, React.CSSProperties> = {
    sm: {
      padding: '2px 8px',
      fontSize: 11,
      fontWeight: 600,
    },
    md: {
      padding: '4px 12px',
      fontSize: 12,
      fontWeight: 600,
    },
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        borderRadius: 20,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        whiteSpace: 'nowrap',
        ...variantStyles[variant],
        ...sizeStyles[size],
      }}
    >
      {icon && <i className={`fas ${icon}`} style={{ fontSize: size === 'sm' ? 9 : 11 }} />}
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
