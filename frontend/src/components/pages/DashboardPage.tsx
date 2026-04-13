'use client';

import { formatRM } from '@/lib/merchant-api';
import { StatCard } from '@/components/Modals';
import type { MerchantDashboardData } from '@/lib/merchant-types';

interface DashboardPageProps {
  dashboard: MerchantDashboardData | null;
  loading: boolean;
}

export default function DashboardPage({ dashboard, loading }: DashboardPageProps) {
  if (loading) return null;
  if (!dashboard) return null;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBottom: 28 }}>
        <StatCard icon="fa-clipboard" color="#002F6C" label="Orders Today" value={String(dashboard.orders_today)} />
        <StatCard icon="fa-dollar-sign" color="#059669" label="Revenue Today" value={formatRM(dashboard.revenue_today)} />
        <StatCard icon="fa-fire" color="#EA580C" label="Active Orders" value={String(dashboard.total_orders)} />
        <StatCard icon="fa-clock" color="#7C3AED" label="Total Customers" value={String(dashboard.total_customers)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 24 }}>
        <div className="card">
          <h3 style={{ marginBottom: 16 }}><i className="fas fa-bolt"></i> Orders by Type</h3>
          {Object.keys(dashboard.orders_by_type).length === 0 ? (
            <p style={{ color: '#94A3B8' }}>No orders yet</p>
          ) : (
            Object.entries(dashboard.orders_by_type).map(([type, count]) => (
              <div key={type} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #EDF2F8' }}>
                <span style={{ textTransform: 'capitalize' }}>{type.replace('_', ' ')}</span>
                <strong>{String(count)}</strong>
              </div>
            ))
          )}
        </div>
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Revenue</h3>
          <div style={{ fontSize: 36, fontWeight: 700, color: '#059669' }}>{formatRM(dashboard.total_revenue)}</div>
          <p style={{ color: '#64748B', marginTop: 8 }}>Total all-time revenue</p>
        </div>
      </div>
      <div style={{ marginTop: 20, background: '#EFF6FF', borderRadius: 40, padding: '14px 24px', color: '#002F6C' }}>
        Total orders: {dashboard.total_orders} | Total revenue: {formatRM(dashboard.total_revenue)} | Customers: {dashboard.total_customers}
      </div>
    </div>
  );
}
