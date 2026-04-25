'use client';

import { useState, useMemo } from 'react';
import { formatRM } from '@/lib/merchant-api';
import { KPICards, StoreSelector } from '@/components/ui';
import { DateFilter, type DatePreset } from '@/components/ui/DateFilter';
import { THEME } from '@/lib/theme';
import type { MerchantDashboardData } from '@/lib/merchant-types';

interface DashboardPageProps {
  dashboard: MerchantDashboardData | null;
  loading: boolean;
  selectedStore: string;
  stores: { id: number; name: string }[];
  onStoreChange: (storeId: string) => void;
  onDateChange: (from: string, to: string, chartMode?: string) => void;
  fromDate: string;
  toDate: string;
  chartMode?: string;
}

// Generate chart data based on preset
function generateChartData(
  preset: DatePreset,
  monthlyData: Record<string, { orders: number; revenue: number }> | undefined,
  dailyData?: Record<string, { orders: number; revenue: number }> | undefined
): { label: string; orders: number; revenue: number }[] {
  const result: { label: string; orders: number; revenue: number }[] = [];
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const date = now.getDate();

  if (!monthlyData) return result;

  switch (preset) {
    case 'TODAY': {
      // Today - show Today + previous 6 days (7 days total)
      // Use daily data if available, otherwise show message data
      for (let i = 6; i >= 0; i--) {
        const d = new Date(year, month, date - i);
        const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

        // Try daily data first, fall back to monthly data divided by days
        let orders = dailyData?.[dateKey]?.orders || 0;
        let revenue = dailyData?.[dateKey]?.revenue || 0;

        // If no daily data, use an estimate from monthly data
        if (!orders && !revenue && monthlyData[monthKey]) {
          // Rough estimate: divide monthly by 30 days
          orders = Math.round(monthlyData[monthKey].orders / 30);
          revenue = Math.round(monthlyData[monthKey].revenue / 30);
        }

        result.push({
          label: i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }),
          orders,
          revenue,
        });
      }
      break;
    }

    case 'MTD': {
      // MTD - Current month + 5 previous months (6 months total)
      for (let i = 5; i >= 0; i--) {
        const d = new Date(year, month - i, 1);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        result.push({
          label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          orders: monthlyData[monthKey]?.orders || 0,
          revenue: monthlyData[monthKey]?.revenue || 0,
        });
      }
      break;
    }

    case 'QTD': {
      // QTD - Show months in current quarter only (quarter-to-date)
      const quarter = Math.floor(month / 3);
      const quarterMonths = [
        ['01', '02', '03'],
        ['04', '05', '06'],
        ['07', '08', '09'],
        ['10', '11', '12'],
      ][quarter];

      quarterMonths.forEach(m => {
        const key = `${year}-${m}`;
        const monthIndex = parseInt(m, 10) - 1;
        const d = new Date(year, monthIndex, 1);
        result.push({
          label: d.toLocaleDateString('en-US', { month: 'short' }),
          orders: monthlyData[key]?.orders || 0,
          revenue: monthlyData[key]?.revenue || 0,
        });
      });
      break;
    }

    case 'YTD': {
      // YTD - Current year + 5 previous years (6 years total)
      for (let i = 5; i >= 0; i--) {
        const y = year - i;
        let yearOrders = 0;
        let yearRevenue = 0;

        // Sum all months for this year
        for (let m = 1; m <= 12; m++) {
          const key = `${y}-${String(m).padStart(2, '0')}`;
          yearOrders += monthlyData[key]?.orders || 0;
          yearRevenue += monthlyData[key]?.revenue || 0;
        }

        result.push({
          label: String(y),
          orders: yearOrders,
          revenue: yearRevenue,
        });
      }
      break;
    }

    case 'CUSTOM': {
      // Custom - Show months between from and to dates
      // For now, show last 6 months or whatever matches the date range
      for (let i = 5; i >= 0; i--) {
        const d = new Date(year, month - i, 1);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        result.push({
          label: d.toLocaleDateString('en-US', { month: 'short' }),
          orders: monthlyData[monthKey]?.orders || 0,
          revenue: monthlyData[monthKey]?.revenue || 0,
        });
      }
      break;
    }
  }

  return result;
}

