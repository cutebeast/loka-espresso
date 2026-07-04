'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, RotateCcw, XCircle, Share2, MapPin, Phone, Coffee, Check, User, Truck, Utensils, ShoppingBag, CreditCard } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import StripePaymentSheet from '@/components/stripe/StripePaymentSheet';
import { useOrderStore } from '@/stores/orderStore';
import { useUIStore } from '@/stores/uiStore';
import { useCartStore } from '@/stores/cartStore';
import api from '@/lib/api';
import type { Order, CartItem } from '@/lib/api';
import { formatPrice, resolveAssetUrl, LOKA } from '@/lib/tokens';
import { useTranslation } from '@/hooks/useTranslation';

const PICKUP_STEPS = ['orders.steps.pending', 'orders.steps.confirmed', 'orders.steps.preparing', 'orders.steps.ready', 'orders.steps.completed'];
const DELIVERY_STEPS = ['orders.steps.pending', 'orders.steps.confirmed', 'orders.steps.preparing', 'orders.steps.ready', 'orders.steps.outForDelivery', 'orders.steps.completed'];

function getSteps(orderType?: string): string[] {
  return orderType === 'delivery' ? DELIVERY_STEPS : PICKUP_STEPS;
}

function getStripeRedirectStatus(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('redirect_status');
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

export default function OrderDetailPage() {
  const { t, locale } = useTranslation();
  const { pageParams, setPage, showToast } = useUIStore();
  const { currentOrder, setCurrentOrder, updateOrder } = useOrderStore();
  const { clearCart } = useCartStore();
  const [order, setOrder] = useState<Order | null>(currentOrder);
  const [loading, setLoading] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [processingReturn, setProcessingReturn] = useState(false);
  const [paySheetOpen, setPaySheetOpen] = useState(false);
  const [payIntent, setPayIntent] = useState<{ paymentId: number; clientSecret: string } | null>(null);
  const [stripePublishableKey, setStripePublishableKey] = useState('');
  const [hitpayEnabled, setHitpayEnabled] = useState(false);
  const orderId = pageParams.orderId ?? currentOrder?.id ?? null;
  const hashStatus = pageParams.status as string | undefined;
  const returnPaymentId = pageParams.paymentId as string | undefined;
  // Stripe redirect methods (FPX/GrabPay/3DS) append redirect_status to the
  // query string, while our hash fragment may hard-code status=success.
  const redirectStatus = getStripeRedirectStatus();
  const returnStatus = redirectStatus ?? hashStatus;

  const fetchOrder = useCallback(async (id: number) => {
    setLoading(true);
    try { const res = await api.get(`/orders/${id}`); const o = res.data as Order; setOrder(o); setCurrentOrder(o); }
    catch { showToast(t('toast.loadOrderFailed'), 'error'); }
    finally { setLoading(false); }
  }, [setCurrentOrder, showToast, t]);

  useEffect(() => {
    if (!orderId) { setPage('orders'); return; }
    if (!order || order.id !== orderId) fetchOrder(orderId);
  }, [orderId]);

  useEffect(() => {
    api.get('/payments/config')
      .then((res) => {
        const cfg = res.data || {};
        if (cfg.stripe_publishable_key) setStripePublishableKey(cfg.stripe_publishable_key);
        setHitpayEnabled(!!cfg.hitpay_enabled);
      })
      .catch((e: unknown) => console.error('[OrderDetail] payment config failed:', e));
  }, []);

  // Handle Stripe PaymentElement return (success / cancel)
  useEffect(() => {
    if (!orderId || !returnPaymentId || processingReturn) return;
    const paymentId = parseInt(returnPaymentId, 10);
    if (Number.isNaN(paymentId)) return;
    setProcessingReturn(true);

    const handleReturn = async () => {
      try {
        if (returnStatus === 'success' || returnStatus === 'completed') {
          await api.post(`/payments/${paymentId}/confirm`, {});
          showToast(t('toast.paymentSuccessful'), 'success');
        } else if (returnStatus === 'cancel' || returnStatus === 'canceled' || returnStatus === 'failed') {
          await api.post(`/payments/${paymentId}/cancel`, {});
          showToast(t('toast.paymentCancelled'), 'info');
        }
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('toast.paymentFailed');
        showToast(msg, 'error');
      } finally {
        // Remove status/paymentId from URL so we don't reprocess on refresh
        if (typeof window !== 'undefined') {
          const newHash = `order-detail?orderId=${orderId}`;
          if (window.location.hash !== `#${newHash}`) {
            window.location.hash = newHash;
          }
        }
        await fetchOrder(orderId);
        setProcessingReturn(false);
      }
    };

    handleReturn();
  }, [orderId, returnPaymentId, returnStatus, processingReturn, fetchOrder, showToast, t]);

  const handleReorder = async () => {
    if (!order?.store_id) { showToast(t('toast.cannotReorder'), 'error'); return; }
    setReordering(true);
    try {
      const res = await api.post(`/orders/${order.id}/reorder`);
      clearCart();
      await new Promise<void>((resolve) => {
        const check = () => {
          const { items } = useCartStore.getState();
          if (items.length === 0) { resolve(); return; }
          setTimeout(check, 50);
        };
        check();
      });
      const storeId = res.data?.store_id || order.store_id;
      const cartRes = await api.get('/cart/items', { params: { store_id: storeId } });
      const items = cartRes.data ?? [];
      for (const item of items) {
        const cartItem: CartItem = {
          menu_item_id: item.menu_item_id || item.item_id,
          name: item.item_name || '',
          price: item.unit_price || 0,
          quantity: item.quantity || 1,
          customization_option_ids: item.modifier_option_ids || item.customization_option_ids || [],
          customizations: item.selected_modifiers || item.customizations || {},
          customization_count: (item.modifier_option_ids || item.customization_option_ids || []).length,
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
    try { await api.post(`/orders/${order.id}/cancel`); showToast(t('toast.orderCancelled'), 'info'); updateOrder(order.id, { status: 'cancelled_by_customer' }); setOrder(o => o ? { ...o, status: 'cancelled_by_customer' } : o); }
    catch { showToast(t('toast.cancelFailed'), 'error'); }
    finally { setCancelling(false); }
  };

  const canPayOnline = order && (
    (order.status?.toLowerCase() === 'awaiting_payment' || order.status?.toLowerCase() === 'pending') ||
    ['pending', 'initiated', 'pending_authorization'].includes(order.payment_status?.toLowerCase() || '')
  );

  const handleInitiatePayment = async () => {
    if (!order) return;
    try {
      if (stripePublishableKey) {
        const res = await api.post('/payments/intent', { order_id: order.id, provider: 'stripe', payment_method: 'gateway' });
        const data = res.data;
        if (!data?.client_secret || !data?.payment_id) throw new Error('Unable to start payment');
        setPayIntent({ paymentId: data.payment_id, clientSecret: data.client_secret });
        setPaySheetOpen(true);
      } else if (hitpayEnabled) {
        const res = await api.post('/payments/intent', { order_id: order.id, provider: 'hitpay', payment_method: 'hitpay' });
        const data = res.data;
        if (!data?.redirect_url || !data?.payment_id) throw new Error('Unable to start payment');
        window.location.href = data.redirect_url;
      } else {
        throw new Error('No online payment provider available');
      }
    } catch (e: unknown) {
      showToast((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('toast.paymentFailed'), 'error');
    }
  };

  const handleShare = () => {
    if (!order) return;
    const dateStr = new Date(order.created_at).toLocaleString(locale);
    const statusKey = `orders.status.${order.status?.toLowerCase()}`;
    const statusLabel = t(statusKey);
    const lines = [
      t('orderDetail.shareTitle', { number: order.order_number }),
      t('orderDetail.shareDate', { date: dateStr }),
      t('orderDetail.shareStatus', { status: statusLabel !== statusKey ? statusLabel : order.status }),
      '',
      t('orderDetail.shareItems'),
      ...(order.line_items?.map(i => t('orderDetail.shareItemLine', { name: i.item_name, quantity: i.quantity, price: formatPrice((i.unit_price || i.line_total || 0) * i.quantity) })) || []),
      '',
      ...(order.items_subtotal != null ? [t('orderDetail.shareSubtotal', { amount: formatPrice(order.items_subtotal) })] : []),
      ...((order.delivery_fee ?? 0) > 0 ? [t('orderDetail.shareDelivery', { amount: formatPrice(order.delivery_fee ?? 0) })] : []),
      t('orderDetail.shareTotal', { amount: formatPrice(order.total_amount) }),
    ];
    const text = lines.join('\n');
    if (navigator.share) navigator.share({ title: t('orderDetail.orderNumber', { number: order.order_number }), text }).catch((err) => console.error('[OrderDetail] Share failed:', err));
    else navigator.clipboard.writeText(text).then(() => showToast(t('toast.receiptCopied'), 'success')).catch((err) => console.error('[OrderDetail] Clipboard copy failed:', err));
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
              {order.pickup_time ? new Date(order.pickup_time).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '--:--'}
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
              {order.status === 'completed' ? t('orderDetail.enjoyOrder') : (order.status || '').startsWith('cancelled') ? t('orderDetail.orderCancelled') : t('orderDetail.orderProcessing')}
            </div>
          </div>
          {!(order.status || '').startsWith('cancelled') ? (
            <div className="od-progress-track">
              {steps.map((step, i) => {
                const done = i < current;
                const cur = i === current;
                const stepLabel = t(step);
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
          {canPayOnline && (
            <button onClick={handleInitiatePayment} className="w-full mt-4 rounded-xl bg-[#C8A46E] px-4 py-3 text-sm font-semibold text-black flex items-center justify-center gap-2">
              <CreditCard size={16} /> {t('orderDetail.payNow')}
            </button>
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
          {order.line_items?.map((item, i) => {
            const price = Number(item.unit_price ?? item.line_total ?? 0);
            const meta = typeof item.selected_modifiers === 'object' && item.selected_modifiers
              ? ((item.selected_modifiers as Record<string, unknown>)?.options as Array<{ name?: string }>)?.map((o) => { const n = o.name || ''; const px = n.indexOf(': '); return px >= 0 ? n.slice(px + 2) : n; })?.join(' · ') || ''
              : '';
            return (
              <div key={item.id ?? i} className="od-item-row">
                <div className="od-item-thumb">
                  {item.image_url ? <img src={resolveAssetUrl(item.image_url) || ''} alt={item.item_name || 'Menu item'} loading="lazy" className="w-full h-full object-cover rounded-xl" /> : <Coffee size={18} color={LOKA.primary} />}
                </div>
                <div className="od-item-details">
                  <div className="od-item-name">{item.item_name}{item.quantity > 1 ? ` × ${item.quantity}` : ''}</div>
                  {meta && <div className="od-item-meta">{meta}</div>}
                </div>
                <div className="od-item-price">{formatPrice(price * item.quantity)}</div>
              </div>
            );
          })}
          <div className="od-summary-divider">
            {order.items_subtotal != null && <div className="od-summary-row"><span className="od-summary-label">{t('cart.subtotal')}</span><span className="od-summary-value">{formatPrice(order.items_subtotal)}</span></div>}
            {(order.delivery_fee ?? 0) > 0 && <div className="od-summary-row"><span className="od-summary-label">{t('orderDetail.deliveryFee')}</span><span className="od-summary-value">{formatPrice(order.delivery_fee ?? 0)}</span></div>}
            {(order.discount_amount ?? 0) > 0 && <div className="od-summary-row"><span className="od-summary-label">{t('orderDetail.discount')}</span><span className="od-summary-value">-{formatPrice(order.discount_amount ?? 0)}</span></div>}
            <div className="od-summary-total"><span>{t('cart.total')}</span><span>{formatPrice(order.total_amount)}</span></div>
          </div>
        </div>

        {/* Payment */}
        <div className="od-section">
          <div className="od-section-title">{t('orderDetail.payment')}</div>
          <div className="od-payment-row">
            <div className="od-payment-icon">{order.payment_method === 'wallet' ? 'L' : order.payment_method?.toUpperCase()?.slice(0, 4) || 'COD'}</div>
            <div className="od-payment-text">{order.payment_method === 'wallet' ? t('orderDetail.lokaWallet') : order.payment_method === 'cod' ? t('checkout.cashOnDelivery') : order.payment_method === 'pay_at_store' ? t('checkout.payAtStore') : order.payment_method} — {formatPrice(order.total_amount)}</div>
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
      <BottomSheet isOpen={paySheetOpen} onClose={() => setPaySheetOpen(false)} title={t('checkout.payOnline')}>
        <div className="sheet-body">
          {payIntent && order && stripePublishableKey && (
            <StripePaymentSheet
              clientSecret={payIntent.clientSecret}
              paymentId={payIntent.paymentId}
              orderId={order.id}
              publishableKey={stripePublishableKey}
              onSuccess={() => {
                setPaySheetOpen(false);
                setPayIntent(null);
                showToast(t('toast.paymentSuccessful'), 'success');
                if (orderId) fetchOrder(orderId);
              }}
              onCancel={() => {
                setPaySheetOpen(false);
                setPayIntent(null);
                showToast(t('toast.paymentCancelled'), 'info');
              }}
              onError={(msg) => showToast(msg, 'error')}
            />
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
