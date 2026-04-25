'use client';

import { ButtonHTMLAttributes, ReactNode } from 'react';
import { THEME } from '@/lib/theme';

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
  style,
  ...props
}: ButtonProps) {
  const baseStyles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    border: 'none',
    fontWeight: 600,
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    transition: 'all 0.2s ease',
    opacity: disabled || loading ? 0.6 : 1,
  };

  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { padding: '8px 12px', fontSize: 13 },
    md: { padding: '10px 16px', fontSize: 14 },
    lg: { padding: '14px 24px', fontSize: 16 },
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      background: THEME.primary,
      color: 'white',
      boxShadow: '0 4px 12px rgba(26, 62, 47, 0.2)',
    },
    secondary: {
      background: 'white',
      color: '#1e293b',
      border: '1px solid #e2e8f0',
      boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
    },
    ghost: {
      background: 'transparent',
      color: '#64748b',
    },
    danger: {
      background: '#dc2626',
      color: 'white',
    },
  };

  return (
    <button
      {...props}
      disabled={disabled || loading}
      style={{
        ...baseStyles,
        ...sizeStyles[size],
        ...variantStyles[variant],
        ...style,
      }}
    >
      {loading && <i className="fas fa-spinner fa-spin" />}
      {!loading && icon && <i className={`fas ${icon}`} />}
      {children}
    </button>
  );
}
