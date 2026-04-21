'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Wallet, Banknote, CheckCircle2, ShoppingBag, Loader2, Receipt } from 'lucide-react';
import { useCartStore } from '@/stores/cartStore';
import { useUIStore } from '@/stores/uiStore';
import { useWalletStore } from '@/stores/walletStore';
import { useOrderStore } from '@/stores/orderStore';
import { useConfigStore } from '@/stores/configStore';
import { placeOrder } from '@/lib/cartSync';
import OrderTypeHeader from '@/components/checkout/OrderTypeHeader';
import TimeSlotPicker from '@/components/checkout/TimeSlotPicker';
import DeliveryAddressCard from '@/components/checkout/DeliveryAddressCard';
import DineInTableCard from '@/components/checkout/DineInTableCard';
import VoucherRewardSelector from '@/components/checkout/VoucherRewardSelector';
import PaymentSummary from '@/components/checkout/PaymentSummary';
import OrderNotesField from '@/components/checkout/OrderNotesField';

const LOKA = {
  primary: '#384B16',
  copper: '#D18E38',
  copperSoft: 'rgba(209,142,56,0.12)',
  textPrimary: '#1B2023',
  textMuted: '#6A7A8A',
  border: '#D4DCE5',
  borderSubtle: '#E4EAEF',
  surface: '#F5F7FA',
  bg: '#E4EAEF',
  white: '#FFFFFF',
  success: '#85B085',
  danger: '#C75050',
};

function formatPrice(val: number | string): string {
  return `RM ${Number(val).toFixed(2)}`;
}

