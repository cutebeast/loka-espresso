import api from './api';
import type { CartItem } from './api';
import { useCartStore } from '@/stores/cartStore';

interface CustomizationStructure {
  options?: Array<{ id: number; name: string; price_adjustment: number }>;
  note?: string;
}

function createIdempotencyKey(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function syncCartToServer(items: CartItem[], storeId: number): Promise<void> {
  await api.delete('/cart');

  for (const item of items) {
    const customizationOptionIds: number[] = [];
    
    if (item.customizations && typeof item.customizations === 'object') {
      const cust = item.customizations as CustomizationStructure;
      if (cust.options && Array.isArray(cust.options)) {
        for (const opt of cust.options) {
          if (typeof opt.id === 'number') {
            customizationOptionIds.push(opt.id);
          }
        }
      }
    }
    
    customizationOptionIds.sort((a, b) => a - b);

    await api.post('/cart/items', {
      store_id: storeId,
      item_id: item.menu_item_id,
      quantity: item.quantity,
      customization_option_ids: customizationOptionIds,
    });
  }
}

export async function placeOrder(params: {
  storeId: number;
  orderType: 'pickup' | 'delivery' | 'dine_in';
  pickupTime?: string;
  deliveryAddress?: Record<string, unknown>;
  tableId?: number;
  notes?: string;
  voucherCode?: string;
  rewardRedemptionCode?: string;
  paymentMethod: 'wallet' | 'cash';
}) {
  const { items, clearCart } = useCartStore.getState();

  await syncCartToServer(items, params.storeId);

  const orderPayload: Record<string, unknown> = {
    store_id: params.storeId,
    order_type: params.orderType,
    payment_method: params.paymentMethod,
  };

  if (params.orderType === 'pickup' && params.pickupTime) {
    orderPayload.pickup_time = params.pickupTime;
  }
  if (params.orderType === 'delivery' && params.deliveryAddress) {
    orderPayload.delivery_address = params.deliveryAddress;
  }
  if (params.orderType === 'dine_in' && params.tableId) {
    orderPayload.table_id = params.tableId;
  }
  if (params.notes) {
    orderPayload.notes = params.notes;
  }
  if (params.voucherCode) {
    orderPayload.voucher_code = params.voucherCode;
  }
  if (params.rewardRedemptionCode) {
    orderPayload.reward_redemption_code = params.rewardRedemptionCode;
  }

  const orderRes = await api.post('/orders', orderPayload, {
    headers: { 'Idempotency-Key': createIdempotencyKey('order') },
  });
  const newOrder = orderRes.data;

  try {
    if (params.orderType !== 'dine_in' && params.paymentMethod === 'wallet') {
      const intentRes = await api.post('/payments/create-intent', {
        order_id: newOrder.id,
        method: 'wallet',
      }, {
        headers: { 'Idempotency-Key': createIdempotencyKey('payment-intent') },
      });
      const confirmRes = await api.post('/payments/confirm', {
        payment_id: intentRes.data?.payment_id,
      }, {
        headers: { 'Idempotency-Key': createIdempotencyKey('payment-confirm') },
      });
      newOrder.payment_status = confirmRes.data?.status || 'paid';
      newOrder.points_earned = confirmRes.data?.points_earned ?? newOrder.points_earned;
      newOrder.loyalty_points_earned = confirmRes.data?.points_earned ?? newOrder.loyalty_points_earned;
      if (newOrder.order_type === 'pickup' || newOrder.order_type === 'delivery') {
        newOrder.status = 'paid';
      }
    }
  } catch (error) {
    if (newOrder?.id) {
      try {
        await api.post(`/orders/${newOrder.id}/cancel`, {}, {
          headers: { 'Idempotency-Key': createIdempotencyKey('order-cancel') },
        });
      } catch {
        // Best-effort rollback. Backend cancel now restores wallet and discounts when possible.
      }
    }
    throw error;
  }

  clearCart();
  return newOrder;
}
