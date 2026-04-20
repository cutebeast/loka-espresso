'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Minus, Plus, Trash2, ArrowRight, Wallet } from 'lucide-react';
import { useCartStore } from '@/stores/cartStore';
import { useUIStore } from '@/stores/uiStore';
import { useWalletStore } from '@/stores/walletStore';
import { Button } from '@/components/ui/Button';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

function formatPrice(val: number): string {
  return `RM ${val.toFixed(2)}`;
}

export default function CartPage() {
  const { items, removeItem, updateQuantity, clearCart, getTotal, getItemCount } = useCartStore();
  const { setPage, orderMode } = useUIStore();
  const balance = useWalletStore((s) => s.balance);

  const subtotal = getTotal();
  const deliveryFee = orderMode === 'delivery' ? 3.0 : 0.0;
  const total = subtotal + deliveryFee;
  const itemCount = getItemCount();

  if (items.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-20 px-6"
      >
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-5">
          <ShoppingBag size={36} className="text-gray-300" />
        </div>
        <p className="text-gray-900 font-bold text-lg mb-1">Your cart is empty</p>
        <p className="text-gray-400 text-sm mb-6 text-center">Looks like you haven&apos;t added anything yet</p>
        <Button
          variant="primary"
          onClick={() => setPage('menu')}
          rightIcon={<ArrowRight size={16} />}
        >
          Browse Menu
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="px-4 pt-4 pb-6"
    >
      <motion.div variants={staggerItem} className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900">Your Cart</h1>
          <span className="bg-primary/10 text-primary text-xs font-bold px-2.5 py-0.5 rounded-full">
            {itemCount}
          </span>
        </div>
        <button
          onClick={clearCart}
          className="text-xs text-red-500 font-semibold hover:text-red-600 transition-colors"
        >
          Clear all
        </button>
      </motion.div>

      <motion.div variants={staggerItem} className="space-y-3 mb-6">
        <AnimatePresence>
          {items.map((item, index) => {
            const customizationText =
              item.customizations && Object.keys(item.customizations).length > 0
                ? Object.keys(item.customizations).join(', ')
                : null;

            return (
              <motion.div
                key={`${item.menu_item_id}-${index}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.25 }}
                className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{item.name}</p>
                    {customizationText && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{customizationText}</p>
                    )}
                    <p className="text-sm font-bold text-primary mt-1">{formatPrice(item.price)}</p>
                  </div>
                  <button
                    onClick={() => removeItem(index)}
                    className="p-2 rounded-full hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-3">
                    <motion.button
                      whileTap={{ scale: 0.85 }}
                      onClick={() => updateQuantity(index, item.quantity - 1)}
                      className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:border-primary hover:text-primary transition-colors"
                    >
                      <Minus size={14} />
                    </motion.button>
                    <span className="text-sm font-bold text-gray-900 w-6 text-center">{item.quantity}</span>
                    <motion.button
                      whileTap={{ scale: 0.85 }}
                      onClick={() => updateQuantity(index, item.quantity + 1)}
                      className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:border-primary hover:text-primary transition-colors"
                    >
                      <Plus size={14} />
                    </motion.button>
                  </div>
                  <span className="text-sm font-bold text-gray-900">
                    {formatPrice(item.price * item.quantity)}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>

      <motion.div variants={staggerItem} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-500">Subtotal</span>
          <span className="text-sm font-medium text-gray-900">{formatPrice(subtotal)}</span>
        </div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-500">Delivery fee</span>
          <span className="text-sm font-medium text-gray-900">
            {deliveryFee > 0 ? formatPrice(deliveryFee) : 'Free'}
          </span>
        </div>
        <div className="border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-base font-bold text-gray-900">Total</span>
            <span className="text-lg font-bold text-primary">{formatPrice(total)}</span>
          </div>
        </div>
      </motion.div>

      <motion.div variants={staggerItem}>
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={() => setPage('checkout')}
          rightIcon={<ArrowRight size={18} />}
        >
          Proceed to Checkout - {formatPrice(total)}
        </Button>
      </motion.div>

      {balance > 0 && (
        <motion.div
          variants={staggerItem}
          className="mt-4 bg-primary/5 rounded-2xl p-4 flex items-center gap-3"
        >
          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
            <Wallet size={18} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-gray-500">Wallet balance</p>
            <p className="text-sm font-bold text-primary">{formatPrice(balance)}</p>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
