'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  ArrowLeft, Wallet, Banknote, CheckCircle2, Loader2, UtensilsCrossed, Coffee, Tag, QrCode, ChevronRight, Utensils, Store,
} from 'lucide-react';
import { useCartStore } from '@/stores/cartStore';
import { haptic } from '@/lib/haptics';
import { useUIStore } from '@/stores/uiStore';
import { useWalletStore } from '@/stores/walletStore';
import { useConfigStore } from '@/stores/configStore';
import { useAuthStore } from '@/stores/authStore';
import { placeOrder } from '@/lib/cartSync';
import TimeSlotPicker from '@/components/checkout/TimeSlotPicker';
import DeliveryAddressCard from '@/components/checkout/DeliveryAddressCard';
import { formatPrice, resolveAssetUrl, LOKA } from '@/lib/tokens';
import type { Order, BundleProduct } from '@/lib/api';
import { haversineKm } from '@/lib/geolocation';
import { formatStoreAddress } from '@/lib/storeHelpers';
import { BottomSheet } from '@/components/ui/BottomSheet';
import VoucherRewardSelector from '@/components/checkout/VoucherRewardSelector';
import StripePaymentSheet from '@/components/stripe/StripePaymentSheet';
import { useTranslation } from '@/hooks/useTranslation';
import { previewCartDiscounts } from '@/lib/addonDeal';
import api from '@/lib/api';

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
  { key: 'pickup' as const, labelKey: 'cart.mode.pickup' },
  { key: 'delivery' as const, labelKey: 'cart.mode.delivery' },
  { key: 'dine_in' as const, labelKey: 'cart.mode.dineIn' },
];

