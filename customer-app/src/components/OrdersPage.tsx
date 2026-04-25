'use client';

import { useEffect, useCallback, useRef } from 'react';
import {
  RefreshCw,
  ShoppingBag,
  Receipt,
} from 'lucide-react';
import { useOrderStore } from '@/stores/orderStore';
import { useUIStore } from '@/stores/uiStore';
import api from '@/lib/api';
import type { Order } from '@/lib/api';

function formatPrice(val: number | string): string {
  return `RM ${Number(val).toFixed(2)}`;
}

function getStatusClass(status: string): string {
  const s = status?.toLowerCase().replace(/\s+/g, '-');
  const map: Record<string, string> = {
    pending: 'status-pending',
    confirmed: 'status-confirmed',
    preparing: 'status-preparing',
    ready: 'status-ready',
    'out-for-delivery': 'status-out-for-delivery',
    completed: 'status-completed',
    delivered: 'status-completed',
    cancelled: 'status-cancelled',
  };
  return map[s] || 'status-confirmed';
}

function formatOrderDate(createdAt: string): string {
  const d = new Date(createdAt);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const timeStr = d.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });

  if (isToday) return `Today, ${timeStr}`;
  if (isYesterday) return `Yesterday, ${timeStr}`;
  return d.toLocaleDateString('en-MY', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function OrdersPage() {
  const { orders, setOrders, setCurrentOrder, isLoading, setIsLoading } = useOrderStore();
  const { setPage, showToast } = useUIStore();

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

  const activeOrders = orders.filter((o) => activeStatuses.includes(o.status?.toLowerCase()));
  const pastOrders = orders.filter((o) => !activeStatuses.includes(o.status?.toLowerCase()));

  if (!isLoading && orders.length === 0) {
    return (
      <div className="orders-screen">
        <div className="orders-header">
          <h1 className="orders-page-title">Orders</h1>
        </div>
        <div className="orders-scroll orders-scroll-center">
          <div className="order-empty">
            <div className="order-empty-icon">
              <ShoppingBag size={32} color="#384B16" className="co-wallet-icon" />
            </div>
            <p className="order-empty-title">No orders yet</p>
            <p className="order-empty-text">Your order history will appear here</p>
            <button className="order-empty-btn" onClick={() => setPage('menu')}>
              Start Ordering
            </button>
          </div>
        </div>
      </div>
    );
  }

  const renderOrderCard = (order: Order) => {
    const itemSummary = order.items?.map((i) => i.name).join(', ') || '';
    const dateStr = formatOrderDate(order.created_at);

    return (
      <div key={order.id} className="order-card" onClick={() => handleOpenDetail(order)}>
        <div className="order-card-header">
          <span className="order-card-number">
            <Receipt size={16} color="#D18E38" />
            Order #{order.order_number}
          </span>
          <span className="order-card-date">{dateStr}</span>
        </div>
        <div className="order-card-items">{itemSummary}</div>
        <div className="order-card-footer">
          <span className="order-card-total">{formatPrice(order.total)}</span>
          <span className={`order-card-status ${getStatusClass(order.status)}`}>
            {order.status}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="orders-screen">
      <div className="orders-header">
        <h1 className="orders-page-title">Orders</h1>
      </div>

      <div className="orders-scroll">
        {/* Active Orders */}
        {activeOrders.length > 0 && (
          <>
            <div className="orders-section-title">Active order</div>
            {activeOrders.map((order) => renderOrderCard(order))}
          </>
        )}

        {/* Past Orders */}
        {pastOrders.length > 0 && (
          <>
            <div className="orders-section-header">
              <div className="orders-section-title">Past orders</div>
              <button className="orders-refresh-btn" onClick={fetchOrders}>
                <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              </button>
            </div>
            {pastOrders.map((order) => renderOrderCard(order))}
          </>
        )}
      </div>
    </div>
  );
}
