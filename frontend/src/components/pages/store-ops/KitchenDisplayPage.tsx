'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch, formatRM } from '@/lib/merchant-api';
import { THEME } from '@/lib/theme';
import { StoreSelector } from '@/components/ui/Select';
import type { MerchantOrder } from '@/lib/merchant-types';

interface KitchenDisplayPageProps {
  token: string;
  selectedStore: string;
  stores: { id: number; name: string }[];
  onStoreChange: (store: string) => void;
}

/** Simplified card-based view showing ONLY active orders for kitchen/service crew. */
export default function KitchenDisplayPage({ token, selectedStore, stores, onStoreChange }: KitchenDisplayPageProps) {
  const [orders, setOrders] = useState<MerchantOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [showGuide, setShowGuide] = useState(false);

  const physicalStores = stores.filter(s => String(s.id) !== '0');
  const activeStoreId = selectedStore !== 'all' ? selectedStore : '';

  const fetchActiveOrders = useCallback(async () => {
    if (!token || !activeStoreId) return;
    try {
      let url = `/admin/orders?store_id=${activeStoreId}&page=1&page_size=200`;
      if (filterType) {
        url += `&order_type=${filterType}`;
      }
      const res = await apiFetch(url);
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
  }, [token, activeStoreId, filterType]);

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
        const res = await apiFetch(`/orders/${orderId}/payment-status`, undefined, {
          method: 'PATCH', body: JSON.stringify({ payment_status: 'paid' }),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.detail || 'Failed'); return; }
      } else if (action === 'pos_synced') {
        const res = await apiFetch(`/orders/${orderId}/pos-synced`, undefined, { method: 'POST' });
        if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.detail || 'Failed'); return; }
      } else if (action === 'delivery_dispatched') {
        const res = await apiFetch(`/orders/${orderId}/delivery-dispatched`, undefined, { method: 'POST' });
        if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.detail || 'Failed'); return; }
      } else {
        const res = await apiFetch(`/orders/${orderId}/status`, undefined, {
          method: 'PATCH', body: JSON.stringify({ status: action }),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.detail || 'Failed'); return; }
      }
      fetchActiveOrders();
    } catch { alert('Network error'); }
  }

  function needsPosSync(order: MerchantOrder): boolean {
    if (order.order_type === 'delivery') return false;
    if (['pending', 'cancelled', 'completed'].includes(order.status)) return false;
    return !order.pos_synced_at;
  }

  function needsDispatch(order: MerchantOrder): boolean {
    if (order.order_type !== 'delivery') return false;
    if (['pending', 'confirmed', 'preparing', 'cancelled', 'completed'].includes(order.status)) return false;
    return !order.delivery_dispatched_at;
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

    // Manual sync actions
    if (needsPosSync(order)) {
      actions.push({ label: '📠 Mark POS Synced', action: 'pos_synced', color: '#D97706' });
    }
    if (needsDispatch(order)) {
      actions.push({ label: '🚚 Mark Dispatched', action: 'delivery_dispatched', color: '#D97706' });
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
      {/* Header with StoreSelector always visible */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <StoreSelector
            stores={physicalStores.map(s => ({ id: String(s.id), name: s.name }))}
            selectedStore={activeStoreId || ''}
            onChange={onStoreChange}
            showAllOption={false}
            placeholder="Select a store..."
          />
          {activeStoreId && (
            <span style={{ fontSize: 12, color: THEME.textMuted }}>
              <i className="fas fa-fire-burner" style={{ color: THEME.primary, marginRight: 4 }}></i>
              Order Station
              {autoRefresh && <span style={{ color: '#16A34A', marginLeft: 8 }}>· Auto-refresh 30s</span>}
              <span style={{ marginLeft: 8 }}>· Last: {lastRefresh.toLocaleTimeString()}</span>
            </span>
          )}
        </div>
        {activeStoreId && (
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
        )}
      </div>

      {/* How it works — collapsible guide */}
      <div className="card" style={{ marginBottom: 16, padding: '12px 16px', background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
        <div
          onClick={() => setShowGuide(!showGuide)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#166534' }}
        >
          <span><i className="fas fa-circle-info" style={{ marginRight: 8 }}></i>How Order Station works</span>
          <i className={`fas fa-chevron-${showGuide ? 'up' : 'down'}`}></i>
        </div>
        {showGuide && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#166534', lineHeight: 1.7 }}>
            <p style={{ margin: '0 0 6px' }}><strong>1. New orders appear here automatically</strong> — they come from customers ordering via the app or POS.</p>
            <p style={{ margin: '0 0 6px' }}><strong>2. Click Confirm</strong> to acknowledge the order and start preparing.</p>
            <p style={{ margin: '0 0 6px' }}><strong>3. Click Start Preparing</strong> when the kitchen begins cooking the order.</p>
            <p style={{ margin: '0 0 6px' }}><strong>4. Click Ready</strong> when the order is packed and ready for pickup/delivery.</p>
            <p style={{ margin: '0 0 6px' }}><strong>5. Click Complete</strong> when the customer receives the order.</p>
            <p style={{ margin: 0 }}><strong>For delivery orders:</strong> click &quot;Out for Delivery&quot; when the rider picks up, then &quot;Delivered&quot; when the customer receives it.</p>
          </div>
        )}
      </div>

      {/* No store selected */}
      {!activeStoreId && (
        <div className="card" style={{ textAlign: 'center', padding: 60, color: THEME.textMuted, marginTop: 40 }}>
          <i className="fas fa-fire-burner" style={{ fontSize: 48, marginBottom: 16 }}></i>
          <p style={{ fontSize: 16, fontWeight: 600, color: THEME.textSecondary }}>Select a store to view orders</p>
          <p style={{ fontSize: 13 }}>Choose a store location above to see active orders for preparation.</p>
        </div>
      )}

      {activeStoreId && (<>
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
              border: `3px solid ${needsPosSync(order) || needsDispatch(order) ? '#D97706' : (statusColor[order.status] || THEME.border)}`,
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
                {needsPosSync(order) && (
                  <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: '#FEE2E2', color: '#B91C1C' }}>
                    POS SYNC REQUIRED
                  </span>
                )}
                {needsDispatch(order) && (
                  <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: '#FEE2E2', color: '#B91C1C' }}>
                    DISPATCH REQUIRED
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
      </>)}
    </div>
  );
}
