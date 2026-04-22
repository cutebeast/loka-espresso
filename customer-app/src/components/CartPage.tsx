'use client';

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Minus, Plus, ArrowRight, Coffee, QrCode, X, AlertTriangle } from 'lucide-react';
import { useCartStore } from '@/stores/cartStore';
import { useUIStore } from '@/stores/uiStore';
import { useConfigStore } from '@/stores/configStore';
import { Modal } from '@/components/ui/Modal';

import { LOKA, formatPrice } from '@/lib/tokens';
import { cacheBust } from '@/lib/api';

interface CustomizationStructure {
  options?: Array<{ id: number; name: string; price_adjustment: number }>;
  note?: string;
}

function getCustomizationText(customizations: Record<string, unknown> | undefined): string | null {
  if (!customizations || typeof customizations !== 'object') return null;
  const cust = customizations as CustomizationStructure;
  if (cust.options && Array.isArray(cust.options) && cust.options.length > 0) {
    return cust.options.map(o => o.name).join(' · ');
  }
  return null;
}

const ORDER_MODES = [
  { key: 'pickup', label: 'Pickup' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'dine_in', label: 'Dine-in' },
] as const;

export default function CartPage() {
  const { items, updateQuantity, getTotal, getItemCount, clearCart } = useCartStore();
  const { orderMode, setOrderMode, selectedStore, dineInSession, setDineInSession, setPage, showToast, setShowStorePicker } = useUIStore();
  const { config } = useConfigStore();
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const subtotal = getTotal();
  const deliveryFee = orderMode === 'delivery' ? config.delivery_fee : 0;
  const total = subtotal + deliveryFee;
  const itemCount = getItemCount();
  const belowDeliveryMinimum = orderMode === 'delivery' && config.min_order_delivery > 0 && subtotal < config.min_order_delivery;

  const handleClearCart = () => {
    clearCart();
    setShowClearConfirm(false);
    showToast('Cart cleared', 'info');
  };

  const handleOrderModeChange = (mode: 'pickup' | 'delivery' | 'dine_in') => {
    if (mode === 'dine_in' && !dineInSession) return;
    setOrderMode(mode);
  };

  const handleScanQR = useCallback(() => {
    showToast('Use the QR scanner on the home screen', 'info');
  }, [showToast]);

  if (items.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', background: LOKA.bg, flex: 1 }}>
        <div style={{ width: 72, height: 72, borderRadius: 999, background: '#E8EDE0', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <ShoppingBag size={32} color={LOKA.primary} strokeWidth={1.5} />
        </div>
        <p style={{ fontSize: 18, fontWeight: 800, color: LOKA.textPrimary, marginBottom: 8 }}>Your cart is empty</p>
        <p style={{ fontSize: 14, color: LOKA.textMuted, marginBottom: 28, textAlign: 'center' }}>Looks like you haven&apos;t added anything yet</p>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setPage('menu')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 28px', borderRadius: 999, background: LOKA.primary, color: LOKA.white, fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer', boxShadow: '0 8px 16px rgba(56,75,22,0.25)' }}
        >
          Browse Menu <ArrowRight size={18} />
        </motion.button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: LOKA.bg }}>
      <div style={{ background: LOKA.white, padding: '16px 18px 12px', borderBottom: `1px solid ${LOKA.borderSubtle}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: LOKA.textPrimary }}>Your Cart ({itemCount})</h3>
          <button onClick={() => setShowClearConfirm(true)} style={{ fontSize: 13, fontWeight: 600, color: LOKA.textMuted, background: 'transparent', border: 'none', cursor: 'pointer' }}>Clear</button>
        </div>

        <div style={{ display: 'flex', gap: 6, background: LOKA.surface, borderRadius: 12, padding: 4 }}>
          {ORDER_MODES.map((m) => {
            const isActive = orderMode === m.key;
            const isDisabled = m.key === 'dine_in' && !dineInSession;
            return (
              <button
                key={m.key}
                onClick={() => handleOrderModeChange(m.key as 'pickup' | 'delivery' | 'dine_in')}
                disabled={isDisabled}
                style={{
                  flex: 1, padding: '8px 4px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                  border: 'none', cursor: isDisabled ? 'not-allowed' : 'pointer',
                  background: isActive ? LOKA.white : 'transparent',
                  color: isDisabled ? LOKA.textMuted : isActive ? LOKA.primary : LOKA.textSecondary,
                  boxShadow: isActive ? '0 2px 8px rgba(56,75,22,0.12)' : 'none',
                  transition: 'all 0.2s ease',
                  opacity: isDisabled ? 0.6 : 1,
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '10px 18px', background: LOKA.white, borderBottom: `1px solid ${LOKA.borderSubtle}` }}>
        {orderMode === 'dine_in' && dineInSession ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: LOKA.copperSoft, borderRadius: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: LOKA.copper, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 16 }}>🍽️</span>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: LOKA.brown }}>Table {dineInSession.tableNumber} · {dineInSession.storeName}</p>
              <p style={{ fontSize: 11, color: LOKA.textMuted }}>Dine-in</p>
            </div>
            <button onClick={() => { setDineInSession(null); setOrderMode('pickup'); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: LOKA.textMuted, display: 'flex', alignItems: 'center' }}>
              <X size={16} />
            </button>
          </div>
        ) : orderMode === 'pickup' || orderMode === 'delivery' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: LOKA.surface, borderRadius: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: LOKA.copperSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 16 }}>🏪</span>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: LOKA.textPrimary }}>{selectedStore?.name || 'Select a store'}</p>
              <p style={{ fontSize: 11, color: LOKA.textMuted }}>{orderMode === 'pickup' ? 'Pickup' : 'Delivery'}</p>
            </div>
            <button onClick={() => setShowStorePicker(true)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: LOKA.copper, fontSize: 12, fontWeight: 600 }}>Change</button>
          </div>
        ) : null}
      </div>

      <div className="scroll-container" style={{ flex: 1 }}>
        <div style={{ padding: '12px 18px 8px' }}>
          <AnimatePresence>
            {items.map((item, index) => {
              const customizationText = getCustomizationText(item.customizations);
              return (
                <motion.div
                  key={`${item.menu_item_id}-${index}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center', padding: '12px 14px', background: LOKA.white, borderRadius: 18, border: `1px solid ${LOKA.borderSubtle}` }}
                >
                  <div style={{ width: 56, height: 56, borderRadius: 14, background: '#E8EDE0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                    {item.image_url ? (
                      <img 
                        src={cacheBust(item.image_url.startsWith('http') ? item.image_url : `https://admin.loyaltysystem.uk${item.image_url}`)} 
                        alt={item.name} 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                        onError={(e) => { 
                          const img = e.target as HTMLImageElement;
                          img.style.display = 'none';
                          const parent = img.parentElement;
                          if (parent) {
                            parent.innerHTML = '';
                            const icon = document.createElement('div');
                            icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#384B16" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" x2="6.01" y1="1" y2="4"/><line x1="10" x2="10.01" y1="1" y2="4"/><line x1="14" x2="14.01" y1="1" y2="4"/></svg>';
                            parent.appendChild(icon.firstChild as Node);
                          }
                        }} 
                      />
                    ) : (
                      <Coffee size={22} color={LOKA.primary} strokeWidth={1.5} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <h4 style={{ fontWeight: 700, fontSize: 14, color: LOKA.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</h4>
                      <span style={{ fontWeight: 700, fontSize: 14, color: LOKA.textPrimary, flexShrink: 0 }}>{formatPrice(item.price * item.quantity)}</span>
                    </div>
                    {customizationText && <p style={{ fontSize: 11, color: LOKA.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{customizationText}</p>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                      <motion.button whileTap={{ scale: 0.85 }} onClick={() => updateQuantity(index, item.quantity - 1)} aria-label={`Decrease ${item.name} quantity`} style={{ width: 28, height: 28, borderRadius: 999, border: `1.5px solid ${LOKA.border}`, background: LOKA.white, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: LOKA.primary }}>
                        <Minus size={13} />
                      </motion.button>
                      <span style={{ fontSize: 14, fontWeight: 700, color: LOKA.textPrimary, minWidth: 20, textAlign: 'center' }}>{item.quantity}</span>
                      <motion.button whileTap={{ scale: 0.85 }} onClick={() => updateQuantity(index, item.quantity + 1)} aria-label={`Increase ${item.name} quantity`} style={{ width: 28, height: 28, borderRadius: 999, border: `1.5px solid ${LOKA.border}`, background: LOKA.white, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: LOKA.primary }}>
                        <Plus size={13} />
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        <div style={{ padding: '0 18px 8px' }}>
          <div style={{ background: LOKA.white, borderRadius: 20, padding: 16, border: `1px solid ${LOKA.borderSubtle}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: LOKA.textSecondary }}>Subtotal</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: LOKA.textPrimary }}>{formatPrice(subtotal)}</span>
            </div>
            {deliveryFee > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <span style={{ fontSize: 13, color: LOKA.textSecondary }}>Delivery fee</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: LOKA.textPrimary }}>{formatPrice(deliveryFee)}</span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTop: `1px solid ${LOKA.borderSubtle}` }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: LOKA.textPrimary }}>Total</span>
              <span style={{ fontWeight: 800, fontSize: 18, color: LOKA.primary }}>{formatPrice(total)}</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 18px 20px', background: LOKA.bg }}>
        {orderMode === 'delivery' && config.min_order_delivery > 0 && subtotal < config.min_order_delivery && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, background: 'rgba(209,142,56,0.12)', marginBottom: 10 }}>
            <ShoppingBag size={16} color={LOKA.copper} />
            <p style={{ fontSize: 13, color: LOKA.brown, fontWeight: 600 }}>
              Add {formatPrice(config.min_order_delivery - subtotal)} more for delivery
            </p>
          </div>
        )}
        {orderMode === 'dine_in' && !dineInSession ? (
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleScanQR}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '16px 24px', borderRadius: 999, background: LOKA.copper, color: LOKA.white, fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer', boxShadow: '0 8px 16px rgba(209,142,56,0.3)' }}
          >
            <QrCode size={18} />
            Scan table QR to dine in
          </motion.button>
        ) : (
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setPage('checkout')}
            disabled={belowDeliveryMinimum}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '16px 24px', borderRadius: 999, background: LOKA.primary, color: LOKA.white, fontWeight: 700, fontSize: 15, border: 'none', cursor: belowDeliveryMinimum ? 'not-allowed' : 'pointer', boxShadow: '0 8px 16px rgba(56,75,22,0.25)', opacity: belowDeliveryMinimum ? 0.65 : 1 }}
          >
            Checkout · {orderMode === 'pickup' ? 'Pickup' : orderMode === 'delivery' ? 'Delivery' : 'Dine-in'}
          </motion.button>
        )}
      </div>

      {/* Clear Cart Confirmation Modal */}
      <Modal isOpen={showClearConfirm} onClose={() => setShowClearConfirm(false)} title="Clear Cart?" variant="center">
        <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
          <div style={{ width: 56, height: 56, borderRadius: 999, background: LOKA.copperSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <AlertTriangle size={28} color={LOKA.copper} />
          </div>
          <p style={{ fontSize: 15, color: LOKA.textSecondary, marginBottom: 8 }}>
            This will remove <strong style={{ color: LOKA.textPrimary }}>{itemCount} item{itemCount !== 1 ? 's' : ''}</strong> from your cart.
          </p>
          <p style={{ fontSize: 13, color: LOKA.textMuted }}>This action cannot be undone.</p>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowClearConfirm(false)}
            style={{ flex: 1, padding: '14px 20px', borderRadius: 999, background: LOKA.surface, color: LOKA.textPrimary, fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer' }}
          >
            Keep Items
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleClearCart}
            style={{ flex: 1, padding: '14px 20px', borderRadius: 999, background: '#DC2626', color: LOKA.white, fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer' }}
          >
            Clear Cart
          </motion.button>
        </div>
      </Modal>
    </div>
  );
}
