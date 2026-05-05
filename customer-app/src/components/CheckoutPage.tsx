'use client';

import { useState, useEffect } from 'react';
import {
  ArrowLeft, Wallet, Banknote, CheckCircle2, Loader2, UtensilsCrossed, Coffee, Tag, QrCode, ChevronRight, Utensils, Store,
} from 'lucide-react';
import { useCartStore } from '@/stores/cartStore';
import { useUIStore } from '@/stores/uiStore';
import { useWalletStore } from '@/stores/walletStore';
import { useConfigStore } from '@/stores/configStore';
import { useAuthStore } from '@/stores/authStore';
import { placeOrder } from '@/lib/cartSync';
import TimeSlotPicker from '@/components/checkout/TimeSlotPicker';
import DeliveryAddressCard from '@/components/checkout/DeliveryAddressCard';
import { formatPrice, resolveAssetUrl, LOKA } from '@/lib/tokens';
import { BottomSheet } from '@/components/ui/BottomSheet';
import VoucherRewardSelector from '@/components/checkout/VoucherRewardSelector';

interface CustomizationOption {
  id: number;
  name: string;
  price_adjustment: number;
}

interface CustomizationStructure {
  options?: CustomizationOption[];
  note?: string;
}

const ORDER_TYPES = [
  { key: 'pickup' as const, label: 'Pickup' },
  { key: 'delivery' as const, label: 'Delivery' },
  { key: 'dine_in' as const, label: 'Dine-in' },
];

