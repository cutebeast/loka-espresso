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
  Clock,
  MapPin,
} from 'lucide-react';
import { useOrderStore } from '@/stores/orderStore';
import { useUIStore } from '@/stores/uiStore';
import { useCartStore } from '@/stores/cartStore';
import { Skeleton } from '@/components/ui';
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

  const [reordering, setReordering] = useState<number | null>(null);
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
    setPage('order-detail', { orderId: order.id });
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

    </>
  );
}
