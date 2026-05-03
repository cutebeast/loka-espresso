'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { RefreshCw, ShoppingBag, Receipt, Clock, RotateCcw } from 'lucide-react';
import { useOrderStore } from '@/stores/orderStore';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useCartStore } from '@/stores/cartStore';
import api from '@/lib/api';
import type { Order } from '@/lib/api';
import { formatPrice, resolveAssetUrl } from '@/lib/tokens';
import { Coffee } from 'lucide-react';

function getStatusBadge(status: string): { label: string; cls: string } {
  const s = status?.toLowerCase();
  if (s === 'delivered' || s === 'completed') return { label: 'Delivered', cls: 'delivered' };
  if (s === 'cancelled') return { label: 'Cancelled', cls: 'cancelled' };
  return { label: status?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || '', cls: '' };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `Today, ${d.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}`;
  return d.toLocaleDateString('en-MY', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const ACTIVE = ['pending', 'confirmed', 'preparing', 'in_progress', 'ready', 'out_for_delivery', 'driver_assigned'];
const STEPS = ['Pending', 'Confirmed', 'Preparing', 'Ready', 'Completed'];

function activeStepIdx(status: string): number {
  const s = status?.toLowerCase();
  if (s === 'pending') return 0;
  if (s === 'confirmed') return 1;
  if (s === 'preparing' || s === 'in_progress') return 2;
  if (s === 'ready') return 3;
  if (s === 'completed' || s === 'delivered') return 4;
  return 0;
}

export default function OrdersPage() {
  const { orders, setOrders, setCurrentOrder, isLoading, setIsLoading } = useOrderStore();
  const { setPage, showToast } = useUIStore();
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<number>>(new Set());

  const fetchOrders = useCallback(async () => {
    if (!useAuthStore.getState().isAuthenticated) return;
    setIsLoading(true);
    try {
      const res = await api.get('/orders', { params: { page_size: 20 } });
      setOrders(Array.isArray(res.data) ? res.data : (res.data?.items ?? []));
    } catch { showToast('Failed to load orders', 'error'); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { fetchOrders(); }, []);

  const hasActive = orders.some(o => ACTIVE.includes(o.status?.toLowerCase()));

  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (hasActive) pollingRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') fetchOrders();
    }, 30000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [hasActive]);

  const openDetail = (order: Order) => {
    setCurrentOrder(order);
    setPage('order-detail', { orderId: order.id });
  };

  const handleReorder = async (order: Order) => {
    if (!order.store_id) { showToast('Cannot reorder: store missing', 'error'); return; }
    try {
      console.log('[reorder] posting to orders/' + order.id + '/reorder');
      const res = await api.post(`/orders/${order.id}/reorder`);
      console.log('[reorder] response:', res.data);
      const { clearCart } = useCartStore.getState();
      clearCart();
      const items = res.data?.items ?? [];
      for (const item of items) {
        useCartStore.getState().addItem({
          menu_item_id: item.item_id || item.menu_item_id,
          name: item.item_name || item.name || '',
          price: item.unit_price || item.price || 0,
          quantity: item.quantity || 1,
          customization_option_ids: item.customization_option_ids || [],
          customizations: item.customizations || {},
          customization_count: item.customization_count ?? 0,
        } as any);
      }
      setPage('cart');
    } catch { showToast('Failed to reorder', 'error'); }
  };

  const activeOrders = orders.filter(o => ACTIVE.includes(o.status?.toLowerCase()));
  const [pastPage, setPastPage] = useState(1);
  const [allPastOrders, setAllPastOrders] = useState<Order[]>([]);
  const [loadingPast, setLoadingPast] = useState(false);
  const [hasMorePast, setHasMorePast] = useState(true);
  const pastOrdersDisplay = allPastOrders.slice(0, 5);

  const loadPastOrders = async (reset = false) => {
    setLoadingPast(true);
    try {
      const p = reset ? 1 : pastPage + 1;
      const res = await api.get('/orders', { params: { page_size: 10, page: p } });
      const items = Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
      const past = items.filter((o: Order) => !ACTIVE.includes(o.status?.toLowerCase()));
      if (reset) {
        setAllPastOrders(past);
        setPastPage(1);
      } else {
        setAllPastOrders(prev => [...prev, ...past]);
        setPastPage(p);
      }
      setHasMorePast(past.length === 10);
    } catch { console.error('Failed to load past orders'); }
    finally { setLoadingPast(false); }
  };

  useEffect(() => { loadPastOrders(true); }, []);

  if (!isLoading && orders.length === 0) {
    return (
      <div className="orders-screen">
        <div className="orders-header"><h1 className="orders-title">Orders</h1></div>
        <div className="orders-scroll" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="orders-empty">
            <div className="orders-empty-icon"><ShoppingBag size={32} color="#D4DCE5" /></div>
            <p className="orders-empty-title">No orders yet</p>
            <p className="orders-empty-text">Your order history will appear here</p>
            <button className="orders-empty-btn" onClick={() => setPage('menu')}>Start Ordering</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="orders-screen">
      <div className="orders-header">
        <h1 className="orders-title">Orders</h1>
        {hasActive && (
          <span className="orders-auto-badge"><span className="orders-pulse-dot" /> Auto-updating</span>
        )}
      </div>

      <div className="orders-scroll">
        <button className="orders-pull-refresh" onClick={fetchOrders} disabled={isLoading}>
          {isLoading ? <span className="orders-refresh-icon" /> : <RefreshCw size={14} />}
          Tap to refresh
        </button>

        {activeOrders.length > 0 && (
          <>
            <div className="orders-section-label">Active Orders</div>
            {activeOrders.map(order => {
              const step = activeStepIdx(order.status);
              const itemList = order.items?.map(i => i.name).join(', ') || '';
              return (
                <div key={order.id} className="orders-active-card" onClick={() => openDetail(order)}>
                  <div className="orders-active-header">
                    <div className="orders-active-icon"><Receipt size={20} color="#fff" /></div>
                    <div style={{ flex: 1 }}>
                      <div className="orders-active-number">Order #{order.order_number}</div>
                      <div className="orders-active-date">{formatDate(order.created_at)}</div>
                    </div>
                    <span className="orders-active-status-chip">{order.status?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
                  </div>
                  <div className="orders-progress-mini">
                    {STEPS.map((s, i) => (
                      <div key={s} className={`orders-progress-step${i < step ? ' filled' : ''}${i === step ? ' current' : ''}`} />
                    ))}
                  </div>
                  <div className="orders-eta-row">
                    <div className="orders-eta-icon"><Clock size={14} color="#fff" /></div>
                    Estimated ready in ~{5 + (4 - step) * 5} min
                  </div>
                  <div className="orders-active-items">{itemList}</div>
                  <div className="orders-active-footer">
                    <span className="orders-active-total">{formatPrice(order.total)}</span>
                    <button className="orders-track-btn" onClick={e => { e.stopPropagation(); openDetail(order); }}>Track Order</button>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {pastOrdersDisplay.length > 0 && (
          <>
            <div className="orders-section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Past Orders</span>
              {allPastOrders.length > 5 && (
                <span style={{ fontSize: 12, color: '#6A7A8A' }}>{allPastOrders.length} total</span>
              )}
            </div>
            {pastOrdersDisplay.map(order => {
              const badge = getStatusBadge(order.status);
              const firstItem = order.items?.[0];
              const itemPreview = order.items?.map(i => i.name).slice(0, 2).join(', ') || '';
              return (
                <div key={order.id} className="orders-past-card" onClick={() => openDetail(order)}>
                  <div className="orders-past-thumb">
                    {firstItem?.image_url ? <img src={resolveAssetUrl(firstItem.image_url) || ''} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} /> : <Coffee size={20} color="#384B16" />}
                  </div>
                  <div className="orders-past-info">
                    <div className="orders-past-number">Order #{order.order_number}</div>
                    <div className="orders-past-date">{formatDate(order.created_at)} · {itemPreview}</div>
                    <div className="orders-past-bottom">
                      <span className="orders-past-total">{formatPrice(order.total)}</span>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span className={`orders-status-badge ${badge.cls}`}>{badge.label}</span>
                        <button className="orders-reorder-btn" onClick={e => { e.stopPropagation(); handleReorder(order); }}><RotateCcw size={12} /> Reorder</button>
                      </div>
                    </div>
                  </div>
                  </div>
                );
              })}
            {hasMorePast && (
              <button onClick={() => loadPastOrders(false)} disabled={loadingPast}
                style={{ width: '100%', padding: 12, marginTop: 4, background: '#E4EAEF', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, color: '#384B16', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                {loadingPast ? 'Loading...' : `Load More (${allPastOrders.length - pastOrdersDisplay.length} more)`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
