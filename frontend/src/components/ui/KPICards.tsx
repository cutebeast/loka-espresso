'use client';

import { THEME } from '@/lib/theme';

interface KPICardProps {
  icon: string;
  iconColor?: string;
  iconBgColor?: string;
  label: string;
  value: string | number;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  subtitle?: string;
}

function getIconColorClass(color?: string) {
  if (!color || color === '#2C1E16') return 'kc-icon-dark';
  if (color === THEME.primary) return 'kc-icon-primary';
  if (color === THEME.accentCopper) return 'kc-icon-copper';
  if (color === THEME.accent) return 'kc-icon-accent';
  if (color === THEME.accentBrown) return 'kc-icon-brown';
  return 'kc-icon-dark';
}

function getIconBgClass(bg?: string) {
  if (bg === THEME.bgMuted) return 'kc-icon-bg-muted';
  return 'kc-icon-bg-default';
}

export function KPICard({
  icon,
  iconColor = '#2C1E16',
  iconBgColor = '#F9F7F3',
  label,
  value,
  trend,
  subtitle,
}: KPICardProps) {
  return (
    <div className="kc-0">
      <div className="kc-1">
        <div className="kc-2">
          {label}
        </div>
        <div className="kc-3">
          {value}
        </div>
        {trend && (
          <div className={`kc-trend ${trend.isPositive ? 'kc-trend-up' : 'kc-trend-down'}`}>
            <span className="kc-4"><i className={`fas fa-arrow-${trend.isPositive ? 'up' : 'down'}`} /></span>
            {Math.abs(trend.value)}% vs last period
          </div>
        )}
        {subtitle && (
          <div className="kc-5">
            {subtitle}
          </div>
        )}
      </div>
      <div className={`kc-icon-wrap ${getIconBgClass(iconBgColor)}`}>
        <i className={`fas ${icon} kc-icon ${getIconColorClass(iconColor)}`} />
      </div>
    </div>
  );
}

interface KPICardsProps {
  cards: KPICardProps[];
  columns?: 2 | 3 | 4;
}

export function KPICards({ cards, columns = 4 }: KPICardsProps) {
  return (
    <div className={`kc-grid kc-grid-${columns}`}>
      {cards.map((card, i) => (
        <KPICard key={i} {...card} />
      ))}
    </div>
  );
}
