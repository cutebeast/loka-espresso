'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Receipt,
  ShoppingBag,
  Truck,
  UtensilsCrossed,
  CheckCircle2,
  Circle,
  ChevronRight,
  ArrowLeft,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { useOrderStore } from '@/stores/orderStore';
import { useUIStore } from '@/stores/uiStore';
import { useCartStore } from '@/stores/cartStore';
import { Button, Badge, Modal, Skeleton } from '@/components/ui';
import api from '@/lib/api';
import type { Order } from '@/lib/api';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const staggerItem = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

function formatPrice(val: number): string {
  return `RM ${val.toFixed(2)}`;
}

const STATUS_CONFIG: Record<string, { variant: 'success' | 'warning' | 'error' | 'info' | 'default'; label: string }> = {
  pending: { variant: 'warning', label: 'Pending' },
  confirmed: { variant: 'info', label: 'Confirmed' },
  preparing: { variant: 'warning', label: 'Preparing' },
  ready: { variant: 'success', label: 'Ready' },
  completed: { variant: 'success', label: 'Completed' },
  cancelled: { variant: 'error', label: 'Cancelled' },
};

const TYPE_CONFIG: Record<string, { icon: typeof ShoppingBag; label: string }> = {
  pickup: { icon: ShoppingBag, label: 'Pickup' },
  delivery: { icon: Truck, label: 'Delivery' },
  dine_in: { icon: UtensilsCrossed, label: 'Dine-in' },
};

const TIMELINE_STEPS = ['pending', 'confirmed', 'preparing', 'ready', 'completed'];

