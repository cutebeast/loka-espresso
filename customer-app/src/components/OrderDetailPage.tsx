'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  RotateCcw,
  XCircle,
  Share2,
  Truck,
  UtensilsCrossed,
  ShoppingBag,
  Clock,
  MapPin,
  Check,
} from 'lucide-react';
import { useOrderStore } from '@/stores/orderStore';
import { useUIStore } from '@/stores/uiStore';
import { useCartStore } from '@/stores/cartStore';
import api from '@/lib/api';
import type { Order } from '@/lib/api';

function formatPrice(val: number | string): string {
  return `RM ${Number(val).toFixed(2)}`;
}

/* Timeline steps matching ordertrack.html reference */
const PICKUP_STEPS = ['Pending', 'Confirmed', 'Preparing', 'Ready', 'Completed'];
const DELIVERY_STEPS = ['Pending', 'Confirmed', 'Preparing', 'Ready', 'On the way', 'Completed'];

function getTimelineSteps(order: Order): string[] {
  return order.order_type === 'delivery' ? DELIVERY_STEPS : PICKUP_STEPS;
}

function getStatusStepIndex(status: string, orderType?: string): number {
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

function getOrderTypeLabel(order: Order): string {
  const t = order.order_type;
  if (t === 'delivery') return 'Delivery';
  if (t === 'dine_in') return 'Dine-in';
  return 'Pickup';
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
    try {
      const res = await api.get(`/orders/${id}`);
      setOrder(res.data);
      setCurrentOrder(res.data);
    } catch {
      showToast('Failed to load order', 'error');
    } finally {
      setLoading(false);
    }
  }, [setCurrentOrder, showToast]);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      setPage('orders');
      return;
    }
    if (!order || order.id !== orderId) {
      fetchOrder(orderId);
    }
  }, [orderId, order, fetchOrder, setPage]);

  const handleReorder = async () => {
    if (!order) return;
    if (!order.store_id || order.store_id <= 0) {
      showToast('Cannot reorder: store information missing', 'error');
      return;
    }
    setReordering(true);
    try {
      const res = await api.post(`/orders/${order.id}/reorder`);
      const cartItems = res.data?.items ?? [];
      clearCart();
      for (const item of cartItems) {
        useCartStore.getState().addItem(item);
      }
      showToast('Items added to cart', 'success');
      setPage('cart');
    } catch {
      showToast('Failed to reorder', 'error');
    } finally {
      setReordering(false);
    }
  };

  const handleCancel = async () => {
    if (!order) return;
    setCancelling(true);
    try {
      await api.post(`/orders/${order.id}/cancel`);
      showToast('Order cancelled', 'info');
      updateOrder(order.id, { status: 'cancelled' });
      setOrder((o) => o ? { ...o, status: 'cancelled' } : o);
    } catch {
      showToast('Failed to cancel order', 'error');
    } finally {
      setCancelling(false);
    }
  };

  const handleShare = () => {
    if (!order) return;
    const lines = [
      `Loka Espresso - Order #${order.order_number}`,
      `Date: ${new Date(order.created_at).toLocaleString('en-MY')}`,
      `Type: ${getOrderTypeLabel(order)}`,
      `Status: ${order.status}`,
      '',
      'Items:',
      ...(order.items?.map((i) => {
        const unitPrice = Number(i.price ?? i.unit_price ?? 0);
        return `  ${i.name} x${i.quantity}  ${formatPrice(unitPrice * i.quantity)}`;
      }) || []),
      '',
      ...(order.subtotal != null ? [`Subtotal: ${formatPrice(order.subtotal)}`] : []),
      ...((order.delivery_fee ?? 0) > 0 ? [`Delivery: ${formatPrice(order.delivery_fee ?? 0)}`] : []),
      `Total: ${formatPrice(order.total)}`,
    ];
    const text = lines.join('\n');
    if (navigator.share) {
      navigator.share({ title: `Order #${order.order_number}`, text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text).then(() => showToast('Receipt copied', 'success')).catch(() => {});
    }
  };

  if (loading || !order) {
    return (
      <div className="ot-screen">
        <div className="ot-header">
          <button className="ot-back-btn" onClick={() => setPage('orders')}>
            <ArrowLeft size={20} />
          </button>
          <h1 className="ot-title">Order Details</h1>
        </div>
        <div className="ot-loading">
          Loading…
        </div>
      </div>
    );
  }

  const timelineStatus = order.order_type === 'delivery' ? (order.delivery_status || order.status) : order.status;
  const currentStep = getStatusStepIndex(timelineStatus, order.order_type);
  const steps = getTimelineSteps(order);
  const displayStatus = order.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="ot-screen">
      {/* Header */}
      <div className="ot-header">
        <button className="ot-back-btn" onClick={() => setPage('orders')} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <h1 className="ot-title">Order #{order.order_number}</h1>
      </div>

      {/* Content */}
      <div className="ot-scroll">
        {/* Status Card */}
        <div className="ot-status-card">
          <div className="ot-order-number">
            Placed: {new Date(order.created_at).toLocaleDateString('en-MY', {
              day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </div>
          <div className="ot-current-status">{displayStatus}</div>

          {/* Progress Steps */}
          <div className="ot-progress-steps">
            {steps.map((step, i) => {
              const isCompleted = i < currentStep;
              const isCurrent = i === currentStep;
              return (
                <div key={step} className={`ot-step ${isCompleted ? 'completed' : ''} ${isCurrent ? 'active' : ''}`}>
                  <div className="ot-step-connector" />
                  <div className="ot-step-icon">
                    {isCompleted ? <Check size={14} /> : (i + 1)}
                  </div>
                  <span>{step}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Delivery info */}
        {order.order_type === 'delivery' && (
          <div className="ot-delivery-card">
            <div className="ot-courier-icon">
              <Truck size={20} />
            </div>
            <div className="ot-courier-details">
              <div className="ot-courier-name">
                {order.delivery_courier_name || 'Delivery arranged'}
              </div>
              <div className="ot-courier-eta">
                {order.delivery_eta_minutes
                  ? `Estimated arrival in ${order.delivery_eta_minutes} min`
                  : 'Our team is arranging delivery'}
              </div>
            </div>
            {order.delivery_tracking_url && (
              <a className="ot-track-link" href={order.delivery_tracking_url} target="_blank" rel="noreferrer">
                Track
              </a>
            )}
          </div>
        )}

        {/* Order Type Info */}
        <div className="ot-type-info">
          {order.order_type === 'delivery' && <Truck size={14} />}
          {order.order_type === 'dine_in' && <UtensilsCrossed size={14} />}
          {order.order_type === 'pickup' && <ShoppingBag size={14} />}
          <span>{getOrderTypeLabel(order)}</span>
          {order.order_type === 'pickup' && order.pickup_time && (
            <>
              <span className="ot-dot">·</span>
              <Clock size={14} />
              <span>Ready by {new Date(order.pickup_time).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}</span>
            </>
          )}
          {order.order_type === 'delivery' && order.delivery_address && (
            <>
              <span className="ot-dot">·</span>
              <MapPin size={14} />
              <span className="ot-address">
                {typeof order.delivery_address === 'string' ? order.delivery_address : (order.delivery_address as Record<string, string>)?.address || ''}
              </span>
            </>
          )}
        </div>

        {/* Order Summary */}
        <div className="ot-summary-card">
          <div className="ot-section-title">Your Items</div>
          {order.items?.map((item, i) => {
            const unitPrice = Number(item.price ?? item.unit_price ?? 0);
            return (
              <div key={i} className="ot-item-row">
                <span>{item.quantity}x {item.name}</span>
                <span>{formatPrice(unitPrice * item.quantity)}</span>
              </div>
            );
          })}
          <div className="ot-total-row">
            <span>Total</span>
            <span>{formatPrice(order.total)}</span>
          </div>
        </div>

        {/* Payment info */}
        <div className="ot-payment-info">
          Paid with <strong>{order.payment_method === 'wallet' ? 'Loka Wallet' : order.payment_method === 'cod' ? 'Cash on Delivery' : 'Pay at Store'}</strong>
        </div>

        {/* Actions */}
        <div className="ot-actions">
          <button
            className="ot-reorder-btn"
            onClick={handleReorder}
            disabled={reordering}
          >
            <RotateCcw size={16} />
            {reordering ? 'Adding to cart…' : 'Reorder'}
          </button>

          <div className="ot-action-row">
            <button
              className="ot-secondary-btn"
              onClick={handleShare}
            >
              <Share2 size={16} /> Share receipt
            </button>
            {['pending', 'confirmed'].includes(order.status?.toLowerCase()) && (
              <button
                className="ot-secondary-btn ot-cancel-btn"
                onClick={handleCancel}
                disabled={cancelling}
              >
                <XCircle size={16} />
                {cancelling ? 'Cancelling…' : 'Cancel'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
