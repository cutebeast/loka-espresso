'use client';

import { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: string;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  disabled,
  className,
  ...props
}: ButtonProps) {
  const classes = [
    'btn-admin',
    `btn-${size}`,
    `btn-${variant}`,
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={classes}
    >
      {loading && <i className="fas fa-spinner fa-spin" />}
      {!loading && icon && <i className={`fas ${icon}`} />}
      {children}
    </button>
  );
}