export default function OrdersPage() {
  const { orders, setOrders, currentOrder, setCurrentOrder, isLoading, setIsLoading } =
    useOrderStore();
  const { setPage, showToast } = useUIStore();
  const { clearCart } = useCartStore();

  const [detailOpen, setDetailOpen] = useState(false);
  const [reordering, setReordering] = useState<number | null>(null);

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
    if (currentOrder) {
      setDetailOpen(true);
    }
  }, [currentOrder]);

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

  const getStatusIdx = (status: string): number => {
    const lower = status?.toLowerCase();
    if (lower === 'cancelled') return -1;
    return TIMELINE_STEPS.indexOf(lower);
  };

  if (!isLoading && orders.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-20 px-6"
      >
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-5">
          <Receipt size={36} className="text-gray-300" />
        </div>
        <p className="text-gray-900 font-bold text-lg mb-1">No orders yet</p>
        <p className="text-gray-400 text-sm mb-6 text-center">
          Your order history will appear here
        </p>
        <Button variant="primary" onClick={() => setPage('menu')}>
          Start Ordering
        </Button>
      </motion.div>
    );
  }

  return (
    <>
      <motion.div variants={container} initial="hidden" animate="show" className="px-4 pt-4 pb-6">
        <motion.div variants={staggerItem} className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPage('home')}
              className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"
            >
              <ArrowLeft size={18} className="text-gray-600" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">My Orders</h1>
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={fetchOrders}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"
          >
            <RefreshCw size={16} className={`text-gray-500 ${isLoading ? 'animate-spin' : ''}`} />
          </motion.button>
        </motion.div>

        <div className="space-y-3">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"
                >
                  <Skeleton className="h-4 w-28 mb-3" />
                  <Skeleton className="h-3 w-20 mb-2" />
                  <Skeleton className="h-3 w-36" />
                </div>
              ))
            : orders.map((order) => {
                const statusCfg = STATUS_CONFIG[order.status?.toLowerCase()] || {
                  variant: 'default' as const,
                  label: order.status,
                };
                const typeCfg = TYPE_CONFIG[order.order_type] || TYPE_CONFIG.pickup;
                const TypeIcon = typeCfg.icon;
                const itemSummary = order.items?.map((i) => i.name).join(', ') || '';
                const truncatedSummary =
                  itemSummary.length > 40 ? itemSummary.slice(0, 40) + '…' : itemSummary;

                return (
                  <motion.button
                    key={order.id}
                    variants={staggerItem}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleOpenDetail(order)}
                    className="w-full bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-left"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-sm font-bold text-gray-900">
                          #{order.order_number}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {new Date(order.created_at).toLocaleDateString('en-MY', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={typeCfg.label === 'Delivery' ? 'info' : 'default'} size="sm">
                          <TypeIcon size={12} className="mr-1" />
                          {typeCfg.label}
                        </Badge>
                        <Badge variant={statusCfg.variant} size="sm">
                          {statusCfg.label}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 truncate mb-2">{truncatedSummary}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-gray-900">
                        {formatPrice(order.total)}
                      </span>
                      <ChevronRight size={16} className="text-gray-400" />
                    </div>
                  </motion.button>
                );
              })}
        </div>
      </motion.div>

      <Modal isOpen={detailOpen} onClose={handleCloseDetail} title="Order Details">
        {currentOrder && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold text-gray-900">
                  #{currentOrder.order_number}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {new Date(currentOrder.created_at).toLocaleDateString('en-MY', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {(() => {
                  const tc = TYPE_CONFIG[currentOrder.order_type] || TYPE_CONFIG.pickup;
                  const TIcon = tc.icon;
                  return (
                    <Badge variant="default" size="sm">
                      <TIcon size={12} className="mr-1" />
                      {tc.label}
                    </Badge>
                  );
                })()}
                <Badge
                  variant={
                    (STATUS_CONFIG[currentOrder.status?.toLowerCase()]?.variant || 'default')
                  }
                  size="sm"
                >
                  {STATUS_CONFIG[currentOrder.status?.toLowerCase()]?.label || currentOrder.status}
                </Badge>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                Items
              </h4>
              <div className="space-y-2">
                {currentOrder.items?.map((item, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">{item.name}</p>
                      <p className="text-xs text-gray-400">x{item.quantity}</p>
                    </div>
                    <span className="text-sm font-medium text-gray-900 ml-3">
                      {formatPrice(item.price * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-100 pt-3 space-y-1">
              {currentOrder.subtotal != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="text-gray-900">{formatPrice(currentOrder.subtotal)}</span>
                </div>
              )}
              {(currentOrder.delivery_fee ?? 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Delivery fee</span>
                  <span className="text-gray-900">
                    {formatPrice(currentOrder.delivery_fee ?? 0)}
                  </span>
                </div>
              )}
              {(currentOrder.discount_applied ?? 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-green-600">Discount</span>
                  <span className="text-green-600">
                    -{formatPrice(currentOrder.discount_applied ?? 0)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-100">
                <span className="text-gray-900">Total</span>
                <span className="text-primary">{formatPrice(currentOrder.total)}</span>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                Timeline
              </h4>
              <div className="space-y-0">
                {TIMELINE_STEPS.map((step, i) => {
                  const currentIdx = getStatusIdx(currentOrder.status);
                  const isCompleted = currentIdx >= i;
                  const isCurrent = currentIdx === i;
                  const timelineData = currentOrder.timeline?.find(
                    (t) => t.status?.toLowerCase() === step
                  );
                  return (
                    <div key={step} className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        {isCompleted ? (
                          <CheckCircle2
                            size={20}
                            className={
                              isCurrent ? 'text-primary' : 'text-green-500'
                            }
                          />
                        ) : (
                          <Circle size={20} className="text-gray-300" />
                        )}
                        {i < TIMELINE_STEPS.length - 1 && (
                          <div
                            className={`w-0.5 h-8 ${
                              isCompleted ? 'bg-green-500' : 'bg-gray-200'
                            }`}
                          />
                        )}
                      </div>
                      <div className="pb-4">
                        <p
                          className={`text-sm font-medium ${
                            isCompleted ? 'text-gray-900' : 'text-gray-400'
                          }`}
                        >
                          {step.charAt(0).toUpperCase() + step.slice(1)}
                        </p>
                        {timelineData && (
                          <p className="text-xs text-gray-400">
                            {new Date(timelineData.timestamp).toLocaleTimeString('en-MY', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
                {getStatusIdx(currentOrder.status) === -1 && (
                  <div className="flex items-center gap-3">
                    <Circle size={20} className="text-red-400" />
                    <p className="text-sm font-medium text-red-500">Cancelled</p>
                  </div>
                )}
              </div>
            </div>

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={() => handleReorder(currentOrder)}
              isLoading={reordering === currentOrder.id}
              leftIcon={<RotateCcw size={18} />}
            >
              Reorder
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
