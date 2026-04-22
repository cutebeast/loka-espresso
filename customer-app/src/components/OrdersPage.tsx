'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  Truck,
  UtensilsCrossed,
  XCircle,
  Share2,
  Clock,
  MapPin,
} from 'lucide-react';
import { useOrderStore } from '@/stores/orderStore';
import { useUIStore } from '@/stores/uiStore';
import { useCartStore } from '@/stores/cartStore';
import { Modal, Skeleton } from '@/components/ui';
import api from '@/lib/api';
import type { Order } from '@/lib/api';

function formatPrice(val: number | string): string {
  return `RM ${Number(val).toFixed(2)}`;
}

// Customer-facing timeline aligned with finalized ordering journey:
// Pickup/Dine-in: pending/confirmed → preparing → ready → completed
// Delivery:       pending/confirmed → preparing → ready → out_for_delivery → completed
const TIMELINE_STEPS = ['Confirmed', 'Preparing', 'Ready', 'Completed'];
const DELIVERY_TIMELINE_STEPS = ['Confirmed', 'Preparing', 'Ready', 'On the way', 'Completed'];

const STATUS_VARIANT: Record<string, { bg: string; text: string }> = {
  pending: { bg: 'bg-warning-light', text: 'text-[#B85B14]' },
  paid: { bg: 'bg-info-light', text: 'text-info' },
  confirmed: { bg: 'bg-info-light', text: 'text-info' },
  preparing: { bg: 'bg-warning-light', text: 'text-[#B85B14]' },
  out_for_delivery: { bg: 'bg-info-light', text: 'text-info' },
  driver_assigned: { bg: 'bg-info-light', text: 'text-info' },
  ready: { bg: 'bg-success-light', text: 'text-success' },
  completed: { bg: 'bg-success-light', text: 'text-success' },
  delivered: { bg: 'bg-success-light', text: 'text-success' },
  picked_up: { bg: 'bg-success-light', text: 'text-success' },
  cancelled: { bg: 'bg-danger-light', text: 'text-danger' },
};

function getStatusStepIndex(status: string, orderType?: string): number {
  const s = status?.toLowerCase();
  const isDelivery = orderType === 'delivery';

  // Step 0: Confirmed (includes pending before kitchen confirmation)
  if (s === 'pending' || s === 'confirmed') return 0;

  // Step 1: Preparing
  if (s === 'preparing' || s === 'in_progress') return 1;

  // Delivery has 4 steps; pickup/dine-in have 3 steps before complete
  if (isDelivery) {
    if (s === 'ready') return 2;
    if (s === 'out_for_delivery' || s === 'driver_assigned') return 3;
    if (s === 'completed' || s === 'delivered') return 4;
  } else {
    if (s === 'ready') return 2;
    if (s === 'completed' || s === 'picked_up') return 3;
  }
  return 0;
}

function getTimelineSteps(order: Order): string[] {
  return order.order_type === 'delivery' ? DELIVERY_TIMELINE_STEPS : TIMELINE_STEPS;
}

function getOrderTypeLabel(order: Order): string {
  const t = order.order_type;
  if (t === 'delivery') return 'Delivery';
  if (t === 'dine_in') return 'Dine-in';
  return 'Pickup';
}

