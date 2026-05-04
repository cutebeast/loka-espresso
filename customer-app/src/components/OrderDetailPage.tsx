'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, RotateCcw, XCircle, Share2, MapPin, Phone, Coffee, Check, Clock } from 'lucide-react';
import { useOrderStore } from '@/stores/orderStore';
import { useUIStore } from '@/stores/uiStore';
import { useCartStore } from '@/stores/cartStore';
import api from '@/lib/api';
import type { Order, CartItem } from '@/lib/api';
import { formatPrice, resolveAssetUrl, LOKA } from '@/lib/tokens';

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

export default function OrderDetailPage() {
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
    catch { showToast('Failed to load order', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!orderId) { setPage('orders'); return; }
    if (!order || order.id !== orderId) fetchOrder(orderId);
  }, [orderId]);

  const handleReorder = async () => {
    if (!order?.store_id) { showToast('Cannot reorder: store missing', 'error'); return; }
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
    } catch { showToast('Failed to reorder', 'error'); }
    finally { setReordering(false); }
  };

  const handleCancel = async () => {
    if (!order) return;
    setCancelling(true);
    try { await api.post(`/orders/${order.id}/cancel`); showToast('Order cancelled', 'info'); updateOrder(order.id, { status: 'cancelled' }); setOrder(o => o ? { ...o, status: 'cancelled' } : o); }
    catch { showToast('Failed to cancel', 'error'); }
    finally { setCancelling(false); }
  };

  const handleShare = () => {
    if (!order) return;
    const lines = [`Loka Espresso - Order #${order.order_number}`, `Date: ${new Date(order.created_at).toLocaleString('en-MY')}`, `Status: ${order.status}`, '', 'Items:', ...(order.items?.map(i => `  ${i.name} x${i.quantity}  ${formatPrice((i.price ?? i.unit_price ?? 0) * i.quantity)}`) || []), '', ...(order.subtotal != null ? [`Subtotal: ${formatPrice(order.subtotal)}`] : []), ...((order.delivery_fee ?? 0) > 0 ? [`Delivery: ${formatPrice(order.delivery_fee ?? 0)}`] : []), `Total: ${formatPrice(order.total)}`];
    const text = lines.join('\n');
    if (navigator.share) navigator.share({ title: `Order #${order.order_number}`, text }).catch(() => {});
    else navigator.clipboard.writeText(text).then(() => showToast('Receipt copied', 'success')).catch(() => {});
  };

  if (loading || !order) {
    return (
      <div className="order-detail-screen">
        <div className="order-detail-header">
          <button className="order-detail-back" onClick={() => setPage('orders')}><ArrowLeft size={20} /></button>
          <h1 className="order-detail-title">Order Details</h1>
        </div>
        <div className="order-detail-scroll" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</div>
      </div>
    );
  }

  const steps = getSteps(order.order_type);
  const current = stepIdx(order.status, order.order_type);
  const displayStatus = (order.status || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="order-detail-screen">
      <div className="order-detail-header">
        <button className="order-detail-back" onClick={() => setPage('orders')}><ArrowLeft size={20} /></button>
        <h1 className="order-detail-title">Order #{order.order_number}</h1>
      </div>

      <div className="order-detail-scroll">
        {/* ETA Card */}
        {['pending', 'confirmed', 'preparing', 'in_progress', 'ready'].includes(order.status?.toLowerCase()) && (
          <div className="od-eta-card">
            <div className="od-eta-title">Estimated {order.order_type === 'delivery' ? 'Delivery' : order.order_type === 'dine_in' ? 'Ready' : 'Ready'}</div>
            <div className="od-eta-time">
              {order.pickup_time ? new Date(order.pickup_time).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
            </div>
            <div className="od-eta-sub">{order.order_type === 'delivery' ? 'Our team is preparing your order' : order.order_type === 'dine_in' ? 'Being prepared by our kitchen' : 'Being prepared for pickup'}</div>
            <div className="od-eta-progress"><div className="od-eta-fill" style={{ width: `${Math.min((current / steps.length) * 100, 100)}%` }} /></div>
          </div>
        )}

        {/* Status */}
        <div className="od-section">
          <div className="od-section-title">Order Status</div>
          <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--loka-accent-copper)' }}>{displayStatus}</div>
            <div style={{ fontSize: 12, color: 'var(--loka-text-muted)', marginTop: 2 }}>
              {order.status === 'completed' ? 'Enjoy your order!' : order.status === 'cancelled' ? 'This order was cancelled' : 'Your order is being processed'}
            </div>
          </div>
          {order.status !== 'cancelled' ? (
            <div className="od-progress-track">
              {steps.map((step, i) => {
                const done = i < current;
                const cur = i === current;
                return (
                  <div key={step} className={`od-progress-col${done ? ' completed' : ''}`}>
                    <div className={`od-step-circle${done ? ' done' : ''}${cur ? ' current' : ''}`}>
                      {done ? <Check size={14} /> : cur ? '⌛' : '·'}
                    </div>
                    <div className={`od-step-text${done ? ' done' : ''}${cur ? ' current' : ''}`}>{step}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--loka-danger)', fontWeight: 600 }}>This order was cancelled</div>
          )}
        </div>

        {/* Delivery / Contact Info */}
        {(order.order_type === 'delivery' || order.recipient_name || order.recipient_phone) && (
          <div className="od-section">
            <div className="od-section-title">{order.order_type === 'delivery' ? 'Delivery Info' : 'Contact'}</div>
            {order.recipient_name && (
              <div className="od-info-row">
                <div className="od-info-icon green">👤</div>
                <div className="od-info-text">
                  <div className="od-info-label">{order.recipient_name}</div>
                </div>
              </div>
            )}
            {order.recipient_phone && (
              <div className="od-info-row">
                <div className="od-info-icon copper"><Phone size={14} /></div>
                <div className="od-info-text">
                  <div className="od-info-label">Contact</div>
                  <div className="od-info-value">+60 {order.recipient_phone}</div>
                </div>
              </div>
            )}
            {order.delivery_address && (
              <div className="od-info-row">
                <div className="od-info-icon green"><MapPin size={14} /></div>
                <div className="od-info-text">
                  <div className="od-info-label">Address</div>
                  <div className="od-info-value">{typeof order.delivery_address === 'string' ? order.delivery_address : (order.delivery_address as Record<string, string>)?.address || ''}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Order Type */}
        <div className="od-section">
          <div className="od-section-title">Order Type</div>
          <div className="od-info-row" style={{ padding: 0 }}>
            <div className="od-info-icon green">{order.order_type === 'delivery' ? '🛵' : order.order_type === 'dine_in' ? '🍽️' : '🛍️'}</div>
            <div className="od-info-text">
              <div className="od-info-label">{order.order_type === 'delivery' ? 'Delivery' : order.order_type === 'dine_in' ? 'Dine-in' : 'Pickup'}</div>
              <div className="od-info-value">{order.store_name ? `From ${order.store_name}` : order.store_address || `Store #${order.store_id || '?'}`}</div>
              {order.store_address && order.store_name && (
                <div className="od-info-value" style={{ fontSize: 11, marginTop: 2 }}>{order.store_address}</div>
              )}
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="od-section">
          <div className="od-section-title">Order Items</div>
          {order.items?.map((item, i) => {
            const price = Number(item.price ?? item.unit_price ?? 0);
            const meta = typeof item.customizations === 'object' && item.customizations
              ? ((item.customizations as Record<string, unknown>)?.options as Array<{ name?: string }>)?.map((o) => { const n = o.name || ''; const px = n.indexOf(': '); return px >= 0 ? n.slice(px + 2) : n; })?.join(' · ') || ''
              : '';
            return (
              <div key={i} className="od-item-row">
                <div className="od-item-thumb">
                  {item.image_url ? <img src={resolveAssetUrl(item.image_url) || ''} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} /> : <Coffee size={18} color={LOKA.primary} />}
                </div>
                <div className="od-item-details">
                  <div className="od-item-name">{item.name}{item.quantity > 1 ? ` × ${item.quantity}` : ''}</div>
                  {meta && <div className="od-item-meta">{meta}</div>}
                </div>
                <div className="od-item-price">{formatPrice(price * item.quantity)}</div>
              </div>
            );
          })}
          <div style={{ marginTop: 10, borderTop: `1px solid ${LOKA.borderLight}`, paddingTop: 10 }}>
            {order.subtotal != null && <div className="od-summary-row"><span className="od-summary-label">Subtotal</span><span className="od-summary-value">{formatPrice(order.subtotal)}</span></div>}
            {(order.delivery_fee ?? 0) > 0 && <div className="od-summary-row"><span className="od-summary-label">Delivery Fee</span><span className="od-summary-value">{formatPrice(order.delivery_fee ?? 0)}</span></div>}
            {(order.discount ?? 0) > 0 && <div className="od-summary-row"><span className="od-summary-label">Discount</span><span className="od-summary-value">-{formatPrice(order.discount ?? 0)}</span></div>}
            <div className="od-summary-total"><span>Total</span><span>{formatPrice(order.total)}</span></div>
          </div>
        </div>

        {/* Payment */}
        <div className="od-section">
          <div className="od-section-title">Payment</div>
          <div className="od-payment-row">
            <div className="od-payment-icon">{order.payment_method === 'wallet' ? 'L' : order.payment_method?.toUpperCase()?.slice(0, 4) || 'COD'}</div>
            <div className="od-payment-text">{order.payment_method === 'wallet' ? 'Loka Wallet' : order.payment_method === 'cod' ? 'Cash on Delivery' : order.payment_method === 'pay_at_store' ? 'Pay at Store' : order.payment_method} — {formatPrice(order.total)}</div>
          </div>
        </div>

        {/* Actions */}
        <div className="od-action-bar">
          <button className="od-reorder-btn" onClick={handleReorder} disabled={reordering}>
            <RotateCcw size={16} style={{ marginRight: 6 }} />
            {reordering ? 'Adding to cart…' : 'Reorder All Items'}
          </button>
          <div className="od-secondary-actions">
            <button className="od-secondary-btn secondary" onClick={handleShare}><Share2 size={14} /> Share</button>
            {['pending', 'confirmed'].includes(order.status?.toLowerCase()) && (
              <button className="od-secondary-btn danger" onClick={handleCancel} disabled={cancelling}>
                <XCircle size={14} /> {cancelling ? 'Cancelling…' : 'Cancel Order'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
