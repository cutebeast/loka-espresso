'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch, formatRM } from '@/lib/merchant-api';
import { THEME } from '@/lib/theme';
import type { MerchantOrder } from '@/lib/merchant-types';

interface KitchenDisplayPageProps {
  token: string;
  selectedStore: string;
  stores: { id: number; name: string }[];
}

/** Simplified card-based view showing ONLY active orders for kitchen/service crew. */
export default function KitchenDisplayPage({ token, selectedStore, stores }: KitchenDisplayPageProps) {
  const [orders, setOrders] = useState<MerchantOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const physicalStores = stores.filter(s => String(s.id) !== '0');

  const fetchActiveOrders = useCallback(async () => {
    if (!token) return;
    try {
      let url = '/admin/orders?page=1&page_size=200';
      // Only get non-terminal orders
      url += '&order_type=' + (filterType || '');
      if (selectedStore && selectedStore !== 'all') {
        url += `&store_id=${selectedStore}`;
      }
      const res = await apiFetch(url, token);
      if (!res.ok) return;
      const data = await res.json();
      // Client-side filter: only show active (non-completed, non-cancelled) orders
      const active = (data.orders || []).filter(
        (o: MerchantOrder) => !['completed', 'cancelled'].includes(o.status)
      );
      setOrders(active);
      setLastRefresh(new Date());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [token, selectedStore, filterType]);

  useEffect(() => {
    fetchActiveOrders();
  }, [fetchActiveOrders]);

  // Auto-refresh every 30s
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchActiveOrders, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchActiveOrders]);

  async function quickAction(orderId: number, action: string) {
    try {
      if (action === 'mark_paid') {
        const res = await apiFetch(`/orders/${orderId}/payment-status`, token, {
          method: 'PATCH', body: JSON.stringify({ payment_status: 'paid' }),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.detail || 'Failed'); return; }
      } else {
        const res = await apiFetch(`/orders/${orderId}/status`, token, {
          method: 'PATCH', body: JSON.stringify({ status: action }),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.detail || 'Failed'); return; }
      }
      fetchActiveOrders();
    } catch { alert('Network error'); }
  }

  function getNextAction(order: MerchantOrder): { label: string; action: string; color: string }[] {
    const actions: { label: string; action: string; color: string }[] = [];
    const s = order.status;
    const isPaid = order.payment_status === 'paid';

    if (s === 'pending') {
      if (order.order_type === 'dine_in' || !isPaid) {
        actions.push({ label: '✓ Confirm', action: 'confirmed', color: '#2563EB' });
      }
      if (isPaid && order.order_type !== 'dine_in') {
        actions.push({ label: '✓ Confirm', action: 'confirmed', color: '#2563EB' });
      }
    }
    if (s === 'paid') {
      actions.push({ label: '✓ Confirm', action: 'confirmed', color: '#2563EB' });
    }
    if (s === 'confirmed') {
      actions.push({ label: '🔥 Start Preparing', action: 'preparing', color: '#D97706' });
    }
    if (s === 'preparing') {
      actions.push({ label: '✅ Ready', action: 'ready', color: '#16A34A' });
    }
    if (s === 'ready') {
      if (order.order_type === 'delivery') {
        actions.push({ label: '🚗 Out for Delivery', action: 'out_for_delivery', color: '#7C3AED' });
      } else {
        actions.push({ label: '🏁 Complete', action: 'completed', color: '#059669' });
      }
    }
    if (s === 'out_for_delivery') {
      actions.push({ label: '🏁 Delivered', action: 'completed', color: '#059669' });
    }

    // Mark as paid if unpaid and not completed/cancelled
    if (!isPaid && s !== 'completed' && s !== 'cancelled') {
      actions.push({ label: `💰 Mark Paid (${formatRM(order.total)})`, action: 'mark_paid', color: '#B45309' });
    }

    return actions;
  }

  function timeSince(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  }

  function timeSinceColor(dateStr: string): string {
    const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (mins > 30) return '#DC2626';
    if (mins > 15) return '#D97706';
    return THEME.textMuted;
  }

  function typeIcon(type: string): string {
    if (type === 'dine_in') return '🍽️';
    if (type === 'pickup') return '🛍️';
    if (type === 'delivery') return '🚚';
    return '📋';
  }

  const statusColor: Record<string, string> = {
    pending: '#6B7280',
    paid: '#2563EB',
    confirmed: '#0891B2',
    preparing: '#D97706',
    ready: '#16A34A',
    out_for_delivery: '#7C3AED',
    completed: '#059669',
    cancelled: '#DC2626',
  };

  const counts = {
    pending: orders.filter(o => o.status === 'pending').length,
    confirmed: orders.filter(o => o.status === 'confirmed').length,
    preparing: orders.filter(o => o.status === 'preparing').length,
    ready: orders.filter(o => o.status === 'ready').length,
    out_for_delivery: orders.filter(o => o.status === 'out_for_delivery').length,
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: THEME.textPrimary, margin: 0 }}>
            <i className="fas fa-fire-burner" style={{ color: THEME.primary, marginRight: 8 }}></i>
            Kitchen Display
          </h2>
          <p style={{ fontSize: 13, color: THEME.textMuted, margin: '4px 0 0' }}>
            Active orders only · Last refresh: {lastRefresh.toLocaleTimeString()}
            {autoRefresh && <span style={{ color: '#16A34A' }}> · Auto-refresh 30s</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-sm" onClick={fetchActiveOrders}>
            <i className="fas fa-sync-alt"></i> Refresh
          </button>
          <button
            className={`btn btn-sm ${autoRefresh ? 'btn-primary' : ''}`}
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{ fontSize: 12 }}
          >
            <i className={`fas fa-${autoRefresh ? 'pause' : 'play'}`}></i> Auto
          </button>
        </div>
      </div>

      {/* Status Summary Bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {Object.entries(counts).map(([status, count]) => (
          <div key={status} style={{
            flex: 1, padding: '10px 12px', borderRadius: THEME.radius.md,
            background: count > 0 ? `${statusColor[status]}15` : THEME.bgMuted,
            border: `1px solid ${count > 0 ? statusColor[status] : THEME.border}`,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: count > 0 ? statusColor[status] : THEME.textMuted }}>{count}</div>
            <div style={{ fontSize: 11, textTransform: 'capitalize' as const, color: THEME.textMuted }}>{status.replace(/_/g, ' ')}</div>
          </div>
        ))}
      </div>

      {/* Filter Row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['', 'dine_in', 'pickup', 'delivery'].map(type => (
          <button
            key={type}
            className={`btn btn-sm ${filterType === type ? 'btn-primary' : ''}`}
            onClick={() => setFilterType(type)}
            style={{ borderRadius: 20, fontSize: 13 }}
          >
            {type === '' ? 'All' : type === 'dine_in' ? '🍽️ Dine In' : type === 'pickup' ? '🛍️ Pickup' : '🚚 Delivery'}
          </button>
        ))}
      </div>

      {/* Order Cards Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: THEME.textMuted }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: 24 }}></i>
          <p>Loading active orders...</p>
        </div>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: THEME.textMuted }}>
          <i className="fas fa-check-circle" style={{ fontSize: 40, color: '#16A34A' }}></i>
          <p style={{ fontSize: 16, fontWeight: 600, marginTop: 16 }}>All caught up! 🎉</p>
          <p style={{ fontSize: 13 }}>No active orders right now.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {orders.map(order => (
            <div key={order.id} style={{
              borderRadius: THEME.radius.lg,
              border: `2px solid ${statusColor[order.status] || THEME.border}`,
              background: '#FFF',
              overflow: 'hidden',
            }}>
              {/* Card Header */}
              <div style={{
                padding: '10px 14px',
                background: `${statusColor[order.status]}10`,
                borderBottom: `1px solid ${statusColor[order.status]}30`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{typeIcon(order.order_type)}</span>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 14, color: THEME.textPrimary }}>{order.order_number}</span>
                    <span style={{ fontSize: 11, textTransform: 'capitalize' as const, color: THEME.textMuted, marginLeft: 6 }}>
                      {order.order_type?.replace('_', ' ')}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: THEME.accentCopper }}>{formatRM(order.total)}</div>
                  <div style={{ fontSize: 11, color: timeSinceColor(order.created_at) }}>{timeSince(order.created_at)} ago</div>
                </div>
              </div>

              {/* Status + Payment Row */}
              <div style={{ padding: '8px 14px', display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{
                  padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  background: `${statusColor[order.status]}20`, color: statusColor[order.status],
                  textTransform: 'capitalize' as const,
                }}>
                  {order.status.replace(/_/g, ' ')}
                </span>
                {order.payment_status !== 'paid' && (
                  <span style={{
                    padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                    background: '#FEF3C7', color: '#92400E',
                  }}>
                    UNPAID
                  </span>
                )}
                {order.payment_status === 'paid' && (
                  <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: '#DCFCE7', color: '#166534' }}>
                    PAID
                  </span>
                )}
              </div>

              {/* Items */}
              <div style={{ padding: '4px 14px 8px', maxHeight: 120, overflowY: 'auto' }}>
                {order.items?.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0', color: THEME.textPrimary }}>
                    <span>{item.quantity as React.ReactNode}× {item.name as React.ReactNode}</span>
                    <span style={{ color: THEME.textMuted, fontWeight: 500 }}>{formatRM(item.line_total as number)}</span>
                  </div>
                ))}
              </div>

              {/* Notes */}
              {order.notes && (
                <div style={{ margin: '0 14px 8px', padding: '6px 10px', background: '#FFFBEB', borderRadius: 6, fontSize: 12, color: '#92400E' }}>
                  📝 {order.notes}
                </div>
              )}

              {/* Quick Actions */}
              <div style={{ padding: '8px 14px 12px', borderTop: `1px solid ${THEME.border}`, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {getNextAction(order).map(a => (
                  <button
                    key={a.action}
                    onClick={() => quickAction(order.id, a.action)}
                    style={{
                      padding: '6px 12px', borderRadius: THEME.radius.md, fontSize: 12, fontWeight: 600,
                      border: `1px solid ${a.color}`, background: `${a.color}10`, color: a.color,
                      cursor: 'pointer', flex: 1, minWidth: 'fit-content',
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
