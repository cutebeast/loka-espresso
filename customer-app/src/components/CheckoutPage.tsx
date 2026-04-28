'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  ArrowLeft,
  Wallet,
  Banknote,
  CheckCircle2,
  Loader2,
  Receipt,
  Truck,
  UtensilsCrossed,
} from 'lucide-react';
import { useCartStore } from '@/stores/cartStore';
import { useUIStore } from '@/stores/uiStore';
import { useWalletStore } from '@/stores/walletStore';
import { useOrderStore } from '@/stores/orderStore';
import { useConfigStore } from '@/stores/configStore';
import { placeOrder } from '@/lib/cartSync';
import api from '@/lib/api';
import TimeSlotPicker from '@/components/checkout/TimeSlotPicker';
import DeliveryAddressCard from '@/components/checkout/DeliveryAddressCard';
import DineInTableCard from '@/components/checkout/DineInTableCard';
import VoucherRewardSelector from '@/components/checkout/VoucherRewardSelector';
import OrderNotesField from '@/components/checkout/OrderNotesField';
import { formatPrice } from '@/lib/tokens';

const ORDER_TYPES = [
  { key: 'pickup' as const, label: 'Pickup' },
  { key: 'delivery' as const, label: 'Delivery' },
  { key: 'dine_in' as const, label: 'Dine-in' },
];