export default function OrdersPage() {
  const { orders, setOrders, currentOrder, setCurrentOrder, isLoading, setIsLoading } = useOrderStore();
  const { setPage, showToast } = useUIStore();
  const { clearCart } = useCartStore();
  const reducedMotion = useReducedMotion();

  const [detailOpen, setDetailOpen] = useState(false);
  const [reordering, setReordering] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/orders', { params: { page_size: 20 } });
      setOrders(Array.isArray(res.data) ? res.data : (res.data?.orders ?? []));
    } catch {
      showToast('Failed to load orders', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [setOrders, showToast, setIsLoading]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (currentOrder) setDetailOpen(true);
  }, [currentOrder]);

  const activeStatuses = ['pending', 'confirmed', 'preparing', 'in_progress', 'ready', 'out_for_delivery', 'driver_assigned'];
  const hasActive = orders.some((o) => activeStatuses.includes(o.status?.toLowerCase()));

  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (hasActive) {
      pollingRef.current = setInterval(() => {
        if (document.visibilityState === 'visible') {
          api.get('/orders', { params: { page_size: 20 } })
            .then((res) => setOrders(Array.isArray(res.data) ? res.data : (res.data?.orders ?? [])))
            .catch(() => {});
        }
      }, 30000);
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [hasActive, setOrders]);

  const handleOpenDetail = (order: Order) => {
    setCurrentOrder(order);
    setDetailOpen(true);
  };

  const handleCloseDetail = () => {
    setDetailOpen(false);
    setCurrentOrder(null);
  };

  const handleReorder = async (order: Order) => {
    setReordering(order.id);
    try {
      const res = await api.post(`/orders/${order.id}/reorder`);
      const cartItems = res.data?.items ?? [];
      clearCart();
      for (const item of cartItems) {
        useCartStore.getState().addItem(item, order.store_id ?? 0);
      }
      showToast('Items added to cart', 'success');
      setPage('cart');
    } catch {
      showToast('Failed to reorder', 'error');
    } finally {
      setReordering(null);
    }
  };

  // Separate active vs past orders
  const activeOrders = orders.filter((o) => activeStatuses.includes(o.status?.toLowerCase()));
  const pastOrders = orders.filter((o) => !activeStatuses.includes(o.status?.toLowerCase()));

  const handleCancelOrder = async (orderId: number) => {
    setCancelling(orderId);
    try {
      await api.post(`/orders/${orderId}/cancel`);
      showToast('Order cancelled', 'info');
      fetchOrders();
      handleCloseDetail();
    } catch {
      showToast('Failed to cancel order', 'error');
    } finally {
      setCancelling(null);
    }
  };

  const handleShareReceipt = (order: Order) => {
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

  if (!isLoading && orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6">
        <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center mb-5">
          <ShoppingBag size={36} className="text-primary/40" />
        </div>
        <p className="text-text-primary font-bold text-lg mb-1">No orders yet</p>
        <p className="text-text-muted text-sm mb-6 text-center">
          Your order history will appear here
        </p>
        <motion.button
          whileTap={reducedMotion ? undefined : { scale: 0.98 }}
          onClick={() => setPage('menu')}
          className="bg-primary text-white font-bold px-8 py-4 rounded-full"
        >
          Start Ordering
        </motion.button>
      </div>
    );
  }

  return (
    <>
      <div className="px-[18px] pt-4 pb-6">
        {/* Active Order */}
        {activeOrders.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-text-primary">Active order</h3>
            </div>

            {activeOrders.map((order) => {
              const timelineStatus = order.order_type === 'delivery' ? (order.delivery_status || order.status) : order.status;
              const statusCfg = STATUS_VARIANT[timelineStatus?.toLowerCase()] || STATUS_VARIANT.pending;
              const currentStep = getStatusStepIndex(timelineStatus, order.order_type);
              const itemSummary = order.items?.map((i) => i.name).join(', ') || '';

              return (
                <div
                  key={order.id}
                  className="bg-white rounded-[18px] p-4 mb-4 shadow-card border border-border-light"
                >
                  <div className="flex items-center justify-between">
                    <span className={`${statusCfg.bg} ${statusCfg.text} px-3 py-1 rounded-full text-xs font-semibold`}>
                      {order.order_type === 'delivery' && '🛵 '}
                      {order.delivery_status && order.order_type === 'delivery' ? order.delivery_status.replaceAll('_', ' ') : order.status}
                    </span>
                    <span className="text-text-muted text-sm">#{order.order_number}</span>
                  </div>

                  <div className="mt-4">
                    <p className="font-semibold text-text-primary truncate">{itemSummary}</p>
                    <p className="text-text-muted text-[13px] mt-0.5">
                      {order.store_name || 'Loka Espresso'} · {getOrderTypeLabel(order)}
                    </p>
                  </div>

                  {/* Progress Tracker with dots */}
                  <div className="flex justify-between mt-5">
                    {getTimelineSteps(order).map((step, i) => {
                      const isCompleted = i <= currentStep;
                      const isCurrent = i === currentStep;
                      return (
                        <div key={step} className="text-center flex-1">
                          <div
                            className={`w-3 h-3 rounded-full mx-auto mb-1.5 ${
                              isCurrent
                                ? 'bg-primary shadow-[0_0_0_4px_rgba(56,75,22,0.15)]'
                                : isCompleted
                                ? 'bg-primary'
                                : 'bg-border'
                            }`}
                          />
                          <span className="text-[10px] text-text-muted">{step}</span>
                        </div>
                      );
                    })}
                  </div>

                  <motion.button
                    whileTap={reducedMotion ? undefined : { scale: 0.98 }}
                    onClick={() => handleOpenDetail(order)}
                    className="w-full bg-primary text-white font-bold py-3 rounded-full mt-4"
                  >
                    Track order
                  </motion.button>
                </div>
              );
            })}
          </>
        )}

        {/* Past Orders */}
        {pastOrders.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-text-primary">Past orders</h3>
              <motion.button
                whileTap={reducedMotion ? undefined : { scale: 0.9 }}
                onClick={fetchOrders}
                className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center"
              >
                <RefreshCw size={14} className={`text-primary ${isLoading ? 'animate-spin' : ''}`} />
              </motion.button>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="bg-white rounded-[18px] p-4 shadow-card border border-border-light">
                    <Skeleton className="h-4 w-28 mb-2" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {pastOrders.map((order) => {
                  const itemSummary = order.items?.map((i) => i.name).join(', ') || '';
                  const date = new Date(order.created_at).toLocaleDateString('en-MY', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });

                  return (
                    <div
                      key={order.id}
                      className="bg-white rounded-[18px] p-4 shadow-card border border-border-light"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-text-primary">{date}</span>
                        <span className="font-semibold text-text-primary float-right">
                          {formatPrice(order.total)}
                        </span>
                      </div>
                      <p className="text-text-muted text-[13px] mt-1 truncate">
                        {itemSummary} · {order.status}
                      </p>
                      <motion.button
                        whileTap={reducedMotion ? undefined : { scale: 0.95 }}
                        onClick={() => handleReorder(order)}
                        disabled={reordering === order.id}
                        className="text-primary font-semibold text-sm mt-2 flex items-center gap-1"
                      >
                        <RotateCcw size={14} />
                        Reorder
                      </motion.button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Loading state for first load */}
        {isLoading && orders.length === 0 && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-[18px] p-4 shadow-card border border-border-light">
                <Skeleton className="h-4 w-28 mb-3" />
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-3 w-36" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      <Modal isOpen={detailOpen} onClose={handleCloseDetail} title="Order Details">
        {currentOrder && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold text-text-primary">
                  #{currentOrder.order_number}
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  {new Date(currentOrder.created_at).toLocaleDateString('en-MY', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              {(() => {
                const timelineStatus = currentOrder.order_type === 'delivery' ? (currentOrder.delivery_status || currentOrder.status) : currentOrder.status;
                const statusCfg = STATUS_VARIANT[timelineStatus?.toLowerCase()] || STATUS_VARIANT.pending;
                return (
                  <span className={`${statusCfg.bg} ${statusCfg.text} px-3 py-1 rounded-full text-xs font-semibold`}>
                    {timelineStatus.replaceAll('_', ' ')}
                  </span>
                );
              })()}
            </div>

            {/* Progress Tracker */}
            <div className="flex justify-between py-3">
              {getTimelineSteps(currentOrder).map((step, i) => {
                const timelineStatus = currentOrder.order_type === 'delivery' ? (currentOrder.delivery_status || currentOrder.status) : currentOrder.status;
                const currentStep = getStatusStepIndex(timelineStatus, currentOrder.order_type);
                const isCompleted = i <= currentStep;
                const isCurrent = i === currentStep;
                return (
                  <div key={step} className="text-center flex-1">
                    <div
                      className={`w-3 h-3 rounded-full mx-auto mb-1.5 ${
                        isCurrent
                          ? 'bg-primary shadow-[0_0_0_4px_rgba(56,75,22,0.15)]'
                          : isCompleted
                          ? 'bg-primary'
                          : 'bg-border'
                      }`}
                    />
                    <span className="text-[10px] text-text-muted">{step}</span>
                  </div>
                );
              })}
            </div>

            {/* Order Type Info */}
            <div className="flex items-center gap-2 text-sm text-text-muted">
              {currentOrder.order_type === 'delivery' && <Truck size={14} />}
              {currentOrder.order_type === 'dine_in' && <UtensilsCrossed size={14} />}
              {currentOrder.order_type === 'pickup' && <ShoppingBag size={14} />}
              <span>{getOrderTypeLabel(currentOrder)}</span>
              {currentOrder.order_type === 'pickup' && currentOrder.pickup_time && (
                <>
                  <span className="mx-1">·</span>
                  <Clock size={14} />
                  <span>Ready by {new Date(currentOrder.pickup_time).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}</span>
                </>
              )}
              {currentOrder.order_type === 'delivery' && currentOrder.delivery_address && (
                <>
                  <span className="mx-1">·</span>
                  <MapPin size={14} />
                  <span className="truncate">{typeof currentOrder.delivery_address === 'string' ? currentOrder.delivery_address : (currentOrder.delivery_address as Record<string,string>)?.address || ''}</span>
                </>
              )}
            </div>

            {/* Items */}
            <div>
              <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">Items</h4>
              <div className="space-y-2">
                {currentOrder.items?.map((item, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary truncate">{item.name}</p>
                      <p className="text-xs text-text-muted">x{item.quantity}</p>
                    </div>
                    <span className="text-sm font-medium text-text-primary ml-3">
                      {formatPrice((Number(item.price ?? item.unit_price ?? 0)) * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {currentOrder.order_type === 'delivery' && (
              <div className="border border-border rounded-2xl p-4 space-y-1">
                <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">Delivery</h4>
                {!currentOrder.delivery_dispatched_at && ['ready', 'out_for_delivery', 'completed'].includes(currentOrder.status) && (
                  <div className="flex items-center gap-2 py-1">
                    <Truck size={14} className="text-warning" />
                    <p className="text-sm text-warning font-medium">Your delivery is being arranged by our team</p>
                  </div>
                )}
                {currentOrder.delivery_courier_name && <p className="text-sm text-text-primary">Courier: {currentOrder.delivery_courier_name}</p>}
                {currentOrder.delivery_courier_phone && <p className="text-sm text-text-muted">Phone: {currentOrder.delivery_courier_phone}</p>}
                {currentOrder.delivery_eta_minutes != null && <p className="text-sm text-text-muted">ETA: {currentOrder.delivery_eta_minutes} min</p>}
                {currentOrder.delivery_tracking_url && (
                  <a className="text-sm font-semibold text-primary" href={currentOrder.delivery_tracking_url} target="_blank" rel="noreferrer">
                    Open live tracking
                  </a>
                )}
              </div>
            )}

            {/* Totals */}
            <div className="border-t border-border pt-3 space-y-1">
              {currentOrder.subtotal != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Subtotal</span>
                  <span className="text-text-primary">{formatPrice(currentOrder.subtotal)}</span>
                </div>
              )}
              {(currentOrder.delivery_fee ?? 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Delivery fee</span>
                  <span className="text-text-primary">{formatPrice(currentOrder.delivery_fee ?? 0)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold pt-2 border-t border-border">
                <span className="text-text-primary">Total</span>
                <span className="text-primary">{formatPrice(currentOrder.total)}</span>
              </div>
            </div>

            {/* Reorder Button */}
            <motion.button
              whileTap={reducedMotion ? undefined : { scale: 0.98 }}
              onClick={() => handleReorder(currentOrder)}
              disabled={reordering === currentOrder.id}
              className="w-full bg-primary text-white font-bold py-4 rounded-full flex items-center justify-center gap-2"
            >
              <RotateCcw size={18} />
              {reordering === currentOrder.id ? 'Adding to cart...' : 'Reorder'}
            </motion.button>

            {/* Action row */}
            <div className="flex gap-3">
              <motion.button
                whileTap={reducedMotion ? undefined : { scale: 0.98 }}
                onClick={() => handleShareReceipt(currentOrder)}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-full border border-border text-text-primary font-semibold text-sm"
              >
                <Share2 size={16} />
                Share receipt
              </motion.button>
              {['pending', 'confirmed'].includes(currentOrder.status?.toLowerCase()) && (
                <motion.button
                  whileTap={reducedMotion ? undefined : { scale: 0.98 }}
                  onClick={() => handleCancelOrder(currentOrder.id)}
                  disabled={cancelling === currentOrder.id}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-full border border-danger-light text-danger font-semibold text-sm"
                >
                  <XCircle size={16} />
                  {cancelling === currentOrder.id ? 'Cancelling...' : 'Cancel order'}
                </motion.button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
