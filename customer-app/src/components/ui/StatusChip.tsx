'use client';

import { ReactNode } from 'react';

type StatusVariant =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'primary'
  | 'copper'
  | 'pending'
  | 'ready'
  | 'completed'
  | 'cancelled';

interface StatusChipProps {
  variant: StatusVariant;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}

const variantMap: Record<StatusVariant, string> = {
  success:   'bg-success-light text-success',
  warning:   'bg-warning-light text-warning',
  danger:    'bg-danger-light text-danger',
  info:      'bg-info-light text-info',
  primary:   'bg-primary-100 text-primary',
  copper:    'bg-copper-soft text-copper',
  pending:   'bg-warning-light text-warning',
  ready:     'bg-success-light text-success',
  completed: 'bg-primary-100 text-primary',
  cancelled: 'bg-danger-light text-danger',
};

const dotMap: Record<StatusVariant, string> = {
  success:   'bg-success',
  warning:   'bg-warning',
  danger:    'bg-danger',
  info:      'bg-info',
  primary:   'bg-primary',
  copper:    'bg-copper',
  pending:   'bg-warning',
  ready:     'bg-success',
  completed: 'bg-primary',
  cancelled: 'bg-danger',
};

export function StatusChip({ variant, children, className = '', dot: showDot = true }: StatusChipProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
        text-xs font-semibold
        ${variantMap[variant]}
        ${className}
      `}
    >
      {showDot && (
        <span className={`w-1.5 h-1.5 rounded-full ${dotMap[variant]}`} />
      )}
      {children}
    </span>
  );
}
