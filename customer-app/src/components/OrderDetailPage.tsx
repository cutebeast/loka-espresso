'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, RotateCcw, XCircle, Share2, MapPin, Phone, Coffee, Check, Clock, User, Truck, Utensils, ShoppingBag } from 'lucide-react';
import { useOrderStore } from '@/stores/orderStore';
import { useUIStore } from '@/stores/uiStore';
import { useCartStore } from '@/stores/cartStore';
import api from '@/lib/api';
import type { Order, CartItem } from '@/lib/api';
import { formatPrice, resolveAssetUrl, LOKA } from '@/lib/tokens';
import { useTranslation } from '@/hooks/useTranslation';

const PICKUP_STEPS = ['Pending', 'Confirmed', 'Preparing', 'Ready', 'Completed'];
const DELIVERY_STEPS = ['Pending', 'Confirmed', 'Preparing', 'Ready', 'On the way', 'Completed'];

function getSteps(orderType?: string): string[] {
  return orderType === 'delivery' ? DELIVERY_STEPS : PICKUP_STEPS;
}

function stepIdx(status: string, orderType?: string): number {
  const s = status?.toLowerCase();
  const isDelivery = orderType === 'delivery';
  if (s === 'pending') return 0;
  if (s === 'confirmed') return 1;
  if (s === 'preparing' || s === 'in_progress') return 2;
  if (isDelivery) {
    if (s === 'ready') return 3;
    if (s === 'out_for_delivery' || s === 'driver_assigned') return 4;
    if (s === 'completed' || s === 'delivered') return 5;
  } else {
    if (s === 'ready') return 3;
    if (s === 'completed' || s === 'picked_up') return 4;
  }
  return 0;
}

function stepTranslationKey(step: string): string {
  const normalized = step.toLowerCase().replace(/ /g, '');
  const map: Record<string, string> = {
    pending: 'orders.status.pending',
    confirmed: 'orders.status.confirmed',
    preparing: 'orders.status.preparing',
    ready: 'orders.status.ready',
    completed: 'orders.status.completed',
    ontheway: 'orders.status.outForDelivery',
  };
  return map[normalized] || '';
}

