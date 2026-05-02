'use client';

import { useState, useEffect } from 'react';
import {
  ArrowLeft, Wallet, Banknote, CheckCircle2, Loader2, Receipt, UtensilsCrossed, Coffee, Tag, QrCode, ChevronRight,
} from 'lucide-react';
import { useCartStore } from '@/stores/cartStore';
import { useUIStore } from '@/stores/uiStore';
import { useWalletStore } from '@/stores/walletStore';
import { useOrderStore } from '@/stores/orderStore';
import { useConfigStore } from '@/stores/configStore';
import { useAuthStore } from '@/stores/authStore';
import { placeOrder } from '@/lib/cartSync';
import TimeSlotPicker from '@/components/checkout/TimeSlotPicker';
import DeliveryAddressCard from '@/components/checkout/DeliveryAddressCard';
import { formatPrice, resolveAssetUrl, LOKA } from '@/lib/tokens';

const ORDER_TYPES = [
  { key: 'pickup' as const, label: 'Pickup' },
  { key: 'delivery' as const, label: 'Delivery' },
  { key: 'dine_in' as const, label: 'Dine-in' },
];

export default function CheckoutPage() {
  const { items, getTotal, getItemCount, orderNote } = useCartStore();
  const {
    orderMode, setOrderMode, selectedStore,
    setPage, showToast, checkoutDraft, setCheckoutDraft, clearCheckoutDraft,
    dineInSession,
  } = useUIStore();
  const { balance, refreshWallet } = useWalletStore();
  const { setCurrentOrder } = useOrderStore();
  const { config } = useConfigStore();
  const user = useAuthStore((s) => s.user);

  const [pickupTime, setPickupTime] = useState<string | null>(checkoutDraft.pickupTime ?? null);
  const [deliveryAddress, setDeliveryAddress] = useState<{ address: string; lat?: number; lng?: number } | null>(
    checkoutDraft.deliveryAddress ?? null
  );
  const [recipientName, setRecipientName] = useState(checkoutDraft.recipientName || '');
  const [recipientPhone, setRecipientPhone] = useState(checkoutDraft.recipientPhone || '');

  /* Pull name/phone from profile on first load if not already in draft */
  useEffect(() => {
    if (user && !checkoutDraft.recipientName && !recipientName) {
      setRecipientName(user.name || '');
      setRecipientPhone(user.phone || '');
    }
  }, [user]);
  const [deliveryInstr, setDeliveryInstr] = useState(checkoutDraft.deliveryInstructions || '');
  const [discountType, setDiscountType] = useState<'voucher' | 'reward' | null>(null);
  const [discountCode, setDiscountCode] = useState('');
  const [discountValue, setDiscountValue] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'pay_at_store' | 'cod' | 'cash'>(
    checkoutDraft.paymentMethod || 'wallet'
  );
  const [notes, setNotes] = useState(checkoutDraft.notes || orderNote || '');
  const [placing, setPlacing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [brokenImages, setBrokenImages] = useState<Set<number>>(new Set());
  const [showRewardSheet, setShowRewardSheet] = useState(false);

  useEffect(() => { refreshWallet(); }, [refreshWallet]);

  const subtotal = getTotal();
  const deliveryFee = orderMode === 'delivery' ? config.delivery_fee : 0;
  const discount = discountValue;
  const total = Math.max(0, subtotal + deliveryFee - discount);
  const itemCount = getItemCount();
  const requiresWallet = paymentMethod === 'wallet';
  const walletSufficient = balance >= total;

  const saveDraft = () => {
    setCheckoutDraft({
      orderMode, selectedStore, deliveryAddress, pickupTime, paymentMethod, notes,
      voucherCode: discountCode, rewardCode: discountCode,
      recipientName, recipientPhone, deliveryInstructions: deliveryInstr,
    });
  };

  const handlePlaceOrder = async () => {
    if (orderMode === 'delivery' && !deliveryAddress?.address) {
      showToast('Please enter a delivery address', 'error'); return;
    }
    if (orderMode === 'pickup' && !selectedStore) {
      showToast('Please select a store', 'error'); return;
    }
    if (orderMode === 'dine_in' && !dineInSession) {
      showToast('Please scan a table QR', 'error'); return;
    }
    setPlacing(true);
    try {
      const result: any = await placeOrder({
        storeId: selectedStore?.id || dineInSession?.storeId || 0,
        orderType: orderMode,
        deliveryAddress: deliveryAddress || undefined,
        pickupTime: pickupTime || undefined,
        paymentMethod,
        notes: notes || orderNote,
        voucherCode: discountType === 'voucher' ? discountCode : undefined,
        rewardRedemptionCode: discountType === 'reward' ? discountCode : undefined,
        tableId: dineInSession?.tableId,
      });
      if (result?.order_number) setOrderNumber(result.order_number);
      setSuccess(true);
      clearCheckoutDraft();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || 'Order failed', 'error');
    } finally {
      setPlacing(false);
    }
  };

  if (success) {
    return (
      <div className="co-success-screen">
        <div className="co-success-card">
          <div className="co-success-icon"><CheckCircle2 size={36} color="#85B085" /></div>
          <h2 className="co-success-title">Order Placed!</h2>
          {orderNumber && <p className="co-success-number">#{orderNumber}</p>}
          <p className="co-success-text">Your order has been confirmed and is being processed</p>
          <div className="co-success-btns">
            <button className="co-success-btn-primary" onClick={() => { setPage('orders'); setCurrentOrder(null); }}>
              <Receipt size={18} /> View Orders
            </button>
            <button className="co-success-btn-secondary" onClick={() => { setSuccess(false); setPage('home'); clearCheckoutDraft(); }}>
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="checkout-screen">
      <div className="checkout-header">
        <button className="checkout-back-btn" onClick={() => { saveDraft(); setPage('cart'); }}>
          <ArrowLeft size={20} />
        </button>
        <h3 className="checkout-title">Checkout</h3>
      </div>

      <div className="checkout-scroll">
        {/* Order Type */}
        <div className="checkout-section">
          <div className="co-section-title">Order Type</div>
          <div className="co-type-pills">
            {ORDER_TYPES.map((ot) => {
              const isDineIn = ot.key === 'dine_in';
              return (
                <button
                  key={ot.key}
                  className={`co-type-pill ${orderMode === ot.key ? 'active' : ''} ${isDineIn ? 'disabled' : ''}`}
                  onClick={() => {
                    if (isDineIn) {
                      showToast('Please ask service crew for QR code to dine in', 'info', 'Dine-in Unavailable');
                      return;
                    }
                    setOrderMode(ot.key);
                  }}
                >
                  {isDineIn && <QrCode size={14} style={{ marginRight: 4 }} />}
                  {ot.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Dine-in */}
        {orderMode === 'dine_in' && dineInSession && (
          <div className="checkout-section">
            <div className="co-section-title">Table</div>
            <div className="co-store-info">
              <div className="co-store-icon">🍽️</div>
              <div><div className="co-store-name">Table {dineInSession.tableNumber}</div><div className="co-store-address">{dineInSession.storeName}</div></div>
            </div>
          </div>
        )}

        {/* Store */}
        {(orderMode === 'pickup' || orderMode === 'delivery') && selectedStore && (
          <div className="checkout-section">
            <div className="co-section-title">Store</div>
            <div className="co-store-info">
              <div className="co-store-icon">🏪</div>
              <div><div className="co-store-name">{selectedStore.name}</div><div className="co-store-address">{selectedStore.address}</div></div>
            </div>
          </div>
        )}

        {/* Delivery Address */}
        {orderMode === 'delivery' && (
          <div className="checkout-section">
            <div className="co-section-title">Delivery Address</div>
            <div className="co-delivery-fields">
              <div className="co-delivery-field">
                <label className="co-delivery-label">Recipient&apos;s Name</label>
                <input value={recipientName} onChange={e => { setRecipientName(e.target.value); saveDraft(); }} placeholder="Your full name" className="co-delivery-input" />
              </div>
              <div className="co-delivery-field">
                <label className="co-delivery-label">Recipient&apos;s Phone</label>
                <input value={recipientPhone} onChange={e => { setRecipientPhone(e.target.value); saveDraft(); }} placeholder="60123456789" className="co-delivery-input" />
              </div>
            </div>
            <DeliveryAddressCard
              value={deliveryAddress}
              onChange={(addr) => { setDeliveryAddress(addr); saveDraft(); }}
            />
            <div className="co-delivery-field" style={{ marginTop: 10 }}>
              <label className="co-delivery-label">Delivery Instructions (optional)</label>
              <input value={deliveryInstr} onChange={e => { setDeliveryInstr(e.target.value); saveDraft(); }} placeholder="e.g., Ring doorbell twice" className="co-delivery-input" />
            </div>
          </div>
        )}

        {/* Time Slots */}
        {orderMode !== 'dine_in' && (
          <div className="checkout-section">
            <div className="co-section-title">{orderMode === 'pickup' ? 'Pickup Time' : 'Delivery Time'}</div>
            <TimeSlotPicker onChange={(t) => { setPickupTime(t); saveDraft(); }} value={pickupTime} />
          </div>
        )}

        {/* Voucher / Reward — grey card opens bottom sheet */}
        <div className="checkout-section">
          <div className="co-section-title">Voucher &amp; Rewards</div>
          <button className="co-reward-card" onClick={() => setShowRewardSheet(true)}>
            <div className="co-reward-left">
              <div className="co-reward-icon"><Tag size={16} color={LOKA.copper} /></div>
              <span className="co-reward-text">
                {discountType ? `${discountType === 'voucher' ? 'Voucher' : 'Reward'} applied (-${formatPrice(discount)})` : 'Apply Voucher or Reward'}
              </span>
            </div>
            <ChevronRight size={16} color={LOKA.textMuted} />
          </button>
        </div>

        {/* Order Notes — grey bg read-only */}
        {notes && (
          <div className="checkout-section">
            <div className="co-section-title">Order Notes</div>
            <div className="co-notes-display">{notes}</div>
          </div>
        )}

        {/* Payment Method */}
        <div className="checkout-section">
          <div className="co-section-title">Payment Method</div>

          {/* Wallet */}
          <div className="co-wallet-balance" onClick={() => setPaymentMethod('wallet')}>
            <div className="co-payment-icon co-payment-icon-wallet"><Wallet size={16} color="#fff" /></div>
            <div style={{ flex: 1 }}>
              <div className="co-wallet-label">Wallet Balance</div>
              <div className="co-wallet-amount">{formatPrice(balance)}</div>
            </div>
            {paymentMethod === 'wallet' && <CheckCircle2 size={18} color="#fff" />}
          </div>

          {/* Pay at Store */}
          <div className={`co-payment-card ${paymentMethod === 'pay_at_store' ? 'selected' : ''}`} onClick={() => setPaymentMethod('pay_at_store')}>
            <div className="co-payment-icon co-payment-icon-cash"><Banknote size={14} color="#fff" /></div>
            <div className="co-payment-info"><div className="co-payment-label">Pay at Store</div></div>
            <div className="co-payment-check"><CheckCircle2 size={12} /></div>
          </div>

          {/* Cash on Delivery */}
          <div className={`co-payment-card ${paymentMethod === 'cod' ? 'selected' : ''}`} onClick={() => setPaymentMethod('cod')}>
            <div className="co-payment-icon co-payment-icon-cash"><Banknote size={14} color="#fff" /></div>
            <div className="co-payment-info"><div className="co-payment-label">Cash on Delivery</div></div>
            <div className="co-payment-check"><CheckCircle2 size={12} /></div>
          </div>

          {/* Visa/Master — greyed out, coming soon */}
          <div className="co-payment-card disabled">
            <div className="co-payment-icon co-payment-icon-visa">VISA</div>
            <div className="co-payment-info">
              <div className="co-payment-label">Visa / Mastercard</div>
              <div className="co-payment-desc">Coming soon</div>
            </div>
            <div className="co-payment-check" />
          </div>

          {/* DuitNow — greyed out */}
          <div className="co-payment-card disabled">
            <div className="co-payment-icon co-payment-icon-duitnow">D</div>
            <div className="co-payment-info">
              <div className="co-payment-label">DuitNow</div>
              <div className="co-payment-desc">Coming soon</div>
            </div>
            <div className="co-payment-check" />
          </div>

          {/* TnG — greyed out */}
          <div className="co-payment-card disabled">
            <div className="co-payment-icon co-payment-icon-tng">TnG</div>
            <div className="co-payment-info">
              <div className="co-payment-label">Touch &apos;n Go eWallet</div>
              <div className="co-payment-desc">Coming soon</div>
            </div>
            <div className="co-payment-check" />
          </div>
        </div>

        {/* Order Summary */}
        <div className="co-summary-card">
          <div className="co-section-title">Order Summary</div>
          <div className="co-order-items-list">
            {items.map((item, i) => {
              const tags = typeof item.customizations === 'object' && item.customizations
                ? ((item.customizations as any)?.options as any[])?.map((o: any) => {
                    const name = o.name || '';
                    const colonIdx = name.indexOf(': ');
                    return colonIdx >= 0 ? name.slice(colonIdx + 2) : name;
                  }) || []
                : [];
              return (
                <div key={i} className="co-order-item-row">
                  <div className="co-order-item-thumb">
                    {item.image_url && !brokenImages.has(item.menu_item_id) ? (
                      <img src={resolveAssetUrl(item.image_url) || ''} alt={item.name}
                        onError={() => setBrokenImages(prev => new Set(prev).add(item.menu_item_id))} />
                    ) : (
                      <Coffee size={18} color="#384B16" />
                    )}
                  </div>
                  <div className="co-order-item-info">
                    <div className="co-order-item-name">{item.name}</div>
                    {tags.length > 0 && (
                      <div className="co-order-item-tags">
                        {tags.map((t: string, j: number) => (
                          <span key={j} className="co-order-item-tag">{t}</span>
                        ))}
                      </div>
                    )}
                    {item.quantity > 1 && (
                      <div className="co-order-item-unit">{formatPrice(item.price)} × {item.quantity}</div>
                    )}
                  </div>
                  <div className="co-order-item-price">
                    <div className="co-order-item-total">{formatPrice(item.price * item.quantity)}</div>
                    {item.quantity > 1 && <div className="co-order-item-each">{formatPrice(item.price)} each</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="co-summary-row"><span>Subtotal</span><span>{formatPrice(subtotal)}</span></div>
          {deliveryFee > 0 && <div className="co-summary-row"><span>Delivery fee</span><span>{formatPrice(deliveryFee)}</span></div>}
          {deliveryFee === 0 && orderMode === 'delivery' && <div className="co-summary-row"><span>Delivery fee</span><span className="co-summary-free">Free</span></div>}
          {discount > 0 && <div className="co-summary-row"><span>Discount</span><span>-{formatPrice(discount)}</span></div>}
          <div className="co-summary-row total"><span>Total</span><span>{formatPrice(total)}</span></div>
        </div>
      </div>

      <div className="checkout-footer">
        <div className="checkout-footer-row">
          <div>
            <div className="checkout-footer-total-label">Total</div>
            <div className="checkout-footer-total">{formatPrice(total)}</div>
          </div>
          <div className="checkout-footer-count">{items.length} item{items.length !== 1 ? 's' : ''}</div>
        </div>
        {requiresWallet && !walletSufficient ? (
          <button className="co-topup-btn" onClick={() => setPage('wallet')}>
            <Wallet size={18} /> Top up {formatPrice(total - balance)} to continue
          </button>
        ) : (
          <button className="co-place-order-btn" onClick={handlePlaceOrder} disabled={placing}>
            {placing ? <Loader2 size={18} className="spinning" /> : <UtensilsCrossed size={18} />}
            {placing ? 'Placing order...' : `Place Order · ${formatPrice(total)}`}
          </button>
        )}
      </div>
    </div>
  );
}
