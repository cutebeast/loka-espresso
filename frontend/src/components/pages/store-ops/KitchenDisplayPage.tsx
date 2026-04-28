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
  const [loadError, setLoadError] = useState('');

  const physicalStores = stores.filter(s => String(s.id) !== '0');
  const activeStoreId = selectedStore !== 'all' ? selectedStore : '';

  const fetchActiveOrders = useCallback(async () => {
    if (!token || !activeStoreId) { setLoading(false); return; }
    setLoading(true);
    try {
      let url = `/admin/orders?store_id=${activeStoreId}&page=1&page_size=200`;
      if (filterType) url += `&order_type=${filterType}`;
      const res = await apiFetch(url);
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json();
      const active = (data.items || []).filter(
        (o: MerchantOrder) => !['completed', 'cancelled'].includes(o.status)
      );
      setOrders(active);
      setLoadError('');
      setLastRefresh(new Date());
    } catch {
      setOrders([]);
      setLoadError('Failed to load orders');
    } finally { setLoading(false); }
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
      <div className="kdp-0">
        <div className="kdp-1">
          <StoreSelector
            stores={physicalStores.map(s => ({ id: String(s.id), name: s.name }))}
            selectedStore={activeStoreId || ''}
            onChange={onStoreChange}
            showAllOption={false}
            placeholder="Select a store..."
          />
          {activeStoreId && (
            <span className="kdp-2">
              <span className="kdp-3"><i className="fas fa-fire-burner"></i></span>
              Order Station
              {autoRefresh && <span className="kdp-4">· Auto-refresh 30s</span>}
              <span className="kdp-5">· Last: {lastRefresh.toLocaleTimeString()}</span>
            </span>
          )}
        </div>
        {activeStoreId && (
          <div className="kdp-6">
            <button className="btn btn-sm" onClick={fetchActiveOrders}>
              <i className="fas fa-sync-alt"></i> Refresh
            </button>
            <button
              className={`btn btn-sm ${autoRefresh ? 'btn-primary' : ''} kdp-7`}
              onClick={() => setAutoRefresh(!autoRefresh)}
              
            >
              <i className={`fas fa-${autoRefresh ? 'pause' : 'play'}`}></i> Auto
            </button>
          </div>
        )}
      </div>

      {/* How it works — collapsible guide */}
      <div className="card kdp-8" >
        <div
          onClick={() => setShowGuide(!showGuide)}
          className="kdp-9"
        >
          <span><span className="kdp-10"><i className="fas fa-circle-info"></i></span>How Order Station works</span>
          <i className={`fas fa-chevron-${showGuide ? 'up' : 'down'}`}></i>
        </div>
        {showGuide && (
          <div className="kdp-11">
            <p className="kdp-12"><strong>1. New orders appear here automatically</strong> — they come from customers ordering via the app or POS.</p>
            <p className="kdp-13"><strong>2. Click Confirm</strong> to acknowledge the order and start preparing.</p>
            <p className="kdp-14"><strong>3. Click Start Preparing</strong> when the kitchen begins cooking the order.</p>
            <p className="kdp-15"><strong>4. Click Ready</strong> when the order is packed and ready for pickup/delivery.</p>
            <p className="kdp-16"><strong>5. Click Complete</strong> when the customer receives the order.</p>
            <p className="kdp-17"><strong>For delivery orders:</strong> click &quot;Out for Delivery&quot; when the rider picks up, then &quot;Delivered&quot; when the customer receives it.</p>
          </div>
        )}
      </div>

      {/* No store selected */}
      {!activeStoreId && (
        <div className="card kdp-18" >
          <span className="kdp-19"><i className="fas fa-fire-burner"></i></span>
          <p className="kdp-20">Select a store to view orders</p>
          <p className="kdp-21">Choose a store location above to see active orders for preparation.</p>
        </div>
      )}

      {activeStoreId && (<>
      {/* Error Banner */}
      {loadError && <div className="kdp-30"><i className="fas fa-exclamation-triangle"></i> {loadError} — <button className="btn btn-sm" onClick={() => { setLoadError(''); fetchActiveOrders(); }}>Retry</button></div>}

      {/* Status Summary Bar */}
      <div className="kdp-22">
        {Object.entries(counts).map(([status, count]) => (
          <div key={status} className={`kdp-status-card ${count > 0 ? 'kdp-status-card-' + status : 'kdp-status-card-empty'}`}>
            <div className={`kdp-status-count ${count > 0 ? 'kdp-status-count-' + status : 'kdp-status-count-empty'}`}>{count}</div>
            <div className="kdp-status-name">{status.replace(/_/g, ' ')}</div>
          </div>
        ))}
      </div>

      {/* Filter Row */}
      <div className="kdp-23">
        {['', 'dine_in', 'pickup', 'delivery'].map(type => (
          <button
            key={type}
            className={`btn btn-sm ${filterType === type ? 'btn-primary' : ''} kdp-24`}
            onClick={() => setFilterType(type)}
            
          >
            {type === '' ? 'All' : type === 'dine_in' ? '🍽️ Dine In' : type === 'pickup' ? '🛍️ Pickup' : '🚚 Delivery'}
          </button>
        ))}
      </div>

      {/* Order Cards Grid */}
      {loading ? (
        <div className="kdp-25">
          <span className="kdp-26"><i className="fas fa-spinner fa-spin"></i></span>
          <p>Loading active orders...</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="kdp-27">
          <span className="kdp-28"><i className="fas fa-check-circle"></i></span>
          <p className="kdp-29">All caught up! 🎉</p>
          <p className="kdp-30">No active orders right now.</p>
        </div>
      ) : (
        <div className="kdp-31">
          {orders.map(order => (
            <div key={order.id} className={`kdp-order-card ${needsPosSync(order) || needsDispatch(order) ? 'kdp-order-card-border-warn' : 'kdp-order-card-border-' + (order.status || 'default')}`}>
              {/* Card Header */}
              <div className={`kdp-order-header kdp-order-header-${order.status}`}>
                <div className="kdp-32">
                  <span className="kdp-33">{typeIcon(order.order_type)}</span>
                  <div>
                    <span className="kdp-34">{order.order_number}</span>
                    <span className="kdp-order-type">
                      {order.order_type?.replace('_', ' ')}
                    </span>
                  </div>
                </div>
                <div className="kdp-35">
                  <div className="kdp-36">{formatRM(order.total)}</div>
                  <div className={`kdp-time-since ${timeSinceColor(order.created_at) === '#DC2626' ? 'kdp-time-old' : timeSinceColor(order.created_at) === '#D97706' ? 'kdp-time-mid' : 'kdp-time-new'}`}>{timeSince(order.created_at)} ago</div>
                </div>
              </div>

              {/* Status + Payment Row */}
              <div className="kdp-37">
                <span className={`kdp-status-badge kdp-status-badge-${order.status}`}>
                  {order.status.replace(/_/g, ' ')}
                </span>
                {order.payment_status !== 'paid' && (
                  <span className="kdp-38">
                    UNPAID
                  </span>
                )}
                {order.payment_status === 'paid' && (
                  <span className="kdp-39">
                    PAID
                  </span>
                )}
                {needsPosSync(order) && (
                  <span className="kdp-40">
                    POS SYNC REQUIRED
                  </span>
                )}
                {needsDispatch(order) && (
                  <span className="kdp-41">
                    DISPATCH REQUIRED
                  </span>
                )}
              </div>

              {/* Items */}
              <div className="kdp-42">
                {order.items?.map((item, idx) => (
                  <div key={idx} className="kdp-43">
                    <span>{item.quantity as React.ReactNode}× {item.name as React.ReactNode}</span>
                    <span className="kdp-44">{formatRM(item.line_total as number)}</span>
                  </div>
                ))}
              </div>

              {/* Notes */}
              {order.notes && (
                <div className="kdp-45">
                  📝 {order.notes}
                </div>
              )}

              {/* Quick Actions */}
              <div className="kdp-46">
                {getNextAction(order).map(a => (
                  <button
                    key={a.action}
                    onClick={() => quickAction(order.id, a.action)}
                    className={`kdp-action-btn ${a.color === '#2563EB' ? 'kdp-action-blue' : a.color === '#D97706' ? 'kdp-action-orange' : a.color === '#16A34A' ? 'kdp-action-green' : a.color === '#7C3AED' ? 'kdp-action-purple' : 'kdp-action-teal'}`}
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