export default function OrderDetailPage() {
  const { t } = useTranslation();
  const { pageParams, setPage, showToast } = useUIStore();
  const { currentOrder, setCurrentOrder, updateOrder } = useOrderStore();
  const { clearCart } = useCartStore();
  const [order, setOrder] = useState<Order | null>(currentOrder);
  const [loading, setLoading] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const orderId = pageParams.orderId ?? currentOrder?.id ?? null;

  const fetchOrder = useCallback(async (id: number) => {
    setLoading(true);
    try { const res = await api.get(`/orders/${id}`); setOrder(res.data); setCurrentOrder(res.data); }
    catch { showToast(t('toast.loadOrderFailed'), 'error'); }
    finally { setLoading(false); }
  }, [setCurrentOrder, showToast, t]);

  useEffect(() => {
    if (!orderId) { setPage('orders'); return; }
    if (!order || order.id !== orderId) fetchOrder(orderId);
  }, [orderId]);

  const handleReorder = async () => {
    if (!order?.store_id) { showToast(t('toast.cannotReorder'), 'error'); return; }
    setReordering(true);
    try {
      const res = await api.post(`/orders/${order.id}/reorder`);
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
    finally { setReordering(false); }
  };

  const CANCELLABLE = ['pending', 'confirmed'];
  const handleCancel = async () => {
    if (!order) return;
    if (!CANCELLABLE.includes(order.status?.toLowerCase())) {
      showToast(t('toast.notCancellable'), 'error');
      return;
    }
    setCancelling(true);
    try { await api.post(`/orders/${order.id}/cancel`); showToast(t('toast.orderCancelled'), 'info'); updateOrder(order.id, { status: 'cancelled' }); setOrder(o => o ? { ...o, status: 'cancelled' } : o); }
    catch { showToast(t('toast.cancelFailed'), 'error'); }
    finally { setCancelling(false); }
  };

  const handleShare = () => {
    if (!order) return;
    const dateStr = new Date(order.created_at).toLocaleString('en-MY');
    const statusKey = `orders.status.${order.status?.toLowerCase()}`;
    const statusLabel = t(statusKey);
    const lines = [
      t('orderDetail.shareTitle', { number: order.order_number }),
      t('orderDetail.shareDate', { date: dateStr }),
      t('orderDetail.shareStatus', { status: statusLabel !== statusKey ? statusLabel : order.status }),
      '',
      t('orderDetail.shareItems'),
      ...(order.items?.map(i => t('orderDetail.shareItemLine', { name: i.name, quantity: i.quantity, price: formatPrice((i.price ?? i.unit_price ?? 0) * i.quantity) })) || []),
      '',
      ...(order.subtotal != null ? [t('orderDetail.shareSubtotal', { amount: formatPrice(order.subtotal) })] : []),
      ...((order.delivery_fee ?? 0) > 0 ? [t('orderDetail.shareDelivery', { amount: formatPrice(order.delivery_fee ?? 0) })] : []),
      t('orderDetail.shareTotal', { amount: formatPrice(order.total) }),
    ];
    const text = lines.join('\n');
    if (navigator.share) navigator.share({ title: t('orderDetail.orderNumber', { number: order.order_number }), text }).catch(() => {});
    else navigator.clipboard.writeText(text).then(() => showToast(t('toast.receiptCopied'), 'success')).catch(() => {});
  };

  if (loading || !order) {
    return (
      <div className="order-detail-screen">
        <div className="order-detail-header">
          <button className="order-detail-back" onClick={() => setPage('orders')}><ArrowLeft size={20} /></button>
          <h1 className="order-detail-title">{t('orderDetail.title')}</h1>
        </div>
        <div className="order-detail-scroll flex items-center justify-center">{t('common.loading')}</div>
      </div>
    );
  }

  const steps = getSteps(order.order_type);
  const current = stepIdx(order.status, order.order_type);
  const statusKey = `orders.status.${order.status?.toLowerCase()}`;
  const displayStatus = t(statusKey) !== statusKey ? t(statusKey) : (order.status || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="order-detail-screen">
      <div className="order-detail-header">
        <button className="order-detail-back" onClick={() => setPage('orders')}><ArrowLeft size={20} /></button>
        <h1 className="order-detail-title">{t('orderDetail.orderNumber', { number: order.order_number })}</h1>
      </div>

      <div className="order-detail-scroll">
        {/* ETA Card */}
        {['pending', 'confirmed', 'preparing', 'in_progress', 'ready'].includes(order.status?.toLowerCase()) && (
          <div className="od-eta-card">
            <div className="od-eta-title">{order.order_type === 'delivery' ? t('orderDetail.estimatedDelivery') : t('orderDetail.estimatedReady')}</div>
            <div className="od-eta-time">
              {order.pickup_time ? new Date(order.pickup_time).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
            </div>
            <div className="od-eta-sub">{order.order_type === 'delivery' ? t('orderDetail.preparingDelivery') : order.order_type === 'dine_in' ? t('orderDetail.preparingDineIn') : t('orderDetail.preparingPickup')}</div>
            <div className="od-eta-progress"><div className="od-eta-fill" style={{ width: `${Math.min((current / steps.length) * 100, 100)}%` }} /></div>
          </div>
        )}

        {/* Status */}
        <div className="od-section">
          <div className="od-section-title">{t('orderDetail.orderStatus')}</div>
          <div className="od-status-wrap">
            <div className="od-status-label">{displayStatus}</div>
            <div className="text-xs text-muted mt-1">
              {order.status === 'completed' ? t('orderDetail.enjoyOrder') : order.status === 'cancelled' ? t('orderDetail.orderCancelled') : t('orderDetail.orderProcessing')}
            </div>
          </div>
          {order.status !== 'cancelled' ? (
            <div className="od-progress-track">
              {steps.map((step, i) => {
                const done = i < current;
                const cur = i === current;
                const stepKey = stepTranslationKey(step);
                const stepLabel = stepKey ? t(stepKey) : step;
                return (
                  <div key={step} className={`od-progress-col${done ? ' completed' : ''}`}>
                    <div className={`od-step-circle${done ? ' done' : ''}${cur ? ' current' : ''}`}>
                      {done ? <Check size={14} /> : cur ? '⌛' : '·'}
                    </div>
                    <div className={`od-step-text${done ? ' done' : ''}${cur ? ' current' : ''}`}>{stepLabel}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="od-cancelled-banner">{t('orderDetail.orderCancelled')}</div>
          )}
        </div>

        {/* Delivery / Contact Info */}
        {(order.order_type === 'delivery' || order.recipient_name || order.recipient_phone) && (
          <div className="od-section">
            <div className="od-section-title">{order.order_type === 'delivery' ? t('orderDetail.deliveryInfo') : t('orderDetail.contact')}</div>
            {order.recipient_name && (
              <div className="od-info-row">
                <div className="od-info-icon green"><User color="#8A8078" size={14} /></div>
                <div className="od-info-text">
                  <div className="od-info-label">{order.recipient_name}</div>
                </div>
              </div>
            )}
            {order.recipient_phone && (
              <div className="od-info-row">
                <div className="od-info-icon copper"><Phone size={14} /></div>
                <div className="od-info-text">
                  <div className="od-info-label">{t('orderDetail.contactLabel')}</div>
                  <div className="od-info-value">{t('orderDetail.phonePrefix', { phone: order.recipient_phone })}</div>
                </div>
              </div>
            )}
            {order.delivery_address && (
              <div className="od-info-row">
                <div className="od-info-icon green"><MapPin size={14} /></div>
                <div className="od-info-text">
                  <div className="od-info-label">{t('orderDetail.address')}</div>
                  <div className="od-info-value">{typeof order.delivery_address === 'string' ? order.delivery_address : (order.delivery_address as Record<string, string>)?.address || ''}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Order Type */}
        <div className="od-section">
          <div className="od-section-title">{t('orderDetail.orderType')}</div>
          <div className="od-info-row od-info-row-compact">
            <div className="od-info-icon green">{order.order_type === 'delivery' ? <Truck color="#C4893A" size={14} /> : order.order_type === 'dine_in' ? <Utensils color="#4A2210" size={14} /> : <ShoppingBag color="#4A2210" size={14} />}</div>
            <div className="od-info-text">
              <div className="od-info-label">{order.order_type === 'delivery' ? t('cart.mode.delivery') : order.order_type === 'dine_in' ? t('cart.mode.dineIn') : t('cart.mode.pickup')}</div>
              <div className="od-info-value">{order.store_name ? t('orderDetail.fromStore', { store: order.store_name }) : order.store_address || t('orderDetail.storeId', { id: order.store_id || '?' })}</div>
              {order.store_address && order.store_name && (
                <div className="od-info-value text-xxs mt-1">{order.store_address}</div>
              )}
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="od-section">
          <div className="od-section-title">{t('orderDetail.orderItems')}</div>
          {order.items?.map((item, i) => {
            const price = Number(item.price ?? item.unit_price ?? 0);
            const meta = typeof item.customizations === 'object' && item.customizations
              ? ((item.customizations as Record<string, unknown>)?.options as Array<{ name?: string }>)?.map((o) => { const n = o.name || ''; const px = n.indexOf(': '); return px >= 0 ? n.slice(px + 2) : n; })?.join(' · ') || ''
              : '';
            return (
              <div key={i} className="od-item-row">
                <div className="od-item-thumb">
                  {item.image_url ? <img src={resolveAssetUrl(item.image_url) || ''} alt="" loading="lazy" className="w-full h-full object-cover rounded-xl" /> : <Coffee size={18} color={LOKA.primary} />}
                </div>
                <div className="od-item-details">
                  <div className="od-item-name">{item.name}{item.quantity > 1 ? ` × ${item.quantity}` : ''}</div>
                  {meta && <div className="od-item-meta">{meta}</div>}
                </div>
                <div className="od-item-price">{formatPrice(price * item.quantity)}</div>
              </div>
            );
          })}
          <div className="od-summary-divider">
            {order.subtotal != null && <div className="od-summary-row"><span className="od-summary-label">{t('cart.subtotal')}</span><span className="od-summary-value">{formatPrice(order.subtotal)}</span></div>}
            {(order.delivery_fee ?? 0) > 0 && <div className="od-summary-row"><span className="od-summary-label">{t('orderDetail.deliveryFee')}</span><span className="od-summary-value">{formatPrice(order.delivery_fee ?? 0)}</span></div>}
            {(order.discount ?? 0) > 0 && <div className="od-summary-row"><span className="od-summary-label">{t('orderDetail.discount')}</span><span className="od-summary-value">-{formatPrice(order.discount ?? 0)}</span></div>}
            <div className="od-summary-total"><span>{t('cart.total')}</span><span>{formatPrice(order.total)}</span></div>
          </div>
        </div>

        {/* Payment */}
        <div className="od-section">
          <div className="od-section-title">{t('orderDetail.payment')}</div>
          <div className="od-payment-row">
            <div className="od-payment-icon">{order.payment_method === 'wallet' ? 'L' : order.payment_method?.toUpperCase()?.slice(0, 4) || 'COD'}</div>
            <div className="od-payment-text">{order.payment_method === 'wallet' ? t('orderDetail.lokaWallet') : order.payment_method === 'cod' ? t('checkout.cashOnDelivery') : order.payment_method === 'pay_at_store' ? t('checkout.payAtStore') : order.payment_method} — {formatPrice(order.total)}</div>
          </div>
        </div>

        {/* Actions */}
        <div className="od-action-bar">
          <button className="od-reorder-btn" onClick={handleReorder} disabled={reordering}>
            <RotateCcw size={16} className="mr-1" />
            {reordering ? t('orderDetail.addingToCart') : t('orderDetail.reorderAll')}
          </button>
          <div className="od-secondary-actions">
            <button className="od-secondary-btn secondary" onClick={handleShare}><Share2 size={14} /> {t('orderDetail.share')}</button>
            {['pending', 'confirmed'].includes(order.status?.toLowerCase()) && (
              <button className="od-secondary-btn danger" onClick={handleCancel} disabled={cancelling}>
                <XCircle size={14} /> {cancelling ? t('orderDetail.cancelling') : t('orderDetail.cancelOrder')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
