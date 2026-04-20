'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingBag,
  Tag,
  Wallet,
  Banknote,
  CheckCircle2,
  ArrowLeft,
  Truck,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { useCartStore } from '@/stores/cartStore';
import { useUIStore } from '@/stores/uiStore';
import { useWalletStore } from '@/stores/walletStore';
import { useOrderStore } from '@/stores/orderStore';
import { Button, Badge } from '@/components/ui';
import api from '@/lib/api';

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

export default function CheckoutPage() {
  const { items, storeId, getTotal, clearCart } = useCartStore();
  const { selectedStore, orderMode, setPage, showToast } = useUIStore();
  const { balance, setBalance } = useWalletStore();
  const { addOrder } = useOrderStore();

  const [voucherCode, setVoucherCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [voucherValidating, setVoucherValidating] = useState(false);
  const [voucherApplied, setVoucherApplied] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<'wallet' | 'cash'>(
    balance >= getTotal() ? 'wallet' : 'cash'
  );
  const [placing, setPlacing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [orderId, setOrderId] = useState<number | null>(null);

  const subtotal = getTotal();
  const deliveryFee = orderMode === 'delivery' ? 3 : 0;
  const total = subtotal + deliveryFee - discount;

  const handleApplyVoucher = async () => {
    if (!voucherCode.trim()) return;
    setVoucherValidating(true);
    try {
      const res = await api.post('/vouchers/validate', {
        code: voucherCode.trim(),
        order_total: subtotal,
      });
      const discountVal = res.data?.discount_value || 0;
      setDiscount(discountVal);
      setVoucherApplied(true);
      showToast(`Voucher applied! ${formatPrice(discountVal)} off`, 'success');
    } catch {
      setDiscount(0);
      setVoucherApplied(false);
      showToast('Invalid voucher code', 'error');
    } finally {
      setVoucherValidating(false);
    }
  };

  const handlePlaceOrder = async () => {
    if (items.length === 0) {
      showToast('Cart is empty', 'error');
      return;
    }
    setPlacing(true);
    try {
      const orderPayload = {
        store_id: storeId || selectedStore?.id,
        order_type: orderMode,
        items: items.map((i) => ({
          menu_item_id: i.menu_item_id,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
          customizations: i.customizations,
        })),
        subtotal,
        delivery_fee: deliveryFee,
        total,
        payment_method: selectedPayment,
      };

      const orderRes = await api.post('/orders', orderPayload);
      const newOrder = orderRes.data;
      setOrderNumber(newOrder?.order_number || '');
      setOrderId(newOrder?.id || null);
      addOrder(newOrder);

      if (selectedPayment === 'wallet') {
        const intentRes = await api.post('/payments/create-intent', {
          order_id: newOrder.id,
          amount: total,
          method: 'wallet',
        });
        await api.post('/payments/confirm', {
          payment_intent_id: intentRes.data?.id || intentRes.data?.payment_intent_id,
        });
        setBalance(balance - total);
      }

      clearCart();
      setSuccess(true);
      showToast('Order placed successfully!', 'success');
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to place order';
      showToast(message, 'error');
    } finally {
      setPlacing(false);
    }
  };

  if (success) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-16 px-6"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.2 }}
          className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6"
        >
          <CheckCircle2 size={40} className="text-green-500" />
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-xl font-bold text-gray-900 mb-2"
        >
          Order Placed!
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-sm text-gray-500 mb-1"
        >
          Your order number is
        </motion.p>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="text-2xl font-bold text-primary mb-8"
        >
          #{orderNumber}
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="w-full space-y-3"
        >
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => {
              if (orderId) {
                useOrderStore.getState().setCurrentOrder(
                  useOrderStore.getState().orders.find((o) => o.id === orderId) || null
                );
              }
              setPage('orders');
            }}
          >
            Track Order
          </Button>
          <Button variant="outline" size="lg" className="w-full" onClick={() => setPage('home')}>
            Back to Home
          </Button>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="px-4 pt-4 pb-6">
      <motion.div variants={staggerItem} className="flex items-center gap-3 mb-5">
        <button
          onClick={() => setPage('cart')}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"
        >
          <ArrowLeft size={18} className="text-gray-600" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Checkout</h1>
      </motion.div>

      <motion.div variants={staggerItem} className="mb-5">
        <h2 className="text-sm font-bold text-gray-900 mb-3">Order Summary</h2>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
          {items.map((item, i) => (
            <div key={`${item.menu_item_id}-${i}`} className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{item.name}</p>
                <p className="text-xs text-gray-400">
                  x{item.quantity} &middot; {formatPrice(item.price)} each
                </p>
              </div>
              <span className="text-sm font-bold text-gray-900 ml-3">
                {formatPrice(item.price * item.quantity)}
              </span>
            </div>
          ))}
          {deliveryFee > 0 && (
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <Truck size={14} className="text-gray-400" />
                <span className="text-sm text-gray-500">Delivery fee</span>
              </div>
              <span className="text-sm font-medium text-gray-900">{formatPrice(deliveryFee)}</span>
            </div>
          )}
          {discount > 0 && (
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <span className="text-sm text-green-600">Discount</span>
              <span className="text-sm font-bold text-green-600">-{formatPrice(discount)}</span>
            </div>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-gray-200">
            <span className="text-base font-bold text-gray-900">Total</span>
            <span className="text-lg font-bold text-primary">{formatPrice(total)}</span>
          </div>
        </div>
      </motion.div>

      <motion.div variants={staggerItem} className="mb-5">
        <h2 className="text-sm font-bold text-gray-900 mb-3">Voucher</h2>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Tag size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={voucherCode}
              onChange={(e) => {
                setVoucherCode(e.target.value);
                if (voucherApplied) {
                  setVoucherApplied(false);
                  setDiscount(0);
                }
              }}
              placeholder="Enter voucher code"
              className="w-full pl-11 pr-4 py-3.5 rounded-full border-2 border-gray-200 focus:border-primary outline-none text-sm text-gray-900 placeholder:text-gray-400"
            />
          </div>
          <Button
            variant="outline"
            size="md"
            onClick={handleApplyVoucher}
            isLoading={voucherValidating}
            disabled={!voucherCode.trim() || voucherApplied}
          >
            {voucherApplied ? 'Applied' : 'Apply'}
          </Button>
        </div>
        {voucherApplied && discount > 0 && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-green-600 mt-2 ml-1"
          >
            Voucher applied: {formatPrice(discount)} discount
          </motion.p>
        )}
      </motion.div>

      <motion.div variants={staggerItem} className="mb-6">
        <h2 className="text-sm font-bold text-gray-900 mb-3">Payment Method</h2>
        <div className="space-y-2">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setSelectedPayment('wallet')}
            className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-colors ${
              selectedPayment === 'wallet'
                ? 'border-primary bg-primary/5'
                : 'border-gray-200 bg-white'
            }`}
            disabled={balance < total}
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center ${
                selectedPayment === 'wallet' ? 'bg-primary/10' : 'bg-gray-100'
              }`}
            >
              <Wallet
                size={18}
                className={selectedPayment === 'wallet' ? 'text-primary' : 'text-gray-400'}
              />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold text-gray-900">Wallet</p>
              <p className="text-xs text-gray-500">Balance: {formatPrice(balance)}</p>
            </div>
            {balance < total && (
              <Badge variant="error" size="sm">
                Insufficient
              </Badge>
            )}
            <div
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                selectedPayment === 'wallet' ? 'border-primary' : 'border-gray-300'
              }`}
            >
              {selectedPayment === 'wallet' && (
                <div className="w-2.5 h-2.5 rounded-full bg-primary" />
              )}
            </div>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setSelectedPayment('cash')}
            className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-colors ${
              selectedPayment === 'cash'
                ? 'border-primary bg-primary/5'
                : 'border-gray-200 bg-white'
            }`}
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center ${
                selectedPayment === 'cash' ? 'bg-primary/10' : 'bg-gray-100'
              }`}
            >
              <Banknote
                size={18}
                className={selectedPayment === 'cash' ? 'text-primary' : 'text-gray-400'}
              />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold text-gray-900">Cash on Pickup</p>
              <p className="text-xs text-gray-500">Pay when you collect</p>
            </div>
            <div
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                selectedPayment === 'cash' ? 'border-primary' : 'border-gray-300'
              }`}
            >
              {selectedPayment === 'cash' && (
                <div className="w-2.5 h-2.5 rounded-full bg-primary" />
              )}
            </div>
          </motion.button>
        </div>
      </motion.div>

      <AnimatePresence>
        {items.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center"
          >
            <p className="text-sm text-amber-700">Your cart is empty. Add items to continue.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setPage('menu')}
              rightIcon={<ChevronRight size={14} />}
            >
              Browse Menu
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div variants={staggerItem}>
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={handlePlaceOrder}
          isLoading={placing}
          disabled={items.length === 0}
          leftIcon={placing ? undefined : <ShoppingBag size={18} />}
        >
          {placing ? (
            <span className="flex items-center gap-2">
              <Loader2 size={18} className="animate-spin" />
              Placing Order...
            </span>
          ) : (
            `Place Order - ${formatPrice(total)}`
          )}
        </Button>
      </motion.div>
    </motion.div>
  );
}
