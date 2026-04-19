'use client';

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
    <div style={{
      background: 'white',
      borderRadius: 16,
      padding: '20px',
      border: '1px solid #E5E0D8',
      boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: 13,
          color: '#6B635E',
          marginBottom: 4,
          fontWeight: 500,
        }}>
          {label}
        </div>
        <div style={{
          fontSize: 28,
          fontWeight: 700,
          color: '#2C1E16',
          lineHeight: 1.2,
        }}>
          {value}
        </div>
        {trend && (
          <div style={{
            fontSize: 12,
            color: trend.isPositive ? '#4A7A59' : '#A83232',
            marginTop: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontWeight: 500,
          }}>
            <i className={`fas fa-arrow-${trend.isPositive ? 'up' : 'down'}`} style={{ fontSize: 10 }} />
            {Math.abs(trend.value)}% vs last period
          </div>
        )}
        {subtitle && (
          <div style={{
            fontSize: 11,
            color: '#6B635E',
            marginTop: 4,
          }}>
            {subtitle}
          </div>
        )}
      </div>
      <div style={{
        width: 48,
        height: 48,
        borderRadius: 12,
        background: iconBgColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 16,
      }}>
        <i className={`fas ${icon}`} style={{ fontSize: 20, color: iconColor }} />
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
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gap: 16,
      marginBottom: 24,
    }}>
      {cards.map((card, i) => (
        <KPICard key={i} {...card} />
      ))}
    </div>
  );
}