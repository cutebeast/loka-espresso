'use client';

import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  shadow?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({
  children,
  className,
  padding = 'md',
  shadow = 'sm',
}: CardProps) {
  return (
    <div className={`card-base card-pad-${padding} card-shadow-${shadow} ${className || ''}`}>
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

function getIconColorClass(color?: string) {
  if (!color || color === '#1a3e2f') return 'sc-icon-dark';
  if (color === '#384b16') return 'sc-icon-primary';
  if (color === '#059669') return 'sc-icon-success';
  if (color === '#d18e38') return 'sc-icon-copper';
  return 'sc-icon-dark';
}

function getIconBgClass(bg?: string) {
  if (!bg || bg === '#f0f9f6') return 'sc-icon-bg-default';
  if (bg === '#d4dce5') return 'sc-icon-bg-muted';
  return 'sc-icon-bg-default';
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
    <Card padding="md" className="sc-layout">
      <div>
        <div className="sc-label">{label}</div>
        <div className="sc-value">{value}</div>
        {trend && (
          <div className={`sc-trend ${trend.isPositive ? 'sc-trend-up' : 'sc-trend-down'}`}>
            <i className={`fas fa-arrow-${trend.isPositive ? 'up' : 'down'}`} />
            {Math.abs(trend.value)}%
          </div>
        )}
      </div>
      <div className={`sc-icon-wrap ${getIconBgClass(iconBgColor)}`}>
        <i className={`fas ${icon} sc-icon ${getIconColorClass(iconColor)}`} />
      </div>
    </Card>
  );
}
