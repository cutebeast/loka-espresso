import api from './api';
import type { CartItem } from './api';
import { useCartStore } from '@/stores/cartStore';

interface CustomizationStructure {
  options?: Array<{ id: number; name: string; price_adjustment: number }>;
  note?: string;
}

interface ServerCartItem {
  id: number;
  menu_item_id?: number;
  item_id?: number;
  quantity: number;
  [key: string]: unknown;
}

function createIdempotencyKey(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function syncCartToServer(items: CartItem[]): Promise<void> {
  let serverItems: ServerCartItem[] = [];
  try {
    const res = await api.get('/cart');
    if (res.status === 200) {
      const data = res.data;
      serverItems = Array.isArray(data) ? data : (data?.items ?? []);
    }
  } catch {
    // proceed with sync even if we can't read the cart
  }

  function cartItemKey(item: { menu_item_id: number; customization_option_ids?: number[] }): string {
    const optKey = item.customization_option_ids && item.customization_option_ids.length > 0
      ? JSON.stringify([...item.customization_option_ids].sort((a, b) => a - b))
      : '';
    return `${item.menu_item_id}:${optKey}`;
  }

  const desiredMap = new Map(items.map(i => [cartItemKey(i), i]));
  const serverMap = new Map(serverItems.map((i: ServerCartItem) => [cartItemKey({ menu_item_id: i.menu_item_id ?? i.item_id ?? 0, customization_option_ids: Array.isArray(i.customization_option_ids) ? i.customization_option_ids : undefined }), i]));

  const desiredKeys = new Set(desiredMap.keys());
  const toDelete = serverItems.filter((si: ServerCartItem) => !desiredKeys.has(cartItemKey({ menu_item_id: si.menu_item_id ?? si.item_id ?? 0, customization_option_ids: Array.isArray(si.customization_option_ids) ? si.customization_option_ids : undefined })));
  for (const item of toDelete) {
    try {
      await api.delete(`/cart/items/${item.id}`);
    } catch (err) {
      console.error('Failed to delete cart item:', err);
    }
  }

  for (const [key, desired] of desiredMap) {
    const existing = serverMap.get(key);
    try {
      if (existing) {
        if (existing.quantity !== desired.quantity) {
          await api.put(`/cart/items/${existing.id}`, { quantity: desired.quantity });
        }
      } else {
        const customizationOptionIds: number[] = [];

        if (desired.customizations && typeof desired.customizations === 'object') {
          const cust = desired.customizations as CustomizationStructure;
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
          item_id: desired.menu_item_id,
          quantity: desired.quantity,
          customization_option_ids: customizationOptionIds,
        });
      }
    } catch (err) {
      console.error('Failed to sync cart item:', err);
    }
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
  paymentMethod: 'wallet' | 'cash' | 'pay_at_store' | 'cod';
}) {
  const { items, clearCart } = useCartStore.getState();

  await syncCartToServer(items);

  let checkoutToken: string | undefined;

  if (params.voucherCode || params.rewardRedemptionCode) {
    try {
      const checkoutPayload: Record<string, unknown> = {
        store_id: params.storeId,
        order_type: params.orderType,
      };
      if (params.voucherCode) {
        checkoutPayload.voucher_code = params.voucherCode;
      }
      if (params.rewardRedemptionCode) {
        const rewardId = parseInt(params.rewardRedemptionCode, 10);
        if (!isNaN(rewardId)) {
          checkoutPayload.reward_id = rewardId;
        }
      }
      const checkoutRes = await api.post('/checkout', checkoutPayload);
      checkoutToken = checkoutRes.data?.checkout_token;
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      throw new Error(detail || 'Checkout discount validation failed');
    }
  }

  const orderPayload: Record<string, unknown> = {
    store_id: params.storeId,
    order_type: params.orderType,
    payment_method: params.paymentMethod,
  };

  if (checkoutToken) {
    orderPayload.checkout_token = checkoutToken;
  }

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
  if (!checkoutToken) {
    if (params.voucherCode) {
      orderPayload.voucher_code = params.voucherCode;
    }
    if (params.rewardRedemptionCode) {
      orderPayload.reward_redemption_code = params.rewardRedemptionCode;
    }
  }

  const orderRes = await api.post('/orders', orderPayload, {
    headers: { 'Idempotency-Key': createIdempotencyKey('order') },
  });
  const newOrder = orderRes.data;

  try {
    if (params.paymentMethod === 'wallet') {
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
        newOrder.status = 'confirmed';
      }
    }
  } catch (error) {
    if (newOrder?.id) {
      try {
        await api.post(`/orders/${newOrder.id}/cancel`, {}, {
          headers: { 'Idempotency-Key': createIdempotencyKey('order-cancel') },
        });
      } catch {
        // Best-effort rollback
      }
    }
    throw error;
  }

  if (params.paymentMethod !== 'wallet' && newOrder?.id) {
    try {
      await api.post(`/orders/${newOrder.id}/confirm`, {}, {
        headers: { 'Idempotency-Key': createIdempotencyKey('order-confirm') },
      });
      newOrder.status = 'confirmed';
    } catch {
      // Order stays at pending, kitchen/admin can confirm later
    }
  }

  clearCart();
  return newOrder;
}
