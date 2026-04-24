'use client';

import { ReactNode } from 'react';

interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'primary' | 'copper';
  size?: 'sm' | 'md';
  children: ReactNode;
  className?: string;
}

export function Badge({ variant = 'default', size = 'md', children, className = '' }: BadgeProps) {
  const variants = {
    default:  'bg-bg-light text-text-secondary',
    success:  'bg-success-light text-success',
    warning:  'bg-warning-light text-warning',
    error:    'bg-danger-light text-danger',
    info:     'bg-info-light text-info',
    primary:  'bg-primary-100 text-primary',
    copper:   'bg-copper-soft text-copper',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
  };

  return (
    <span
      className={`
        inline-flex items-center font-medium rounded-full
        ${variants[variant]}
        ${sizes[size]}
        ${className}
      `}
    >
      {children}
    </span>
  );
}