export default function CheckoutPage() {
  const { items, getTotal } = useCartStore();
  const { orderMode, selectedStore, dineInSession, setPage, showToast, setDineInSession, setOrderMode } = useUIStore();
  const { balance, setBalance, refreshWallet } = useWalletStore();
  const { addOrder } = useOrderStore();
  const { config } = useConfigStore();

  const [pickupTime, setPickupTime] = useState<string | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState<{ address: string; lat?: number; lng?: number } | null>(null);
  const [discountType, setDiscountType] = useState<'none' | 'voucher' | 'reward'>('none');
  const [discountCode, setDiscountCode] = useState<string>('');
  const [discountValue, setDiscountValue] = useState(0);
  const [notes, setNotes] = useState('');
  const [placing, setPlacing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [orderId, setOrderId] = useState<number | null>(null);
  const [pointsEarned, setPointsEarned] = useState<number>(0);

  const subtotal = getTotal();
  const deliveryFee = orderMode === 'delivery' ? config.delivery_fee : 0;
  const discount = discountValue;
  const total = subtotal + deliveryFee - discount;
  const walletSufficient = balance >= total;
  const belowDeliveryMinimum = orderMode === 'delivery' && config.min_order_delivery > 0 && subtotal < config.min_order_delivery;

  const effectiveStore = orderMode === 'dine_in' && dineInSession
    ? { name: dineInSession.storeName, address: '' }
    : selectedStore || { name: 'Selected Store', address: '' };

  const handleVoucherChange = useCallback((type: 'none' | 'voucher' | 'reward', code?: string, dv?: number) => {
    setDiscountType(type);
    setDiscountCode(code || '');
    setDiscountValue(dv || 0);
  }, []);

  const handlePlaceOrder = async () => {
    if (items.length === 0) { showToast('Cart is empty', 'error'); return; }
    if (!effectiveStore) { showToast('Please select a store', 'error'); return; }

    if (orderMode === 'pickup' && !pickupTime) { showToast('Please select a pickup time', 'error'); return; }
    if (orderMode === 'delivery' && !deliveryAddress?.address) { showToast('Please enter a delivery address', 'error'); return; }
    if (orderMode === 'dine_in' && !dineInSession) { showToast('No dine-in session', 'error'); return; }
    if (belowDeliveryMinimum) { showToast(`Delivery requires at least ${formatPrice(config.min_order_delivery)}`, 'error'); return; }
    if (orderMode !== 'dine_in' && !walletSufficient) { showToast('Insufficient wallet balance', 'error'); return; }

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
        paymentMethod: orderMode === 'dine_in' ? 'cash' : 'wallet',
      });

      setOrderNumber(newOrder?.order_number || '');
      setOrderId(newOrder?.id || null);
      setPointsEarned(newOrder?.points_earned || newOrder?.loyalty_points_earned || 0);
      addOrder(newOrder);

      if (orderMode !== 'dine_in') {
        setBalance(balance - total);
        await refreshWallet();
      }
      setSuccess(true);
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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100%', padding: '40px 24px', background: LOKA.bg }}>
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.2 }}
          style={{ width: 80, height: 80, borderRadius: 999, background: LOKA.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <CheckCircle2 size={40} color={LOKA.white} strokeWidth={1.5} />
        </motion.div>
        <motion.h2 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          style={{ fontSize: 22, fontWeight: 800, color: LOKA.textPrimary, marginBottom: 8 }}>
          Order placed!
        </motion.h2>
        <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          style={{ fontSize: 13, color: LOKA.textMuted, marginBottom: 4 }}>
          Your order number is
        </motion.p>
        <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
          style={{ fontSize: 28, fontWeight: 800, color: LOKA.primary, fontFamily: 'monospace', marginBottom: 20 }}>
          #{orderNumber}
        </motion.p>

        <div style={{ background: LOKA.white, borderRadius: 20, padding: 20, width: '100%', maxWidth: 340, marginBottom: 20, textAlign: 'center' }}>
          {orderMode === 'pickup' && pickupTime && (
            <p style={{ fontSize: 14, color: LOKA.textPrimary }}>
              Ready at <strong>{new Date(pickupTime).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: true })}</strong>
            </p>
          )}
          {orderMode === 'delivery' && deliveryAddress && (
            <p style={{ fontSize: 14, color: LOKA.textPrimary }}>
              {orderId ? 'Dispatch request created for' : 'Delivery request created for'} <strong>{deliveryAddress.address}</strong>
            </p>
          )}
          {orderMode === 'dine_in' && dineInSession && (
            <p style={{ fontSize: 14, color: LOKA.textPrimary }}>
              Staff is preparing your order at <strong>Table {dineInSession.tableNumber}</strong>
            </p>
          )}
          {pointsEarned > 0 && (
            <div style={{ marginTop: 12, padding: '8px 14px', background: LOKA.copperSoft, borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: LOKA.copper }}>+{pointsEarned} Loka points</span>
            </div>
          )}
          {orderMode === 'dine_in' && (
            <p style={{ fontSize: 12, color: LOKA.textMuted, marginTop: 8 }}>Points will be awarded after payment</p>
          )}
        </div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 340 }}>
          <motion.button whileTap={{ scale: 0.98 }} onClick={() => { setPage('orders'); }}
            style={{ width: '100%', padding: '16px 24px', borderRadius: 999, background: LOKA.primary, color: LOKA.white, fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer', boxShadow: '0 8px 16px rgba(56,75,22,0.25)' }}>
            Track Order →
          </motion.button>
          <motion.button whileTap={{ scale: 0.98 }} onClick={() => { setSuccess(false); setPage('home'); }}
            style={{ width: '100%', padding: '16px 24px', borderRadius: 999, background: LOKA.white, color: LOKA.primary, fontWeight: 700, fontSize: 15, border: `2px solid ${LOKA.primary}`, cursor: 'pointer' }}>
            Back to Home
          </motion.button>
        </motion.div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: LOKA.bg }}>
      <div style={{ background: LOKA.white, padding: '12px 18px', borderBottom: `1px solid ${LOKA.borderSubtle}`, display: 'flex', alignItems: 'center', gap: 12 }}>
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => setPage('cart')}
          style={{ width: 36, height: 36, borderRadius: 10, background: LOKA.surface, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ArrowLeft size={18} color={LOKA.primary} />
        </motion.button>
        <h1 style={{ flex: 1, fontSize: 18, fontWeight: 800, color: LOKA.textPrimary }}>
          Checkout · {orderMode === 'pickup' ? 'Pickup' : orderMode === 'delivery' ? 'Delivery' : 'Dine-in'}
        </h1>
      </div>

      <div className="scroll-container" style={{ flex: 1, padding: '14px 18px 24px' }}>
        {orderMode === 'dine_in' && dineInSession ? (
          <div style={{ marginBottom: 16 }}>
            <DineInTableCard
              tableNumber={dineInSession.tableNumber}
              storeName={dineInSession.storeName}
              onScanDifferent={() => { setDineInSession(null); setOrderMode('pickup'); setPage('home'); }}
            />
          </div>
        ) : (
          <div style={{ marginBottom: 16 }}>
            <OrderTypeHeader
              orderMode={orderMode}
              storeName={effectiveStore.name}
              storeAddress={'address' in effectiveStore ? effectiveStore.address : undefined}
            />
          </div>
        )}

        {orderMode === 'pickup' && (
          <div style={{ marginBottom: 20 }}>
            <TimeSlotPicker
              value={pickupTime}
              onChange={setPickupTime}
              leadMinutes={config.pickup_lead_minutes}
            />
          </div>
        )}

        {orderMode === 'delivery' && (
          <div style={{ marginBottom: 20 }}>
            <DeliveryAddressCard value={deliveryAddress} onChange={setDeliveryAddress} />
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <VoucherRewardSelector
            subtotal={subtotal}
            selectedType={discountType}
            selectedCode={discountCode}
            onChange={handleVoucherChange}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <OrderNotesField value={notes} onChange={setNotes} orderMode={orderMode} />
        </div>

        {orderMode !== 'dine_in' && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: LOKA.surface, borderRadius: 16, marginBottom: 12 }}>
              <Wallet size={18} color={LOKA.primary} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: LOKA.textPrimary }}>Wallet</p>
                <p style={{ fontSize: 12, color: LOKA.textMuted }}>Balance: {formatPrice(balance)}</p>
              </div>
              {walletSufficient ? (
                <div style={{ width: 20, height: 20, borderRadius: 999, background: LOKA.success, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckCircle2 size={12} color={LOKA.white} />
                </div>
              ) : (
                <div style={{ width: 20, height: 20, borderRadius: 999, background: LOKA.danger, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: LOKA.white, fontSize: 12, fontWeight: 700 }}>!</span>
                </div>
              )}
            </div>
          </div>
        )}

        {orderMode === 'dine_in' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: LOKA.surface, borderRadius: 16, marginBottom: 16 }}>
            <Receipt size={18} color={LOKA.copper} />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: LOKA.textPrimary }}>Pay at counter</p>
              <p style={{ fontSize: 12, color: LOKA.textMuted }}>Staff will take your payment</p>
            </div>
            <Banknote size={18} color={LOKA.textMuted} />
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <PaymentSummary subtotal={subtotal} deliveryFee={deliveryFee} discount={discount} total={total} />
        </div>
      </div>

      <div style={{ padding: '12px 18px 24px', background: LOKA.bg, borderTop: `1px solid ${LOKA.borderSubtle}` }}>
        {orderMode !== 'dine_in' && !walletSufficient ? (
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setPage('wallet')}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '16px 24px', borderRadius: 999, background: LOKA.copper, color: LOKA.white, fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer', boxShadow: '0 8px 16px rgba(209,142,56,0.3)' }}
          >
            <Wallet size={18} />
            Top up {formatPrice(total - balance)} to continue
          </motion.button>
        ) : (
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handlePlaceOrder}
            disabled={placing || belowDeliveryMinimum}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '16px 24px', borderRadius: 999, background: LOKA.primary, color: LOKA.white, fontWeight: 700, fontSize: 15, border: 'none', cursor: placing ? 'not-allowed' : 'pointer', boxShadow: '0 8px 16px rgba(56,75,22,0.25)', opacity: placing ? 0.7 : 1 }}
          >
            {placing ? <><Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite' }} /> Placing...</> : <><ShoppingBag size={18} />{orderMode === 'dine_in' ? 'Send to kitchen →' : `Place Order · ${formatPrice(total)}`}</>}
          </motion.button>
        )}
      </div>
    </div>
  );
}
