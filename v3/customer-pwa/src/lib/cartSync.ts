import api from './api';
import type { CartItem, Cart, CartLineItem } from './api';
import { queueOrder, replayOrders, isNetworkError } from './orderQueue';
import { useCartStore } from '@/stores/cartStore';
import { useWalletStore } from '@/stores/walletStore';

interface CustomizationStructure {
  options?: Array<{ id: number; name: string; price_adjustment: number }>;
  note?: string;
}

interface ServerCartItem {
  id?: number;
  menu_item_id?: number;
  item_id?: number;
  quantity: number;
  bundle_product_id?: number | null;
  bundle_component_id?: number | null;
  customization_option_ids?: number[];
}

function createIdempotencyKey(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

let _syncPromise: Promise<void> | null = null;

export class CartSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CartSyncError';
  }
}

export async function syncCartToServer(items: CartItem[]): Promise<void> {
  if (typeof window === 'undefined') return;

  while (_syncPromise) {
    try { await _syncPromise; } catch { /* ignore previous failure */ }
  }

  _syncPromise = (async () => {
    const storeIdForCart = items[0]?.store_id || 1;
    const res = await api.get('/cart', { params: { store_id: storeIdForCart } });
    const data = res.data as Cart | CartLineItem[] | undefined;
    const serverItems: ServerCartItem[] = Array.isArray(data) ? data : (data?.line_items ?? []);

    function cartItemKey(item: { menu_item_id: number; customization_option_ids?: number[]; bundle_product_id?: number; bundle_component_id?: number }): string {
      const optKey = item.customization_option_ids && item.customization_option_ids.length > 0
        ? JSON.stringify([...item.customization_option_ids].sort((a, b) => a - b))
        : '';
      return `${item.menu_item_id}:${optKey}:${item.bundle_product_id ?? ''}:${item.bundle_component_id ?? ''}`;
    }

    const desiredMap = new Map(items.map(i => [cartItemKey(i), i]));
    const serverMap = new Map(serverItems.map((i: ServerCartItem) => [cartItemKey({ menu_item_id: i.menu_item_id ?? i.item_id ?? 0, customization_option_ids: Array.isArray(i.customization_option_ids) ? i.customization_option_ids : undefined, bundle_product_id: typeof i.bundle_product_id === 'number' ? i.bundle_product_id : undefined, bundle_component_id: typeof i.bundle_component_id === 'number' ? i.bundle_component_id : undefined }), i]));

    const desiredKeys = new Set(desiredMap.keys());
    const toDelete = serverItems.filter((si: ServerCartItem) => !desiredKeys.has(cartItemKey({ menu_item_id: si.menu_item_id ?? si.item_id ?? 0, customization_option_ids: Array.isArray(si.customization_option_ids) ? si.customization_option_ids : undefined, bundle_product_id: typeof si.bundle_product_id === 'number' ? si.bundle_product_id : undefined, bundle_component_id: typeof si.bundle_component_id === 'number' ? si.bundle_component_id : undefined })));
    const failures: string[] = [];
    for (const item of toDelete) {
      try {
        await api.delete(`/cart/items/${item.id}`, { params: { store_id: storeIdForCart } });
      } catch {
        failures.push(`delete:${item.id}`);
      }
    }

    for (const [key, desired] of desiredMap) {
      const existing = serverMap.get(key);
      try {
        if (existing) {
          if (existing.quantity !== desired.quantity) {
            await api.patch(`/cart/items/${existing.id}`, { quantity: desired.quantity }, { params: { store_id: desired.store_id } });
          }
        } else {
          const customizationOptionIds: number[] = [];

          let specialInstructions: string | undefined;
          if (desired.customizations && typeof desired.customizations === 'object') {
            const cust = desired.customizations as CustomizationStructure;
            if (cust.options && Array.isArray(cust.options)) {
              for (const opt of cust.options) {
                if (typeof opt.id === 'number') {
                  customizationOptionIds.push(opt.id);
                }
              }
            }
            if (cust.note && typeof cust.note === 'string') {
              specialInstructions = cust.note;
            }
          }

          customizationOptionIds.sort((a, b) => a - b);

          const payload: Record<string, unknown> = {
            menu_item_id: desired.menu_item_id,
            quantity: desired.quantity,
            customization_option_ids: customizationOptionIds,
            store_id: desired.store_id,
          };
          if (specialInstructions) {
            payload.special_instructions = specialInstructions;
          }
          if (desired.bundle_product_id) {
            payload.bundle_product_id = desired.bundle_product_id;
          }
          if (desired.bundle_component_id) {
            payload.bundle_component_id = desired.bundle_component_id;
          }

          await api.post('/cart/items', payload, { params: { store_id: desired.store_id } });
        }
      } catch {
        failures.push(`sync:${key}`);
      }
    }

    if (failures.length > 0) {
      throw new CartSyncError(`Cart sync failed for items: ${failures.join(', ')}`);
    }
  })();

  try {
    await _syncPromise;
  } finally {
    _syncPromise = null;
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
  paymentMethod: 'wallet' | 'cash' | 'pay_at_store' | 'cod' | 'gateway' | 'hitpay';
  recipientName?: string;
  recipientPhone?: string;
  deliveryInstructions?: string;
}) {
  const { items, clearCart } = useCartStore.getState();

  // Wallet/gateway payments require an immediate online confirmation flow and
  // cannot be safely queued offline.
  const canQueueOffline = params.paymentMethod === 'cash' || params.paymentMethod === 'pay_at_store' || params.paymentMethod === 'cod';
  const isOffline = typeof window !== 'undefined' && !navigator.onLine;
  if (isOffline && !canQueueOffline) {
    throw new Error('This payment method requires an internet connection. Please connect and try again.');
  }

  await syncCartToServer(items);

  // The backend enum uses 'takeaway' for customer-collected orders; UI labels it 'pickup'.
  const backendOrderType = params.orderType === 'pickup' ? 'takeaway' : params.orderType;

  const orderPayload: Record<string, unknown> = {
    store_id: params.storeId,
    order_type: backendOrderType,
    payment_method: params.paymentMethod,
    status: (params.paymentMethod === 'wallet' || params.paymentMethod === 'gateway' || params.paymentMethod === 'hitpay')
      ? 'awaiting_payment'
      : 'pending',
  };

  if (params.voucherCode) {
    orderPayload.voucher_code = params.voucherCode;
  }
  if (params.rewardRedemptionCode) {
    const rewardId = parseInt(params.rewardRedemptionCode, 10);
    if (!isNaN(rewardId) && rewardId > 0) {
      orderPayload.reward_id = rewardId;
    }
  }

  if (params.orderType === 'pickup' && params.pickupTime) {
    orderPayload.pickup_time = params.pickupTime;
  }
  if (params.orderType === 'delivery' && params.deliveryAddress) {
    orderPayload.delivery_address = params.deliveryAddress;
  }
  if (params.orderType === 'dine_in' && params.tableId) {
    orderPayload.dining_table_id = params.tableId;
  }
  if (params.notes) {
    orderPayload.customer_notes = params.notes;
  }
  if (params.recipientName) {
    orderPayload.recipient_name = params.recipientName;
  }
  if (params.recipientPhone) {
    orderPayload.recipient_phone = params.recipientPhone;
  }
  if (params.deliveryInstructions) {
    orderPayload.delivery_instructions = params.deliveryInstructions;
  }

  let orderRes;
  try {
    orderRes = await api.post('/orders', orderPayload, {
      headers: { 'Idempotency-Key': createIdempotencyKey('order') },
    });
  } catch (err: unknown) {
    if ((isOffline || isNetworkError(err)) && canQueueOffline) {
      const queued = await queueOrder(orderPayload);
      return { queued: true as const, queuedOrder: queued };
    }
    throw err;
  }

  const newOrder = orderRes.data;

  try {
    if (params.paymentMethod === 'wallet') {
      const paymentKey = createIdempotencyKey('payment');
      const intentRes = await api.post('/payments/intent', {
        order_id: newOrder.id,
        payment_method: 'wallet',
      }, {
        headers: { 'Idempotency-Key': paymentKey },
      });
      const paymentId = intentRes.data?.id || intentRes.data?.payment_id;
      if (!paymentId) {
        // No payment ID returned — cancel the order
        throw new Error('Payment intent creation failed — no payment ID returned');
      }
      const confirmRes = await api.post(`/payments/${paymentId}/confirm`, {});
      newOrder.payment_status = confirmRes.data?.status || 'paid';
      newOrder.loyalty_points_earned = confirmRes.data?.points_earned ?? newOrder.loyalty_points_earned;
      if (newOrder.order_type === 'takeaway' || newOrder.order_type === 'delivery') {
        newOrder.status = 'confirmed';
      }
    }
  } catch (error) {
    // Rollback: cancel the order since payment failed
    if (newOrder?.id) {
      try {
        await api.post(`/orders/${newOrder.id}/cancel`, { reason: 'payment_failed' });
      } catch (cancelErr) {
        console.error('Order cancel rollback failed:', cancelErr);
      }
    }
    // Refresh wallet balance in case of partial deduction
    useWalletStore.getState().refreshWallet().catch((err) => console.error('[CartSync] Wallet refresh after payment failure failed:', err));
    throw error;
  }

  clearCart();
  return newOrder;
}

export function registerCartSyncListeners(): () => void {
  if (typeof window === 'undefined') return () => {};
  let _wasOffline = !navigator.onLine;
  let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const onOnline = () => {
    if (_wasOffline) {
      _wasOffline = false;
      if (_debounceTimer) clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(() => {
        const items = useCartStore.getState().items;
        if (items.length > 0) {
          syncCartToServer(items).catch((err) => console.error('[CartSync] Background sync failed:', err));
        }
        replayOrders().catch((err) => console.error('[CartSync] Order replay failed:', err));
      }, 500);
    }
  };
  const onOffline = () => { _wasOffline = true; };
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    if (_debounceTimer) clearTimeout(_debounceTimer);
  };
}
