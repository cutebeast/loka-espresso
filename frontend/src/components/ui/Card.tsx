'use client';

import { ReactNode, CSSProperties } from 'react';

interface CardProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  shadow?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({
  children,
  style,
  className,
  padding = 'md',
  shadow = 'sm',
}: CardProps) {
  const paddingStyles: Record<string, CSSProperties> = {
    none: { padding: 0 },
    sm: { padding: '12px 16px' },
    md: { padding: '20px 24px' },
    lg: { padding: '28px 32px' },
  };

  const shadowStyles: Record<string, CSSProperties> = {
    none: { boxShadow: 'none' },
    sm: { boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
    md: { boxShadow: '0 4px 12px rgba(0,0,0,0.08)' },
    lg: { boxShadow: '0 8px 24px rgba(0,0,0,0.12)' },
  };

  return (
    <div
      className={className}
      style={{
        background: 'white',
        borderRadius: 16,
        border: '1px solid #e2e8f0',
        ...paddingStyles[padding],
        ...shadowStyles[shadow],
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface StatCardProps {
  icon: string;
  iconColor?: string;
  iconBgColor?: string;
  label: string;
  value: string | number;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

export function StatCard({
  icon,
  iconColor = '#1a3e2f',
  iconBgColor = '#f0f9f6',
  label,
  value,
  trend,
}: StatCardProps) {
  return (
    <Card
      padding="md"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#0f172a' }}>{value}</div>
        {trend && (
          <div
            style={{
              fontSize: 12,
              color: trend.isPositive ? '#059669' : '#dc2626',
              marginTop: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <i className={`fas fa-arrow-${trend.isPositive ? 'up' : 'down'}`} />
            {Math.abs(trend.value)}%
          </div>
        )}
      </div>
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: iconBgColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <i className={`fas ${icon}`} style={{ fontSize: 20, color: iconColor }} />
      </div>
    </Card>
  );
}