export default function CheckoutPage() {
  const { t } = useTranslation();
  const { items, getTotal, getItemCount, orderNote } = useCartStore();
  const { orderMode, setOrderMode, selectedStore, setPage, showToast, checkoutDraft, setCheckoutDraft, clearCheckoutDraft, dineInSession, menuItems } = useUIStore();
  const { balance, refreshWallet } = useWalletStore();
  const { config } = useConfigStore();
  const user = useAuthStore((s) => s.user);

  const isDineInLocked = orderMode === 'dine_in' && !!dineInSession;

  const [pickupTime, setPickupTime] = useState<string | null>(checkoutDraft.pickupTime ?? null);
  const [deliveryAddress, setDeliveryAddress] = useState<{ address: string; lat?: number; lng?: number } | null>(checkoutDraft.deliveryAddress ?? null);
  const [recipientName, setRecipientName] = useState(checkoutDraft.recipientName || '');
  const [recipientPhone, setRecipientPhone] = useState(checkoutDraft.recipientPhone || '');
  const [deliveryInstr, setDeliveryInstr] = useState(checkoutDraft.deliveryInstructions || '');
  const [discountType, setDiscountType] = useState<'voucher' | 'reward' | null>(checkoutDraft.discountType ?? null);
  const [discountCode, setDiscountCode] = useState(checkoutDraft.discountCode || '');
  const [discountValue, setDiscountValue] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'pay_at_store' | 'cod' | 'cash' | 'gateway' | 'hitpay'>(
    checkoutDraft.paymentMethod || (orderMode === 'dine_in' ? 'pay_at_store' : 'wallet')
  );
  const [hitpayEnabled, setHitpayEnabled] = useState(false);
  const [notes, _setNotes] = useState(checkoutDraft.notes || orderNote || '');
  const [placing, setPlacing] = useState(false);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
  const [showRewardSheet, setShowRewardSheet] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set());
  const [bundleProducts, setBundleProducts] = useState<BundleProduct[]>([]);
  const [draftSaved, setDraftSaved] = useState(false);
  const [gatewayOrder, setGatewayOrder] = useState<Order | null>(null);
  const [gatewayIntent, setGatewayIntent] = useState<{ paymentId: number; clientSecret: string } | null>(null);
  const [stripePublishableKey, setStripePublishableKey] = useState('');
  const [stripeReady, setStripeReady] = useState(false);

  useEffect(() => { refreshWallet(); }, [refreshWallet]);
  useEffect(() => {
    api.get('/payments/config')
      .then((res) => {
        const cfg = res.data || {};
        if (cfg.stripe_publishable_key) {
          setStripePublishableKey(cfg.stripe_publishable_key);
          setStripeReady(true);
        }
        setHitpayEnabled(!!cfg.hitpay_enabled);
      })
      .catch((e: unknown) => console.error('[Checkout] payment config failed:', e));
  }, []);
  useEffect(() => { if (user && !checkoutDraft.recipientName && !recipientName) { setRecipientName(user.display_name || ''); setRecipientPhone(user.phone_number || ''); }   }, [user, checkoutDraft.recipientName, recipientName]);
  // Fetch bundle products for discount preview
  useEffect(() => {
    let cancelled = false;
    api.get('/menu/bundle-products').then((res) => {
      if (!cancelled) setBundleProducts(Array.isArray(res.data) ? res.data : (res.data?.items || []));
    }).catch((e: unknown) => console.error("Bundle products fetch failed:", e));
    return () => { cancelled = true; };
  }, []);
  // Migrate legacy drafts that stored voucher/reward without discountType
  const migratedDraft = useRef(false);
  useEffect(() => {
    if (migratedDraft.current) return;
    if (!discountType && !discountCode) {
      if (checkoutDraft.voucherCode) { migratedDraft.current = true; setDiscountType('voucher'); setDiscountCode(checkoutDraft.voucherCode); }
      else if (checkoutDraft.rewardCode) { migratedDraft.current = true; setDiscountType('reward'); setDiscountCode(checkoutDraft.rewardCode); }
    } else {
      migratedDraft.current = true;
    }
  }, [checkoutDraft.voucherCode, checkoutDraft.rewardCode, discountCode, discountType]);

  const subtotal = getTotal();
  const deliveryFee = orderMode === 'delivery' ? config.delivery_fee : 0;
  const voucherDiscount = discountValue;
  const bundleBreakdown = previewCartDiscounts(items, menuItems, bundleProducts);
  const totalDiscount = voucherDiscount + bundleBreakdown.total;
  const total = Math.max(0, subtotal + deliveryFee - totalDiscount);
  const itemCount = getItemCount();
  const requiresWallet = paymentMethod === 'wallet';
  const walletSufficient = balance >= total;

  // Delivery radius: check distance from store to delivery address (not user location)
  const deliveryOutOfRange = useMemo(() => {
    if (orderMode !== 'delivery' || !selectedStore?.latitude || !selectedStore?.longitude || !deliveryAddress?.lat || !deliveryAddress?.lng) return false;
    const radius = selectedStore.delivery_radius_km;
    if (radius == null || radius <= 0) return false;
    const dist = haversineKm(selectedStore.latitude, selectedStore.longitude, deliveryAddress.lat, deliveryAddress.lng);
    return dist > radius;
  }, [orderMode, selectedStore?.latitude, selectedStore?.longitude, selectedStore?.delivery_radius_km, deliveryAddress?.lat, deliveryAddress?.lng]);

  const saveDraft = () => {
    setCheckoutDraft({ orderMode, selectedStore, deliveryAddress, pickupTime, paymentMethod, notes: orderNote, discountType, discountCode, recipientName, recipientPhone, deliveryInstructions: deliveryInstr });
    setDraftSaved(true);
    setTimeout(() => setDraftSaved(false), 1500);
  };

  const handlePlaceOrder = async () => {
    const missing = new Set<string>();
    const storeId = selectedStore?.id ?? dineInSession?.storeId ?? null;
    if (!storeId || storeId === 0) missing.add('store');
    if (orderMode === 'delivery' && !deliveryAddress?.address) missing.add('address');
    if (orderMode === 'pickup' && !selectedStore) missing.add('store');
    if (orderMode !== 'dine_in' && !pickupTime) missing.add('time');
    if (missing.size > 0) { setFieldErrors(missing); showToast(t('checkout.fieldErrors'), 'error'); return; }
    if (deliveryOutOfRange) { showToast(t('toast.outOfRange'), 'error'); return; }
    setFieldErrors(new Set());
    setPlacing(true);
    try {
      const result: Order = await placeOrder({
        storeId: storeId!, orderType: orderMode,
        deliveryAddress: deliveryAddress || undefined, pickupTime: pickupTime || undefined,
        paymentMethod, notes: notes || orderNote,
        recipientName: recipientName || undefined, recipientPhone: recipientPhone || undefined,
        deliveryInstructions: deliveryInstr || undefined,
        voucherCode: discountType === 'voucher' ? discountCode : undefined,
        rewardRedemptionCode: discountType === 'reward' ? discountCode : undefined,
        tableId: dineInSession?.tableId,
      });
      if (paymentMethod === 'gateway') {
        if (!stripeReady || !stripePublishableKey) {
          throw new Error('Online payment is not ready');
        }
        const intentRes = await api.post('/payments/intent', {
          order_id: result.id,
          provider: 'stripe',
          payment_method: 'gateway',
        });
        const data = intentRes.data;
        if (!data?.client_secret || !data?.payment_id) {
          throw new Error('Unable to start payment');
        }
        setGatewayOrder(result);
        setGatewayIntent({ paymentId: data.payment_id, clientSecret: data.client_secret });
        setPlacing(false);
        return;
      }
      if (paymentMethod === 'hitpay') {
        if (!hitpayEnabled) {
          throw new Error('HitPay is not available');
        }
        const intentRes = await api.post('/payments/intent', {
          order_id: result.id,
          provider: 'hitpay',
          payment_method: 'hitpay',
        });
        const data = intentRes.data;
        if (!data?.redirect_url || !data?.payment_id) {
          throw new Error('Unable to start HitPay payment');
        }
        // Redirect to the HitPay hosted checkout; the customer returns to the
        // order detail page with ?status=completed|canceled.
        window.location.href = data.redirect_url;
        return;
      }
      clearCheckoutDraft();
      haptic('success');
      setPage('order-detail', { orderId: result.id });
    } catch (e: unknown) { showToast((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('toast.orderFailed'), 'error'); }
    finally { setPlacing(false); }
  };

  return (
    <>
    <div className="checkout-screen">
      <div className="checkout-header">
        <button className="checkout-back-btn" onClick={() => { saveDraft(); setPage('cart'); }}><ArrowLeft size={20} /></button>
        <h3 className="checkout-title">{t('checkout.title')}</h3>
        {draftSaved && <span className="checkout-draft-saved">{t('checkout.draftSaved')}</span>}
      </div>
      <div className="checkout-scroll">
        <div className="checkout-section">
          <div className="co-section-title">{t('checkout.orderType')}</div>
          <div className="co-type-pills">
            {ORDER_TYPES.map(ot => {
              const isDineIn = ot.key === 'dine_in';
              const isCurrent = orderMode === ot.key;
              const isClicable = !isDineIn || dineInSession;
              return <button key={ot.key}
                className={`co-type-pill ${isCurrent ? 'active' : ''} ${isDineIn && !dineInSession ? 'disabled' : ''}`}
                onClick={() => {
                  if (isDineInLocked && ot.key !== 'dine_in') {
                    showToast(t('toast.dineInLocked'), 'info');
                    return;
                  }
                  if (isClicable) setOrderMode(ot.key);
                  else showToast(t('toast.dineInUnavailable'), 'info');
                }}
                disabled={isDineInLocked && ot.key !== 'dine_in'}>
                {isDineIn && <QrCode size={14} className="mr-1" />}{t(ot.labelKey)}
              </button>;
            })}
          </div>
        </div>
        {orderMode === 'dine_in' && dineInSession && (
          <div className="checkout-section">
            <div className="co-section-title">{t('checkout.table')}</div>
            <div className="co-store-info"><div className="co-store-icon"><Utensils size={16} /></div><div><div className="co-store-name">{t('checkout.tableNumber', { number: dineInSession.tableNumber })}</div><div className="co-store-address">{dineInSession.storeName}</div></div></div>
          </div>
        )}
        {(orderMode === 'pickup' || orderMode === 'delivery') && selectedStore && (
          <div className="checkout-section">
            <div className="co-section-title">{t('checkout.store')}</div>
            <div className="co-store-info"><div className="co-store-icon"><Store size={16} /></div><div><div className="co-store-name">{selectedStore.store_name}</div><div className="co-store-address">{formatStoreAddress(selectedStore)}</div></div></div>
          </div>
        )}
        {orderMode === 'delivery' && (
          <div className={`checkout-section${fieldErrors.has('address') ? ' error' : ''}`}>
            <div className="co-section-title">{t('checkout.deliveryAddress')}</div>
            <div className="co-delivery-fields">
              <div className="co-delivery-field"><label className="co-delivery-label">{t('checkout.recipientName')}</label><input value={recipientName} onChange={e => { setRecipientName(e.target.value); saveDraft(); }} placeholder={t('checkout.namePlaceholder')} autoComplete="name" className="co-delivery-input" /></div>
              <div className="co-delivery-field"><label className="co-delivery-label">{t('checkout.recipientPhone')}</label><input value={recipientPhone} onChange={e => { setRecipientPhone(e.target.value); saveDraft(); }} placeholder="60123456789" autoComplete="tel" inputMode="tel" className="co-delivery-input" /></div>
            </div>
            <DeliveryAddressCard value={deliveryAddress} onChange={(addr) => { setDeliveryAddress(addr); saveDraft(); }} />
            <div className="co-delivery-field mt-2"><label className="co-delivery-label">{t('checkout.deliveryInstructions')}</label><input value={deliveryInstr} onChange={e => { setDeliveryInstr(e.target.value); saveDraft(); }} placeholder={t('checkout.deliveryInstrPlaceholder')} autoComplete="off" className="co-delivery-input" /></div>
            {deliveryOutOfRange && selectedStore && (
              <div className="co-delivery-out-of-range">
                {t('checkout.outOfRange', { radius: selectedStore.delivery_radius_km ?? 0 })}
              </div>
            )}
          </div>
        )}
        {orderMode !== 'dine_in' && (
          <div className={`checkout-section${fieldErrors.has('time') ? ' error' : ''}`}>
            <div className="co-section-title">{orderMode === 'pickup' ? t('checkout.pickupTime') : t('checkout.deliveryTime')}</div>
            <TimeSlotPicker onChange={(t) => { setPickupTime(t); saveDraft(); }} value={pickupTime} mode={orderMode === 'delivery' ? 'delivery' : 'pickup'} leadMinutes={selectedStore?.pickup_lead_minutes ?? config.pickup_lead_minutes} />
          </div>
        )}
        <div className="checkout-section">
          <div className="co-section-title">{t('checkout.voucherRewards')}</div>
          <button className="co-reward-card" onClick={() => setShowRewardSheet(true)}>
            <div className="co-reward-left"><div className="co-reward-icon"><Tag size={16} color={LOKA.copper} /></div><span className="co-reward-text">{discountType ? `${discountType === 'voucher' ? t('checkout.voucher') : t('checkout.reward')} applied (-${formatPrice(voucherDiscount)})` : t('checkout.applyVoucher')}</span></div>
            <ChevronRight size={16} color={LOKA.textMuted} />
          </button>
        </div>
        <div className="checkout-section">
          <div className="co-section-title">{t('checkout.orderNotes')}</div>
          {notes ? <div className="co-notes-display">{notes}</div> : <div className="co-notes-display co-notes-empty">{t('checkout.noNotes')}</div>}
        </div>
        <div className="checkout-section">
          <div className="co-section-title">{t('checkout.paymentMethod')}</div>
          {orderMode !== 'dine_in' && (
            <div className="co-wallet-balance" onClick={() => setPaymentMethod('wallet')}>
              <div className="co-payment-icon co-payment-icon-wallet"><Wallet size={16} color="#fff" /></div>
              <div className="flex-1"><div className="co-wallet-label">{t('checkout.walletBalance')}</div><div className="co-wallet-amount">{formatPrice(balance)}</div></div>
              {paymentMethod === 'wallet' && <CheckCircle2 size={18} color="#fff" />}
            </div>
          )}
          {orderMode !== 'delivery' && <div className={`co-payment-card ${paymentMethod === 'pay_at_store' ? 'selected' : ''}`} onClick={() => setPaymentMethod('pay_at_store')}>
            <div className="co-payment-icon co-payment-icon-cash"><Banknote size={14} color="#fff" /></div>
            <div className="co-payment-info"><div className="co-payment-label">{orderMode === 'dine_in' ? t('checkout.payAtCounter') : t('checkout.payAtStore')}</div></div>
            <div className="co-payment-check"><CheckCircle2 size={12} /></div></div>}
          {orderMode === 'delivery' && <div className={`co-payment-card ${paymentMethod === 'cod' ? 'selected' : ''}`} onClick={() => setPaymentMethod('cod')}>
            <div className="co-payment-icon co-payment-icon-cash"><Banknote size={14} color="#fff" /></div>
            <div className="co-payment-info"><div className="co-payment-label">{t('checkout.cashOnDelivery')}</div></div>
            <div className="co-payment-check"><CheckCircle2 size={12} /></div>
          </div>}
          {stripeReady && (
            <div className={`co-payment-card ${paymentMethod === 'gateway' ? 'selected' : ''}`} onClick={() => setPaymentMethod('gateway')}>
              <div className="co-payment-icon co-payment-icon-gateway"><Banknote size={14} color="#fff" /></div>
              <div className="co-payment-info"><div className="co-payment-label">Pay Online (Card / FPX / GrabPay)</div></div>
              <div className="co-payment-check"><CheckCircle2 size={12} /></div>
            </div>
          )}
          {hitpayEnabled && (
            <div className={`co-payment-card ${paymentMethod === 'hitpay' ? 'selected' : ''}`} onClick={() => setPaymentMethod('hitpay')}>
              <div className="co-payment-icon co-payment-icon-gateway"><QrCode size={14} color="#fff" /></div>
              <div className="co-payment-info"><div className="co-payment-label">Pay Online (DuitNow / TnG / Boost / ShopeePay)</div></div>
              <div className="co-payment-check"><CheckCircle2 size={12} /></div>
            </div>
          )}
        </div>
        <div className="co-summary-card">
          <div className="co-section-title">{t('checkout.orderSummary')}</div>
          <div className="co-order-items-list">
            {items.map((item, _i) => {
              const cust = item.customizations as CustomizationStructure | undefined;
              const tags = cust?.options?.map((o) => { const name = o.name || ''; const colonIdx = name.indexOf(': '); return colonIdx >= 0 ? name.slice(colonIdx + 2) : name; }) || [];
              return (
                <div key={`${item.menu_item_id}-${JSON.stringify([...(item.customization_option_ids ?? [])].sort())}`} className="co-order-item-row">
                  <div className="co-order-item-thumb">{item.image_url && !brokenImages.has(`${item.menu_item_id}-${(item.customization_option_ids ?? []).join(',') || '0'}`) ? <img src={resolveAssetUrl(item.image_url) || ''} alt={item.name} loading="lazy" onError={() => setBrokenImages(prev => new Set(prev).add(`${item.menu_item_id}-${(item.customization_option_ids ?? []).join(',') || '0'}`))} /> : <Coffee size={18} color={LOKA.primary} />}</div>
                  <div className="co-order-item-info">
                    <div className="co-order-item-name">{item.name}</div>
                    {tags.length > 0 && <div className="co-order-item-tags">{tags.map((t: string, j: number) => <span key={j} className="co-order-item-tag">{t}</span>)}</div>}
                    {item.quantity > 1 && <div className="co-order-item-unit">{formatPrice(item.price)} × {item.quantity}</div>}
                  </div>
                  <div className="co-order-item-price"><div className="co-order-item-total">{formatPrice(item.price * item.quantity)}</div>          {item.quantity > 1 && <div className="co-order-item-each">{formatPrice(item.price)} {t('common.each')}</div>}</div>
                </div>
              );
            })}
          </div>
          <div className="co-summary-row"><span>{t('cart.subtotal')}</span><span>{formatPrice(subtotal)}</span></div>
          {deliveryFee > 0 && <div className="co-summary-row"><span>{t('cart.deliveryFee')}</span><span>{formatPrice(deliveryFee)}</span></div>}
          {deliveryFee === 0 && orderMode === 'delivery' && <div className="co-summary-row"><span>{t('cart.deliveryFee')}</span><span className="co-summary-free">{t('cart.free')}</span></div>}
          {voucherDiscount > 0 && <div className="co-summary-row"><span>{t('checkout.discount')}</span><span>-{formatPrice(voucherDiscount)}</span></div>}
          {bundleBreakdown.bundleDiscount > 0 && <div className="co-summary-row"><span>{t('checkout.bundleDiscount')}</span><span>-{formatPrice(bundleBreakdown.bundleDiscount)}</span></div>}
          {bundleBreakdown.addonDiscount > 0 && <div className="co-summary-row"><span>{t('checkout.addonDiscount')}</span><span>-{formatPrice(bundleBreakdown.addonDiscount)}</span></div>}
          <div className="co-summary-row total"><span>{t('cart.total')}</span><span>{formatPrice(total)}</span></div>
        </div>
      </div>
      <div className="checkout-footer">
        <div className="checkout-footer-row">
          <div><div className="checkout-footer-total-label">{t('cart.total')}</div><div className="checkout-footer-total">{formatPrice(total)}</div></div>
          <div className="checkout-footer-count">{t('cart.itemCount', { count: itemCount })}</div>
        </div>
        {requiresWallet && !walletSufficient ? (
          <button className="co-topup-btn" onClick={() => setPage('wallet')}><Wallet size={18} /> {t('checkout.topUpToContinue', { amount: formatPrice(total - balance) })}</button>
        ) : (
          <button className="co-place-order-btn" onClick={handlePlaceOrder} disabled={placing}>{placing ? <Loader2 size={18} className="spinning" /> : <UtensilsCrossed size={18} />}{placing ? t('checkout.placingOrder') : t('checkout.placeOrderPrice', { price: formatPrice(total) })}</button>
        )}
      </div>
    </div>
    <BottomSheet isOpen={showRewardSheet} onClose={() => setShowRewardSheet(false)} title={t('checkout.voucherRewards')}>
      <div className="sheet-body">
        <VoucherRewardSelector subtotal={subtotal} selectedType={discountType || 'none'} selectedCode={discountCode}
          onChange={(type, code, val) => { setDiscountType(type === 'none' ? null : type); setDiscountCode(code || ''); setDiscountValue(val || 0); }} />
      </div>
    </BottomSheet>
    <BottomSheet isOpen={!!gatewayIntent} onClose={() => { setGatewayIntent(null); setGatewayOrder(null); }} title={t('checkout.payOnline')}>
      <div className="sheet-body">
        {gatewayIntent && gatewayOrder && stripePublishableKey && (
          <StripePaymentSheet
            clientSecret={gatewayIntent.clientSecret}
            paymentId={gatewayIntent.paymentId}
            orderId={gatewayOrder.id}
            publishableKey={stripePublishableKey}
            onSuccess={() => {
              clearCheckoutDraft();
              haptic('success');
              setGatewayIntent(null);
              setGatewayOrder(null);
              setPage('order-detail', { orderId: gatewayOrder.id });
            }}
            onCancel={() => {
              setGatewayIntent(null);
              setGatewayOrder(null);
              showToast(t('toast.paymentCancelled'), 'info');
            }}
            onError={(msg) => { showToast(msg, 'error'); }}
          />
        )}
      </div>
    </BottomSheet>
    </>
  );
}
