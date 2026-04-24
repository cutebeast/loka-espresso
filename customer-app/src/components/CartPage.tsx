'use client';

import { useCallback, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  ShoppingBag,
  Minus,
  Plus,
  ArrowRight,
  Coffee,
  QrCode,
  X,
  AlertTriangle,
  Pen,
  Trash2,
} from 'lucide-react';
import { useCartStore } from '@/stores/cartStore';
import { useUIStore } from '@/stores/uiStore';
import { useConfigStore } from '@/stores/configStore';
import { Modal } from '@/components/ui/Modal';

import { formatPrice } from '@/lib/tokens';
import { cacheBust } from '@/lib/api';

interface CustomizationStructure {
  options?: Array<{ id: number; name: string; price_adjustment: number }>;
  note?: string;
}

function getCustomizationTags(customizations: Record<string, unknown> | undefined): string[] {
  if (!customizations || typeof customizations !== 'object') return [];
  const cust = customizations as CustomizationStructure;
  const tags: string[] = [];
  if (cust.options && Array.isArray(cust.options) && cust.options.length > 0) {
    tags.push(...cust.options.map(o => o.name));
  }
  if (cust.note) tags.push(cust.note);
  return tags;
}

const ORDER_MODES = [
  { key: 'pickup' as const, label: 'Pickup' },
  { key: 'delivery' as const, label: 'Delivery' },
  { key: 'dine_in' as const, label: 'Dine-in' },
];