export default function DashboardPage({ dashboard, loading, selectedStore, stores, onStoreChange, onDateChange, fromDate, toDate, chartMode: _chartMode }: DashboardPageProps) {
  const [preset, setPreset] = useState<DatePreset>('MTD');

  // Generate chart data based on preset
  const chartData = useMemo(() => {
    if (!dashboard) return [];
    // Use the monthly data from API which now includes proper historical data based on chart_mode
    return generateChartData(preset, dashboard.monthly);
  }, [preset, dashboard]);

  // Early returns after all hooks
  if (loading) return null;
  if (!dashboard) return null;

  const physicalStores = stores.filter(s => String(s.id) !== '0');
  const maxValue = chartData.length > 0 ? Math.max(...chartData.map(d => d.orders)) : 0;

  const handleDateChange = (p: DatePreset, from: string, to: string) => {
    setPreset(p);
    // Map preset to chart_mode for API
    const modeMap: Record<DatePreset, string> = {
      'TODAY': 'day',
      'MTD': 'month',
      'QTD': 'quarter',
      'YTD': 'year',
      'CUSTOM': 'month'
    };
    onDateChange(from, to, modeMap[p]);
  };

  const kpiCards = [
    {
      icon: 'fa-clipboard',
      iconColor: THEME.primary,
      iconBgColor: THEME.bgMuted,
      label: 'Total Orders',
      value: String(dashboard.total_orders),
    },
    {
      icon: 'fa-dollar-sign',
      iconColor: THEME.accentCopper,
      iconBgColor: THEME.bgMuted,
      label: 'Total Revenue',
      value: formatRM(dashboard.total_revenue),
    },
    {
      icon: 'fa-fire',
      iconColor: THEME.accent,
      iconBgColor: THEME.bgMuted,
      label: 'Active Orders',
      value: String(dashboard.active_orders),
    },
    {
      icon: 'fa-users',
      iconColor: THEME.accentBrown,
      iconBgColor: THEME.bgMuted,
      label: 'Total Customers',
      value: String(dashboard.total_customers),
    },
  ];

  const getChartTitle = () => {
    switch (preset) {
      case 'TODAY': return 'Today';
      case 'MTD': return 'Last 6 Months';
      case 'QTD': {
        const now = new Date();
        const quarter = Math.floor(now.getMonth() / 3) + 1;
        return `Q${quarter} ${now.getFullYear()}`;
      }
      case 'YTD': return 'Last 6 Years';
      case 'CUSTOM': return 'Custom Period';
      default: return '';
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <StoreSelector
          stores={physicalStores}
          selectedStore={selectedStore}
          onChange={onStoreChange}
          allLabel="All Stores (HQ)"
        />

        <DateFilter
          preset={preset}
          onChange={handleDateChange}
          fromDate={fromDate}
          toDate={toDate}
        />
      </div>

      {/* Stats Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        background: THEME.bgMuted,
        borderRadius: `${THEME.radius.md} ${THEME.radius.md} 0 0`,
        border: `1px solid ${THEME.border}`,
        borderBottom: 'none',
      }}>
        <div style={{ fontSize: 14, color: THEME.textSecondary }}>
          <i className="fas fa-chart-line" style={{ marginRight: 8, color: THEME.primary }}></i>
          <strong style={{ color: THEME.textPrimary }}>{fromDate}</strong> — <strong style={{ color: THEME.textPrimary }}>{toDate}</strong>
        </div>
        <div style={{ fontSize: 13, color: THEME.textMuted }}>
          Dashboard Overview
        </div>
      </div>

      <KPICards cards={kpiCards} columns={4} />

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 24 }}>
        <div className="card" style={{ background: THEME.bgCard, borderRadius: THEME.radius.lg, border: `1px solid ${THEME.border}`, padding: 20 }}>
          <h3 style={{ marginBottom: 16, color: THEME.textPrimary }}><i className="fas fa-bolt" style={{ color: THEME.accentCopper, marginRight: 8 }}></i> Orders by Type</h3>
          {Object.keys(dashboard.orders_by_type || {}).length === 0 ? (
            <p style={{ color: THEME.textMuted }}>No orders yet</p>
          ) : (
            Object.entries(dashboard.orders_by_type || {}).map(([type, count]) => (
              <div key={type} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${THEME.borderLight}` }}>
                <span style={{ textTransform: 'capitalize', color: THEME.textSecondary }}>{type.replace('_', ' ')}</span>
                <strong style={{ color: THEME.textPrimary }}>{String(count)}</strong>
              </div>
            ))
          )}
        </div>
        <div className="card" style={{ background: THEME.bgCard, borderRadius: THEME.radius.lg, border: `1px solid ${THEME.border}`, padding: 20 }}>
          <h3 style={{ marginBottom: 16, color: THEME.textPrimary }}>Revenue</h3>
          <div style={{ fontSize: 36, fontWeight: 700, color: THEME.accentCopper }}>{formatRM(dashboard.total_revenue)}</div>
          <p style={{ color: THEME.textMuted, marginTop: 8 }}>Revenue for selected period</p>
        </div>
      </div>

      {/* Dynamic Chart Based on Preset */}
      {chartData.length > 0 && (
        <div className="card" style={{ marginTop: 24, background: THEME.bgCard, borderRadius: THEME.radius.lg, border: `1px solid ${THEME.border}`, padding: 20 }}>
          <h3 style={{ marginBottom: 16, color: THEME.textPrimary }}>
            <i className="fas fa-chart-bar" style={{ color: THEME.accent, marginRight: 8 }}></i> 
            {getChartTitle()}
          </h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 180, padding: '0 10px' }}>
            {chartData.map((data, index) => (
              <div key={index} style={{ flex: 1, textAlign: 'center', minWidth: 60 }}>
                <div style={{
                  height: `${maxValue > 0 ? (data.orders / maxValue) * 140 : 0}px`,
                  backgroundColor: data.orders > 0 ? THEME.primary : THEME.border,
                  borderRadius: 4,
                  minHeight: data.orders > 0 ? 4 : 2,
                  transition: 'height 0.3s ease',
                  opacity: data.orders > 0 ? 1 : 0.4,
                }} />
                <div style={{ fontSize: 12, color: THEME.textMuted, marginTop: 8, fontWeight: 500 }}>{data.label}</div>
                <div style={{ 
                  fontSize: 14, 
                  fontWeight: 700, 
                  color: data.orders > 0 ? THEME.textPrimary : THEME.textMuted,
                  marginTop: 4 
                }}>{data.orders}</div>
              </div>
            ))}
          </div>
          {chartData.some(d => d.orders === 0) && (
            <div style={{ marginTop: 16, fontSize: 12, color: THEME.textMuted, fontStyle: 'italic', textAlign: 'center' }}>
              <i className="fas fa-info-circle"></i> Periods with 0 orders are shown in gray (no data skipped)
            </div>
          )}
        </div>
      )}
    </div>
  );
}
