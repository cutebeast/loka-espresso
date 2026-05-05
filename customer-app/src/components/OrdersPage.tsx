'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { RefreshCw, ShoppingBag, Receipt, Clock, RotateCcw, Coffee } from 'lucide-react';
import { useOrderStore } from '@/stores/orderStore';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useCartStore } from '@/stores/cartStore';
import api from '@/lib/api';
import type { Order, CartItem } from '@/lib/api';
import { formatPrice, resolveAssetUrl, LOKA } from '@/lib/tokens';
import { useTranslation } from '@/hooks/useTranslation';
import { t } from '@/lib/i18n';

function getStatusBadge(status: string): { label: string; cls: string } {
  const s = status?.toLowerCase();
  if (s === 'delivered' || s === 'completed') return { label: t('orders.status.delivered'), cls: 'delivered' };
  if (s === 'cancelled') return { label: t('orders.status.cancelled'), cls: 'cancelled' };
  const key = `orders.status.${s}`;
  const translated = t(key);
  return { label: translated !== key ? translated : (status?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || ''), cls: '' };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `${t('common.today')}, ${d.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}`;
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
  const { t } = useTranslation();
  const { orders, setOrders, setCurrentOrder, isLoading, setIsLoading } = useOrderStore();
  const { setPage, showToast } = useUIStore();
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!useAuthStore.getState().isAuthenticated) return;
    setIsLoading(true);
    try {
      const res = await api.get('/orders', { params: { page_size: 20 } });
      setOrders(Array.isArray(res.data) ? res.data : (res.data?.items ?? []));
    } catch { showToast(t('toast.loadOrdersFailed'), 'error'); }
    finally { setIsLoading(false); }
  }, [setIsLoading, setOrders, showToast, t]);

  useEffect(() => { fetchOrders(); }, []);

  const hasActive = orders.some(o => ACTIVE.includes(o.status?.toLowerCase()));
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (hasActive) pollingRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') { fetchOrders(); setLastUpdated(new Date()); }
    }, 30000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [hasActive, fetchOrders]);

  const openDetail = (order: Order) => {
    setCurrentOrder(order);
    setPage('order-detail', { orderId: order.id });
  };

  const handleReorder = async (order: Order) => {
    if (!order.store_id) { showToast(t('toast.cannotReorder'), 'error'); return; }
    try {
      const res = await api.post(`/orders/${order.id}/reorder`);
      const { clearCart } = useCartStore.getState();
      clearCart();
      const items = res.data?.items ?? [];
      for (const item of items) {
        const cartItem: CartItem = {
          menu_item_id: item.item_id || item.menu_item_id,
          name: item.item_name || item.name || '',
          price: item.unit_price || item.price || 0,
          quantity: item.quantity || 1,
          customization_option_ids: item.customization_option_ids || [],
          customizations: item.customizations || {},
          customization_count: item.customization_count ?? 0,
        };
        useCartStore.getState().addItem(cartItem);
      }
      setPage('cart');
    } catch { showToast(t('toast.reorderFailed'), 'error'); }
  };

  const activeOrders = orders.filter(o => ACTIVE.includes(o.status?.toLowerCase()));
  const [pastPage, setPastPage] = useState(1);
  const [allPastOrders, setAllPastOrders] = useState<Order[]>([]);
  const [loadingPast, setLoadingPast] = useState(false);
  const [hasMorePast, setHasMorePast] = useState(true);
  const pastOrdersDisplay = allPastOrders.slice(0, 5);

  const loadPastOrders = useCallback(async (reset = false) => {
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
    } catch (err) { console.error('[OrdersPage] Failed to load past orders:', err); }
    finally { setLoadingPast(false); }
  }, [pastPage]);

  useEffect(() => { loadPastOrders(true); }, [loadPastOrders]);

  if (!isLoading && orders.length === 0) {
    return (
      <div className="orders-screen">
        <div className="orders-header"><h1 className="orders-title">{t('orders.title')}</h1></div>
        <div className="orders-scroll flex items-center justify-center">
          <div className="orders-empty">
            <div className="orders-empty-icon"><ShoppingBag size={32} color={LOKA.borderLight} /></div>
            <p className="orders-empty-title">{t('orders.emptyTitle')}</p>
            <p className="orders-empty-text">{t('orders.emptySubtitle')}</p>
            <button className="orders-empty-btn" onClick={() => setPage('menu')}>{t('orders.startOrdering')}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="orders-screen">
      <div className="orders-header">
        <h1 className="orders-title">{t('orders.title')}</h1>
        {hasActive && (
          <span className="orders-auto-badge"><span className="orders-pulse-dot" /> {t('orders.autoUpdating')}</span>
        )}
      </div>

      <div className="orders-scroll">
        <button className="orders-pull-refresh" onClick={fetchOrders} disabled={isLoading}>
          {isLoading ? <span className="orders-refresh-icon" /> : <RefreshCw size={14} />}
          {t('orders.tapToRefresh')}
        </button>

        {activeOrders.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <div className="orders-section-label">{t('orders.activeOrders')}</div>
              {lastUpdated && <span className="orders-last-updated">{t('orders.updatedAt', { time: lastUpdated.toLocaleTimeString() })}</span>}
            </div>
            {activeOrders.map(order => {
              const step = activeStepIdx(order.status);
              const itemList = order.items?.map(i => i.name).join(', ') || '';
              return (
                <div key={order.id} className="orders-active-card" onClick={() => openDetail(order)}>
                  <div className="orders-active-header">
                    <div className="orders-active-icon"><Receipt size={20} color="#fff" /></div>
                    <div className="flex-1">
                      <div className="orders-active-number">{t('orders.orderNumber', { number: order.order_number })}</div>
                      <div className="orders-active-date">{formatDate(order.created_at)}</div>
                    </div>
                    <span className="orders-active-status-chip">{getStatusBadge(order.status).label}</span>
                  </div>
                  <div className="orders-progress-mini">
                    {STEPS.map((s, i) => (
                      <div key={s} className={`orders-progress-step${i < step ? ' filled' : ''}${i === step ? ' current' : ''}`} />
                    ))}
                  </div>
                  <div className="orders-eta-row">
                    <div className="orders-eta-icon"><Clock size={14} color="#fff" /></div>
                    {t('orders.eta', { minutes: 5 + (4 - step) * 5 })}
                  </div>
                  <div className="orders-active-items">{itemList}</div>
                  <div className="orders-active-footer">
                    <span className="orders-active-total">{formatPrice(order.total)}</span>
                    <button className="orders-track-btn" onClick={e => { e.stopPropagation(); openDetail(order); }}>{t('orders.trackOrder')}</button>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {pastOrdersDisplay.length > 0 && (
          <>
            <div className="orders-section-label flex items-center justify-between">
              <span>{t('orders.pastOrders')}</span>
              {allPastOrders.length > 5 && (
                <span className="orders-total-count">{t('orders.totalCount', { count: allPastOrders.length })}</span>
              )}
            </div>
            {pastOrdersDisplay.map(order => {
              const badge = getStatusBadge(order.status);
              const firstItem = order.items?.[0];
              const itemPreview = order.items?.map(i => i.name).slice(0, 2).join(', ') || '';
              return (
                <div key={order.id} className="orders-past-card" onClick={() => openDetail(order)}>
                  <div className="orders-past-thumb">
                    {firstItem?.image_url ? <img src={resolveAssetUrl(firstItem.image_url) || ''} alt="" loading="lazy" className="w-full h-full object-cover rounded-xl" /> : <Coffee size={20} color={LOKA.primary} />}
                  </div>
                  <div className="orders-past-info">
                    <div className="orders-past-number">{t('orders.orderNumber', { number: order.order_number })}</div>
                    <div className="orders-past-date">{formatDate(order.created_at)} · {itemPreview}</div>
                    <div className="orders-past-bottom">
                      <span className="orders-past-total">{formatPrice(order.total)}</span>
                      <div className="flex gap-2 items-center">
                        <span className={`orders-status-badge ${badge.cls}`}>{badge.label}</span>
                        <button className="orders-reorder-btn" onClick={e => { e.stopPropagation(); handleReorder(order); }}><RotateCcw size={12} /> {t('orders.reorder')}</button>
                      </div>
                    </div>
                  </div>
                  </div>
                );
              })}
            {hasMorePast && (
              <button onClick={() => loadPastOrders(false)} disabled={loadingPast}
                className="orders-load-more-btn">
                {loadingPast ? t('common.loading') : t('orders.loadMore', { count: allPastOrders.length - pastOrdersDisplay.length })}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