export default function CheckoutPage() {
  const { items, getTotal, orderNote, setOrderNote } = useCartStore();
  const {
    orderMode, selectedStore, stores, dineInSession, setPage, showToast,
    setOrderMode, setSelectedStore, setStores, checkoutDraft, setCheckoutDraft, clearCheckoutDraft,
  } = useUIStore();
  const { balance, setBalance, refreshWallet } = useWalletStore();
  const { addOrder } = useOrderStore();
  const { config } = useConfigStore();

  const [pickupTime, setPickupTime] = useState<string | null>(checkoutDraft.pickupTime ?? null);
  const [deliveryAddress, setDeliveryAddress] = useState<{ address: string; lat?: number; lng?: number } | null>(checkoutDraft.deliveryAddress ?? null);
  const [discountType, setDiscountType] = useState<'none' | 'voucher' | 'reward'>(
    checkoutDraft.voucherCode ? 'voucher' : checkoutDraft.rewardCode ? 'reward' : 'none'
  );
  const [discountCode, setDiscountCode] = useState<string>(checkoutDraft.voucherCode || checkoutDraft.rewardCode || '');
  const [discountValue, setDiscountValue] = useState(0);
  const notes = orderNote;
  const [placing, setPlacing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [orderId, setOrderId] = useState<number | null>(null);
  const [pointsEarned, setPointsEarned] = useState<number>(0);

  // Payment method: 'wallet' (prepaid), 'pay_at_store' (pickup), 'cod' (delivery), 'cash' (dine-in)
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'pay_at_store' | 'cod' | 'cash'>(checkoutDraft.paymentMethod ?? 'wallet');

  const subtotal = getTotal();
  const deliveryFee = orderMode === 'delivery' ? config.delivery_fee : 0;
  const discount = discountValue;
  const total = subtotal + deliveryFee - discount;
  const walletSufficient = balance >= total;
  const belowDeliveryMinimum = orderMode === 'delivery' && config.min_order_delivery > 0 && subtotal < config.min_order_delivery;

  // Derive effective payment method
  const effectivePaymentMethod = orderMode === 'dine_in' ? 'cash' : paymentMethod;
  const requiresWallet = effectivePaymentMethod === 'wallet';



  // Fetch stores if not loaded
  useEffect(() => {
    if (stores.length === 0) {
      api.get('/stores').then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setStores(list);
      }).catch(() => {});
    }
  }, [stores.length, setStores]);

  const handleVoucherChange = useCallback((type: 'none' | 'voucher' | 'reward', code?: string, dv?: number) => {
    setDiscountType(type);
    setDiscountCode(code || '');
    setDiscountValue(dv || 0);
    setCheckoutDraft({
      ...checkoutDraft,
      voucherCode: type === 'voucher' ? code : undefined,
      rewardCode: type === 'reward' ? code : undefined,
    });
  }, [setCheckoutDraft]);

  const handlePlaceOrder = async () => {
    if (items.length === 0) { showToast('Cart is empty', 'error'); return; }
    if (!selectedStore && orderMode !== 'dine_in') { showToast('Please select a store', 'error'); return; }

    if (orderMode === 'pickup' && !pickupTime) { showToast('Please select a pickup time', 'error'); return; }
    if (orderMode === 'delivery' && !deliveryAddress?.address) { showToast('Please enter a delivery address', 'error'); return; }
    if (orderMode === 'dine_in' && !dineInSession) { showToast('No dine-in session', 'error'); return; }
    if (belowDeliveryMinimum) { showToast(`Delivery requires at least ${formatPrice(config.min_order_delivery)}`, 'error'); return; }
    if (requiresWallet && !walletSufficient) { showToast('Insufficient wallet balance', 'error'); return; }

    setPlacing(true);
    try {
      const storeId = orderMode === 'dine_in' && dineInSession ? dineInSession.storeId : selectedStore?.id;
      if (!storeId) { showToast('Store not selected', 'error'); setPlacing(false); return; }

      const newOrder = await placeOrder({
        storeId,
        orderType: orderMode,
        pickupTime: pickupTime || undefined,
        deliveryAddress: deliveryAddress || undefined,
        tableId: dineInSession?.tableId,
        notes: notes || undefined,
        voucherCode: discountType === 'voucher' ? discountCode : undefined,
        rewardRedemptionCode: discountType === 'reward' ? discountCode : undefined,
        paymentMethod: effectivePaymentMethod,
      });

      setOrderNumber(newOrder?.order_number || '');
      setOrderId(newOrder?.id || null);
      setPointsEarned(newOrder?.points_earned || newOrder?.loyalty_points_earned || 0);
      addOrder(newOrder);

      if (requiresWallet) {
        setBalance(balance - total);
        await refreshWallet();
      }
      setSuccess(true);
      clearCheckoutDraft();
      showToast('Order placed successfully!', 'success');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string; message?: string } } })?.response?.data?.detail;
      const msg = detail || (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to place order';
      showToast(msg, 'error');
    } finally {
      setPlacing(false);
    }
  };

  if (success) {
    return (
      <div className="co-success-screen">
        <div className="co-success-icon">
          <CheckCircle2 size={40} color="white" strokeWidth={1.5} />
        </div>
        <h2 className="co-success-title">Order placed!</h2>
        <p className="co-success-text">Your order number is</p>
        <p className="co-success-number">#{orderNumber}</p>

        <div className="co-success-card">
          {orderMode === 'pickup' && pickupTime && (
            <p className="co-success-text">
              Ready at <strong>{new Date(pickupTime).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: true })}</strong>
            </p>
          )}
          {orderMode === 'delivery' && deliveryAddress && (
            <p className="co-success-text">
              {orderId ? 'Dispatch request created for' : 'Delivery request created for'} <strong>{deliveryAddress.address}</strong>
            </p>
          )}
          {orderMode === 'dine_in' && dineInSession && (
            <p className="co-success-text">
              Staff is preparing your order at <strong>Table {dineInSession.tableNumber}</strong>
            </p>
          )}
          {!requiresWallet && orderMode !== 'dine_in' && (
            <div className="co-pay-later-note">
              <Banknote size={14} color="#92400E" />
              <span>
                {effectivePaymentMethod === 'cod' ? 'Cash on Delivery — pay the courier' : 'Pay at store when you pick up'}
              </span>
            </div>
          )}
          {pointsEarned > 0 && (
            <div className="co-success-points">
              +{pointsEarned} Loka points
            </div>
          )}
          {!requiresWallet && (
            <p className="co-points-note">Points will be awarded after payment</p>
          )}
        </div>

        <div className="co-success-btns">
          <button className="co-success-btn-primary" onClick={() => setPage('orders')}>
            Track Order →
          </button>
          <button className="co-success-btn-secondary" onClick={() => { setSuccess(false); setPage('home'); clearCheckoutDraft(); }}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="checkout-screen">
      {/* Header */}
      <div className="checkout-header">
        <button className="checkout-back-btn" onClick={() => { setCheckoutDraft({ orderMode, selectedStore, deliveryAddress, pickupTime, paymentMethod, notes, voucherCode: discountType === 'voucher' ? discountCode : undefined, rewardCode: discountType === 'reward' ? discountCode : undefined }); setPage('cart'); }}>
          <ArrowLeft size={18} />
        </button>
        <h1 className="checkout-title">Checkout</h1>
      </div>

      <div className="checkout-scroll">
        {/* Order Type */}
        <div>
          <div className="co-section-title">Order Type</div>
          <div className="co-type-pills">
            {ORDER_TYPES.map((t) => {
              const isActive = orderMode === t.key;
              const isDisabled = t.key === 'dine_in' && !dineInSession;
              return (
                <button
                  key={t.key}
                  className={`co-type-pill ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
                  title={isDisabled ? 'Scan table QR to enable' : undefined}
                  onClick={() => {
                    if (isDisabled) return;
                    setOrderMode(t.key);
                    setCheckoutDraft({ orderMode: t.key });
                    // Adjust payment method for new order type
                    let nextPayment = paymentMethod;
                    if (t.key === 'dine_in') {
                      nextPayment = 'cash';
                    } else if (t.key === 'delivery') {
                      if (paymentMethod === 'pay_at_store' || paymentMethod === 'cash') {
                        nextPayment = 'wallet';
                      }
                    } else if (t.key === 'pickup') {
                      if (paymentMethod === 'cod' || paymentMethod === 'cash') {
                        nextPayment = 'wallet';
                      }
                    }
                    setPaymentMethod(nextPayment);
                    setCheckoutDraft({ paymentMethod: nextPayment });
                  }}
                  disabled={isDisabled}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Dine-in info */}
          {orderMode === 'dine_in' && dineInSession && (
            <DineInTableCard
              tableNumber={dineInSession.tableNumber}
              storeName={dineInSession.storeName}
              onScanDifferent={() => window.dispatchEvent(new CustomEvent('open-qr-scanner'))}
            />
          )}
          {orderMode === 'dine_in' && !dineInSession && (
            <button
              className="co-dinein-scan-btn"
              onClick={() => window.dispatchEvent(new CustomEvent('open-qr-scanner'))}
            >
              <UtensilsCrossed size={16} />
              <span>Scan table QR code</span>
            </button>
          )}
        </div>

        {/* Store selector (pickup / delivery) */}
        {orderMode !== 'dine_in' && (
          <div>
            <div className="co-section-title">Select Store</div>
            <select
              className="co-select-box"
              value={selectedStore?.id || ''}
              onChange={(e) => {
                const storeId = parseInt(e.target.value, 10);
                const found = stores.find((s) => s.id === storeId);
                if (found) {
                  setSelectedStore(found);
                  setCheckoutDraft({ selectedStore: found });
                }
              }}
            >
              <option value="" disabled>Choose a store…</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Delivery Address */}
        {orderMode === 'delivery' && (
          <div>
            <div className="co-section-title">Delivery Address</div>
            <DeliveryAddressCard value={deliveryAddress} onChange={(addr) => { setDeliveryAddress(addr); setCheckoutDraft({ deliveryAddress: addr }); }} />
            {selectedStore && !selectedStore.delivery_integration_enabled && (
              <div className="co-manual-delivery-banner">
                <Truck size={18} color="#B45309" />
                <div>
                  <p className="co-manual-delivery-text">Manual Delivery</p>
                  <p className="co-manual-delivery-sub">Our team will arrange delivery manually after preparing your order.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Scheduled Time */}
        {orderMode !== 'dine_in' && (
          <div>
            <div className="co-section-title">Scheduled Time</div>
            <TimeSlotPicker
              value={pickupTime}
              onChange={(time) => { setPickupTime(time); setCheckoutDraft({ pickupTime: time }); }}
              leadMinutes={config.pickup_lead_minutes}
            />
          </div>
        )}

        {/* Voucher / Reward */}
        <div>
          <VoucherRewardSelector
            subtotal={subtotal}
            selectedType={discountType}
            selectedCode={discountCode}
            onChange={handleVoucherChange}
          />
        </div>

        {/* Order Notes */}
        <div>
          <OrderNotesField value={notes} onChange={(val) => { setOrderNote(val); setCheckoutDraft({ notes: val }); }} orderMode={orderMode} />
        </div>

        {/* Payment Method */}
        <div>
          <div className="co-section-title">Payment Method</div>

          {/* Wallet balance card */}
          <div className="co-wallet-balance">
            <div>
              <div className="co-wallet-label">Loka Wallet</div>
              <div className="co-wallet-amount">{formatPrice(balance)}</div>
            </div>
            <Wallet size={24} className="co-wallet-icon" />
          </div>

          <div className="co-payment-options">
            {/* Wallet Option */}
            <button
              className={`co-payment-card ${paymentMethod === 'wallet' && orderMode !== 'dine_in' ? 'selected' : ''} ${orderMode === 'dine_in' ? 'disabled' : ''}`}
              onClick={() => {
                if (orderMode === 'dine_in') return;
                setPaymentMethod('wallet');
                setCheckoutDraft({ paymentMethod: 'wallet' });
              }}
            >
              <div className="co-payment-radio" />
              <div>
                <div className="co-payment-label">E-Wallet</div>
                <div className="co-payment-desc">Balance: {formatPrice(balance)}</div>
              </div>
            </button>

            {/* Pay at Store / COD / Counter Option */}
            <button
              className={`co-payment-card ${(paymentMethod !== 'wallet' || orderMode === 'dine_in') ? 'selected' : ''}`}
              onClick={() => {
                let next: 'wallet' | 'pay_at_store' | 'cod' | 'cash' = 'wallet';
                if (orderMode === 'dine_in') {
                  next = 'cash';
                } else if (orderMode === 'delivery') {
                  next = 'cod';
                } else {
                  next = 'pay_at_store';
                }
                setPaymentMethod(next);
                setCheckoutDraft({ paymentMethod: next });
              }}
            >
              <div className="co-payment-radio" />
              <div>
                <div className="co-payment-label">
                  {orderMode === 'delivery' ? 'Cash on Delivery' : orderMode === 'dine_in' ? 'Pay at Counter' : 'Pay at Store'}
                </div>
                <div className="co-payment-desc">
                  {orderMode === 'delivery' ? 'Pay the courier with cash' : orderMode === 'dine_in' ? 'Staff will take your payment' : 'Pay at the counter when you pick up'}
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Order Summary */}
        <div className="co-summary-card">
          <div className="co-section-title">Order Summary</div>
          <div className="co-order-items-list">
            {items.map((item, i) => (
              <div key={i} className="co-order-item">
                • {item.quantity}x {item.name}
              </div>
            ))}
          </div>
          <div className="co-summary-row">
            <span>Subtotal</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          {deliveryFee > 0 && (
            <div className="co-summary-row">
              <span>Delivery fee</span>
              <span>{formatPrice(deliveryFee)}</span>
            </div>
          )}
          {discount > 0 && (
            <div className="co-summary-row">
              <span>Discount</span>
              <span>-{formatPrice(discount)}</span>
            </div>
          )}
          <div className="co-summary-row total">
            <span>Total</span>
            <span>{formatPrice(total)}</span>
          </div>
        </div>

        {/* Place Order */}
        {requiresWallet && !walletSufficient ? (
          <button className="co-topup-btn" onClick={() => setPage('wallet')}>
            <Wallet size={18} />
            Top up {formatPrice(total - balance)} to continue
          </button>
        ) : (
          <button
            className={`co-place-order-btn${orderMode === 'dine_in' ? ' send-kitchen' : ''}`}
            onClick={handlePlaceOrder}
            disabled={placing || belowDeliveryMinimum}
          >
            {placing ? (
              <><Loader2 size={18} className="animate-spin" /> Placing…</>
            ) : (
              <>{orderMode === 'dine_in' ? '👨‍🍳 Send to kitchen' : <><Receipt size={18} />{`Place Order · ${formatPrice(total)}`}</>}</>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