export default function CheckoutPage() {
  const { items, getTotal, getItemCount, orderNote } = useCartStore();
  const { orderMode, setOrderMode, selectedStore, setPage, showToast, checkoutDraft, setCheckoutDraft, clearCheckoutDraft, dineInSession } = useUIStore();
  const { balance, refreshWallet } = useWalletStore();
  const { config } = useConfigStore();
  const user = useAuthStore((s) => s.user);

  const isDineInLocked = orderMode === 'dine_in' && !!dineInSession;

  const [pickupTime, setPickupTime] = useState<string | null>(checkoutDraft.pickupTime ?? null);
  const [deliveryAddress, setDeliveryAddress] = useState<{ address: string; lat?: number; lng?: number } | null>(checkoutDraft.deliveryAddress ?? null);
  const [recipientName, setRecipientName] = useState(checkoutDraft.recipientName || '');
  const [recipientPhone, setRecipientPhone] = useState(checkoutDraft.recipientPhone || '');
  const [deliveryInstr, setDeliveryInstr] = useState(checkoutDraft.deliveryInstructions || '');
  const [discountType, setDiscountType] = useState<'voucher' | 'reward' | null>(null);
  const [discountCode, setDiscountCode] = useState('');
  const [discountValue, setDiscountValue] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'pay_at_store' | 'cod' | 'cash'>(
    checkoutDraft.paymentMethod || (orderMode === 'dine_in' ? 'pay_at_store' : 'wallet')
  );
  const [notes, setNotes] = useState(checkoutDraft.notes || orderNote || '');
  const [placing, setPlacing] = useState(false);
  const [brokenImages, setBrokenImages] = useState<Set<number>>(new Set());
  const [showRewardSheet, setShowRewardSheet] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set());

  useEffect(() => { refreshWallet(); }, [refreshWallet]);
  useEffect(() => { if (user && !checkoutDraft.recipientName && !recipientName) { setRecipientName(user.name || ''); setRecipientPhone(user.phone || ''); } }, [user]);

  const subtotal = getTotal();
  const deliveryFee = orderMode === 'delivery' ? config.delivery_fee : 0;
  const discount = discountValue;
  const total = Math.max(0, subtotal + deliveryFee - discount);
  const itemCount = getItemCount();
  const requiresWallet = paymentMethod === 'wallet';
  const walletSufficient = balance >= total;

  const saveDraft = () => setCheckoutDraft({ orderMode, selectedStore, deliveryAddress, pickupTime, paymentMethod, notes, voucherCode: discountCode, rewardCode: discountCode, recipientName, recipientPhone, deliveryInstructions: deliveryInstr });

  const handlePlaceOrder = async () => {
    const missing = new Set<string>();
    if (orderMode === 'delivery' && !deliveryAddress?.address) missing.add('address');
    if (orderMode === 'pickup' && !selectedStore) missing.add('store');
    if (orderMode !== 'dine_in' && !pickupTime) missing.add('time');
    if (missing.size > 0) { setFieldErrors(missing); showToast('Please fill in the highlighted fields', 'error'); return; }
    setFieldErrors(new Set());
    setPlacing(true);
    try {
      const result: any = await placeOrder({
        storeId: selectedStore?.id || dineInSession?.storeId || 0, orderType: orderMode,
        deliveryAddress: deliveryAddress || undefined, pickupTime: pickupTime || undefined,
        paymentMethod, notes: notes || orderNote,
        recipientName: recipientName || undefined, recipientPhone: recipientPhone || undefined,
        deliveryInstructions: deliveryInstr || undefined,
        voucherCode: discountType === 'voucher' ? discountCode : undefined,
        rewardRedemptionCode: discountType === 'reward' ? discountCode : undefined,
        tableId: dineInSession?.tableId,
      });
      clearCheckoutDraft();
      setPage('order-detail', { orderId: result.id });
    } catch (e: any) { showToast(e?.response?.data?.detail || 'Order failed', 'error'); }
    finally { setPlacing(false); }
  };

  return (
    <>
    <div className="checkout-screen">
      <div className="checkout-header">
        <button className="checkout-back-btn" onClick={() => { saveDraft(); setPage('cart'); }}><ArrowLeft size={20} /></button>
        <h3 className="checkout-title">Checkout</h3>
      </div>
      <div className="checkout-scroll">
        <div className="checkout-section">
          <div className="co-section-title">Order Type</div>
          <div className="co-type-pills">
            {ORDER_TYPES.map(ot => {
              const isDineIn = ot.key === 'dine_in';
              const isCurrent = orderMode === ot.key;
              const isClicable = !isDineIn || dineInSession;
              return <button key={ot.key}
                className={`co-type-pill ${isCurrent ? 'active' : ''} ${isDineIn && !dineInSession ? 'disabled' : ''}`}
                onClick={() => {
                  if (isDineInLocked && ot.key !== 'dine_in') {
                    showToast('Dine-in session active — cannot switch order type', 'info');
                    return;
                  }
                  if (isClicable) setOrderMode(ot.key);
                  else showToast('Scan a table QR code to enable dine-in', 'info');
                }}
                disabled={isDineInLocked && ot.key !== 'dine_in'}>
                {isDineIn && <QrCode size={14} style={{ marginRight: 4 }} />}{ot.label}
              </button>;
            })}
          </div>
        </div>
        {orderMode === 'dine_in' && dineInSession && (
          <div className="checkout-section">
            <div className="co-section-title">Table</div>
            <div className="co-store-info"><div className="co-store-icon"><Utensils size={16} /></div><div><div className="co-store-name">Table {dineInSession.tableNumber}</div><div className="co-store-address">{dineInSession.storeName}</div></div></div>
          </div>
        )}
        {(orderMode === 'pickup' || orderMode === 'delivery') && selectedStore && (
          <div className="checkout-section">
            <div className="co-section-title">Store</div>
            <div className="co-store-info"><div className="co-store-icon"><Store size={16} /></div><div><div className="co-store-name">{selectedStore.name}</div><div className="co-store-address">{selectedStore.address}</div></div></div>
          </div>
        )}
        {orderMode === 'delivery' && (
          <div className={`checkout-section${fieldErrors.has('address') ? ' error' : ''}`}>
            <div className="co-section-title">Delivery Address</div>
            <div className="co-delivery-fields">
              <div className="co-delivery-field"><label className="co-delivery-label">Recipient&apos;s Name</label><input value={recipientName} onChange={e => { setRecipientName(e.target.value); saveDraft(); }} placeholder="Your full name" className="co-delivery-input" /></div>
              <div className="co-delivery-field"><label className="co-delivery-label">Recipient&apos;s Phone</label><input value={recipientPhone} onChange={e => { setRecipientPhone(e.target.value); saveDraft(); }} placeholder="60123456789" className="co-delivery-input" /></div>
            </div>
            <DeliveryAddressCard value={deliveryAddress} onChange={(addr) => { setDeliveryAddress(addr); saveDraft(); }} />
            <div className="co-delivery-field" style={{ marginTop: 10 }}><label className="co-delivery-label">Delivery Instructions (optional)</label><input value={deliveryInstr} onChange={e => { setDeliveryInstr(e.target.value); saveDraft(); }} placeholder="e.g., Ring doorbell twice" className="co-delivery-input" /></div>
          </div>
        )}
        {orderMode !== 'dine_in' && (
          <div className={`checkout-section${fieldErrors.has('time') ? ' error' : ''}`}>
            <div className="co-section-title">{orderMode === 'pickup' ? 'Pickup Time' : 'Delivery Time'}</div>
            <TimeSlotPicker onChange={(t) => { setPickupTime(t); saveDraft(); }} value={pickupTime} />
          </div>
        )}
        <div className="checkout-section">
          <div className="co-section-title">Voucher &amp; Rewards</div>
          <button className="co-reward-card" onClick={() => setShowRewardSheet(true)}>
            <div className="co-reward-left"><div className="co-reward-icon"><Tag size={16} color={LOKA.copper} /></div><span className="co-reward-text">{discountType ? `${discountType === 'voucher' ? 'Voucher' : 'Reward'} applied (-${formatPrice(discount)})` : 'Apply Voucher or Reward'}</span></div>
            <ChevronRight size={16} color={LOKA.textMuted} />
          </button>
        </div>
        <div className="checkout-section">
          <div className="co-section-title">Order Notes</div>
          {notes ? <div className="co-notes-display">{notes}</div> : <div className="co-notes-display" style={{ color: LOKA.border, fontStyle: 'italic' }}>No special requests. Add notes from your cart.</div>}
        </div>
        <div className="checkout-section">
          <div className="co-section-title">Payment Method</div>
          {orderMode !== 'dine_in' && (
            <div className="co-wallet-balance" onClick={() => setPaymentMethod('wallet')}>
              <div className="co-payment-icon co-payment-icon-wallet"><Wallet size={16} color="#fff" /></div>
              <div style={{ flex: 1 }}><div className="co-wallet-label">Wallet Balance</div><div className="co-wallet-amount">{formatPrice(balance)}</div></div>
              {paymentMethod === 'wallet' && <CheckCircle2 size={18} color="#fff" />}
            </div>
          )}
          {orderMode !== 'delivery' && <div className={`co-payment-card ${paymentMethod === 'pay_at_store' ? 'selected' : ''}`} onClick={() => setPaymentMethod('pay_at_store')}>
            <div className="co-payment-icon co-payment-icon-cash"><Banknote size={14} color="#fff" /></div>
            <div className="co-payment-info"><div className="co-payment-label">{orderMode === 'dine_in' ? 'Pay at Counter' : 'Pay at Store'}</div></div>
            <div className="co-payment-check"><CheckCircle2 size={12} /></div></div>}
          {orderMode === 'delivery' && <div className={`co-payment-card ${paymentMethod === 'cod' ? 'selected' : ''}`} onClick={() => setPaymentMethod('cod')}>
            <div className="co-payment-icon co-payment-icon-cash"><Banknote size={14} color="#fff" /></div>
            <div className="co-payment-info"><div className="co-payment-label">Cash on Delivery</div></div>
            <div className="co-payment-check"><CheckCircle2 size={12} /></div>
          </div>}
          <div className="co-payment-card disabled"><div className="co-payment-icon co-payment-icon-visa">VISA</div><div className="co-payment-info"><div className="co-payment-label">Visa / Mastercard</div><div className="co-payment-desc">Coming soon</div></div><div className="co-payment-check" /></div>
          <div className="co-payment-card disabled"><div className="co-payment-icon co-payment-icon-duitnow">D</div><div className="co-payment-info"><div className="co-payment-label">DuitNow</div><div className="co-payment-desc">Coming soon</div></div><div className="co-payment-check" /></div>
          <div className="co-payment-card disabled"><div className="co-payment-icon co-payment-icon-tng">TnG</div><div className="co-payment-info"><div className="co-payment-label">Touch &apos;n Go eWallet</div><div className="co-payment-desc">Coming soon</div></div><div className="co-payment-check" /></div>
        </div>
        <div className="co-summary-card">
          <div className="co-section-title">Order Summary</div>
          <div className="co-order-items-list">
            {items.map((item, i) => {
              const cust = item.customizations as CustomizationStructure | undefined;
              const tags = cust?.options?.map((o) => { const name = o.name || ''; const colonIdx = name.indexOf(': '); return colonIdx >= 0 ? name.slice(colonIdx + 2) : name; }) || [];
              return (
                <div key={i} className="co-order-item-row">
                  <div className="co-order-item-thumb">{item.image_url && !brokenImages.has(item.menu_item_id) ? <img src={resolveAssetUrl(item.image_url) || ''} alt={item.name} loading="lazy" onError={() => setBrokenImages(prev => new Set(prev).add(item.menu_item_id))} /> : <Coffee size={18} color={LOKA.primary} />}</div>
                  <div className="co-order-item-info">
                    <div className="co-order-item-name">{item.name}</div>
                    {tags.length > 0 && <div className="co-order-item-tags">{tags.map((t: string, j: number) => <span key={j} className="co-order-item-tag">{t}</span>)}</div>}
                    {item.quantity > 1 && <div className="co-order-item-unit">{formatPrice(item.price)} × {item.quantity}</div>}
                  </div>
                  <div className="co-order-item-price"><div className="co-order-item-total">{formatPrice(item.price * item.quantity)}</div>{item.quantity > 1 && <div className="co-order-item-each">{formatPrice(item.price)} each</div>}</div>
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
          <div><div className="checkout-footer-total-label">Total</div><div className="checkout-footer-total">{formatPrice(total)}</div></div>
          <div className="checkout-footer-count">{items.length} item{items.length !== 1 ? 's' : ''}</div>
        </div>
        {requiresWallet && !walletSufficient ? (
          <button className="co-topup-btn" onClick={() => setPage('wallet')}><Wallet size={18} /> Top up {formatPrice(total - balance)} to continue</button>
        ) : (
          <button className="co-place-order-btn" onClick={handlePlaceOrder} disabled={placing}>{placing ? <Loader2 size={18} className="spinning" /> : <UtensilsCrossed size={18} />}{placing ? 'Placing order...' : `Place Order · ${formatPrice(total)}`}</button>
        )}
      </div>
    </div>
    <BottomSheet isOpen={showRewardSheet} onClose={() => setShowRewardSheet(false)} title="Voucher & Rewards">
      <div className="sheet-body">
        <VoucherRewardSelector subtotal={subtotal} selectedType={discountType || 'none'} selectedCode={discountCode}
          onChange={(type, code, val) => { setDiscountType(type === 'none' ? null : type); setDiscountCode(code || ''); setDiscountValue(val || 0); }} />
      </div>
    </BottomSheet>
    </>
  );
}