export default function CartPage() {
  const { items, updateQuantity, getTotal, getItemCount, clearCart } = useCartStore();
  const { orderMode, setOrderMode, selectedStore, dineInSession, setDineInSession, setPage, showToast, setShowStorePicker } = useUIStore();
  const { config } = useConfigStore();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [orderNote, setOrderNote] = useState('');

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
      <div className="cart-empty">
        <div className="cart-empty-icon">
          <ShoppingBag size={32} style={{ color: '#384B16', opacity: 0.6 }} />
        </div>
        <p className="cart-empty-title">Your cart is empty</p>
        <p className="cart-empty-text">Looks like you haven&apos;t added anything yet</p>
        <button className="cart-empty-btn" onClick={() => setPage('menu')}>
          Browse Menu <ArrowRight size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="cart-screen">
      {/* Header */}
      <div className="cart-header">
        <h3 className="cart-header-title">Your Cart ({itemCount})</h3>
        <button className="cart-header-clear" onClick={() => setShowClearConfirm(true)}>
          Clear
        </button>
      </div>

      {/* Context card (store / dine-in info) */}
      <div style={{ padding: '10px 20px', background: 'var(--loka-bg-card)', borderBottom: '1px solid var(--loka-border-light)' }}>
        {orderMode === 'dine_in' && dineInSession ? (
          <div className="cart-context-card dinein">
            <div className="cart-context-icon copper">
              <span style={{ fontSize: 16 }}>🍽️</span>
            </div>
            <div className="cart-context-text">
              <p className="cart-context-title">Table {dineInSession.tableNumber} · {dineInSession.storeName}</p>
              <p className="cart-context-sub">Dine-in</p>
            </div>
            <button
              className="cart-context-action"
              onClick={() => { setDineInSession(null); setOrderMode('pickup'); }}
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="cart-context-card store">
            <div className="cart-context-icon copper-light">
              <span style={{ fontSize: 16 }}>🏪</span>
            </div>
            <div className="cart-context-text">
              <p className="cart-context-title">{selectedStore?.name || 'Select a store'}</p>
              <p className="cart-context-sub">{orderMode === 'pickup' ? 'Pickup' : 'Delivery'}</p>
            </div>
            <button
              className="cart-context-action copper"
              onClick={() => setShowStorePicker(true)}
            >
              Change
            </button>
          </div>
        )}
      </div>

      {/* Order mode pills */}
      <div style={{ padding: '12px 20px', background: 'var(--loka-bg-card)', borderBottom: '1px solid var(--loka-border-light)' }}>
        <div className="cart-mode-bar">
          {ORDER_MODES.map((m) => {
            const isActive = orderMode === m.key;
            const isDisabled = m.key === 'dine_in' && !dineInSession;
            return (
              <button
                key={m.key}
                className={`cart-mode-btn ${isActive ? 'active' : ''}`}
                onClick={() => handleOrderModeChange(m.key)}
                disabled={isDisabled}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable items */}
      <div className="cart-scroll">
        <AnimatePresence>
          {items.map((item, index) => {
            const tags = getCustomizationTags(item.customizations);
            return (
              <div
                key={`${item.menu_item_id}-${index}`}
                className="cart-item-card"
              >
                <div className="cart-item-thumb">
                  {item.image_url ? (
                    <img
                      src={cacheBust(item.image_url.startsWith('http') ? item.image_url : `https://admin.loyaltysystem.uk${item.image_url}`)}
                      alt={item.name}
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        img.style.display = 'none';
                      }}
                    />
                  ) : (
                    <Coffee size={22} style={{ color: '#384B16' }} />
                  )}
                </div>
                <div className="cart-item-details">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <h4 className="cart-item-name">{item.name}</h4>
                    <span className="cart-item-price">{formatPrice(item.price * item.quantity)}</span>
                  </div>
                  {tags.length > 0 && (
                    <div className="cart-custom-tags">
                      {tags.map((tag, i) => (
                        <span key={i} className="cart-custom-tag">{tag}</span>
                      ))}
                      <button className="cart-edit-btn">
                        <Pen size={12} /> Edit
                      </button>
                    </div>
                  )}
                  <div className="cart-qty-control">
                    <button
                      className="cart-qty-btn"
                      onClick={() => updateQuantity(index, item.quantity - 1)}
                      aria-label={`Decrease ${item.name} quantity`}
                    >
                      <Minus size={13} />
                    </button>
                    <span className="cart-qty-value">{item.quantity}</span>
                    <button
                      className="cart-qty-btn"
                      onClick={() => updateQuantity(index, item.quantity + 1)}
                      aria-label={`Increase ${item.name} quantity`}
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>
                <button
                  className="cart-remove-btn"
                  onClick={() => updateQuantity(index, 0)}
                  aria-label={`Remove ${item.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </AnimatePresence>

        {/* Notes */}
        <div className="cart-notes-card">
          <div className="cart-notes-label">Order note (optional)</div>
          <textarea
            className="cart-notes-input"
            placeholder="Any special requests…"
            value={orderNote}
            onChange={(e) => setOrderNote(e.target.value)}
          />
        </div>

        {/* Summary */}
        <div className="cart-summary-card">
          <div className="cart-summary-row">
            <span>Subtotal</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          {deliveryFee > 0 && (
            <div className="cart-summary-row">
              <span>Delivery fee</span>
              <span>{formatPrice(deliveryFee)}</span>
            </div>
          )}
          <div className="cart-summary-row total">
            <span>Total</span>
            <span>{formatPrice(total)}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="cart-footer">
        {orderMode === 'delivery' && config.min_order_delivery > 0 && subtotal < config.min_order_delivery && (
          <div className="cart-delivery-min">
            <ShoppingBag size={16} style={{ color: '#7a4e18' }} />
            <span>Add {formatPrice(config.min_order_delivery - subtotal)} more for delivery</span>
          </div>
        )}
        {orderMode === 'dine_in' && !dineInSession ? (
          <button className="cart-scan-btn" onClick={handleScanQR}>
            <QrCode size={18} />
            Scan table QR to dine in
          </button>
        ) : (
          <button
            className="cart-checkout-btn"
            onClick={() => setPage('checkout')}
            disabled={belowDeliveryMinimum}
          >
            Proceed to Checkout
          </button>
        )}
      </div>

      {/* Clear Cart Confirmation Modal */}
      <Modal isOpen={showClearConfirm} onClose={() => setShowClearConfirm(false)} title="Clear Cart?" variant="center">
        <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
          <div style={{ width: 56, height: 56, borderRadius: 999, background: 'rgba(209,142,56,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <AlertTriangle size={28} style={{ color: '#D18E38' }} />
          </div>
          <p style={{ fontSize: 15, color: '#3A4A5A', marginBottom: 8 }}>
            This will remove <strong style={{ color: '#1B2023' }}>{itemCount} item{itemCount !== 1 ? 's' : ''}</strong> from your cart.
          </p>
          <p style={{ fontSize: 13, color: '#6A7A8A' }}>This action cannot be undone.</p>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button
            className="cart-empty-btn"
            style={{ flex: 1, background: '#F5F7FA', color: '#1B2023' }}
            onClick={() => setShowClearConfirm(false)}
          >
            Keep Items
          </button>
          <button
            className="cart-empty-btn"
            style={{ flex: 1, background: '#DC2626' }}
            onClick={handleClearCart}
          >
            Clear Cart
          </button>
        </div>
      </Modal>
    </div>
  );
}
