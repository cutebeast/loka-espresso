'use client';

import { useCallback, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  ShoppingBag,
  Minus,
  Plus,
  ArrowRight,
  ArrowLeft,
  Coffee,
  QrCode,
  X,
  Pen,
  Trash2,
  Sliders,
} from 'lucide-react';
import { useCartStore } from '@/stores/cartStore';
import { useUIStore } from '@/stores/uiStore';
import { useConfigStore } from '@/stores/configStore';

import { formatPrice, resolveAssetUrl } from '@/lib/tokens';
import api from '@/lib/api';
import type { MenuItem, CustomizationOption as ApiCustomOption } from '@/lib/api';
import ItemCustomizeSheet from '@/components/menu/ItemCustomizeSheet';

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
  const { items, updateQuantity, getTotal, getItemCount, clearCart, orderNote, setOrderNote } = useCartStore();
  const { orderMode, setOrderMode, selectedStore, dineInSession, setDineInSession, setPage, showToast, setShowStorePicker, setCheckoutDraft, isGuest, triggerSignIn } = useUIStore();
  const { config } = useConfigStore();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [editingItem, setEditingItem] = useState<number | null>(null); // cart item index
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [editOptions, setEditOptions] = useState<ApiCustomOption[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [brokenImages, setBrokenImages] = useState<Set<number>>(new Set());

  const subtotal = getTotal();
  const deliveryFee = orderMode === 'delivery' ? config.delivery_fee : 0;
  const total = subtotal + deliveryFee;
  const itemCount = getItemCount();
  const belowDeliveryMinimum = orderMode === 'delivery' && config.min_order_delivery > 0 && subtotal < config.min_order_delivery;

  const handleClearCart = () => {
    clearCart();
    setShowClearConfirm(false);
  };

  const handleOrderModeChange = (mode: 'pickup' | 'delivery' | 'dine_in') => {
    setOrderMode(mode);
    if (mode !== 'dine_in') setDineInSession(null);
  };

  const openCustomize = async (index: number) => {
    const item = items[index];
    if (!item) return;
    try {
      setEditLoading(true);
      const res = await api.get(`/menu/items/${item.menu_item_id}/customizations`);
      const options = Array.isArray(res.data) ? res.data : [];
      setEditOptions(options);
      setEditItem({ id: item.menu_item_id, name: item.name, base_price: item.price, category_id: 0 } as MenuItem);
      setEditingItem(index);
    } catch { /* ignore */ }
    finally { setEditLoading(false); }
  };

  const handleCustomizeConfirm = (item: MenuItem, quantity: number, customizations: { id: number; name: string; price_adjustment: number }[], totalPrice: number) => {
    if (editingItem === null) return;
    updateQuantity(editingItem, quantity);
    // Update the item price with customizations
    const currentItem = items[editingItem];
    if (currentItem) {
      currentItem.price = totalPrice;
      currentItem.customizations = { options: customizations.map(o => ({ id: o.id, name: o.name, price_adjustment: o.price_adjustment })) };
      currentItem.customization_option_ids = customizations.map(o => o.id);
    }
    setEditingItem(null);
    setEditItem(null);
    setEditOptions([]);
  };

  const handleScanQR = useCallback(() => {
    const event = new CustomEvent('open-qr-scanner');
    window.dispatchEvent(event);
  }, []);

  if (items.length === 0) {
    return (
      <div className="cart-empty">
        <div className="cart-empty-icon">
          <ShoppingBag size={32} color="#384B16" className="co-wallet-icon" />
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
        <button className="cart-back-btn" onClick={() => setPage('menu')} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <h3 className="cart-header-title">Your Cart</h3>
        <button className="cart-header-clear" onClick={() => setShowClearConfirm(true)}>
          Clear
        </button>
      </div>

      {/* Context card (store / dine-in info) */}
      <div className="cart-context-wrapper">
        {orderMode === 'dine_in' && dineInSession ? (
          <div className="cart-context-card dinein">
            <div className="cart-context-icon copper">
              <span className="cart-emoji">🍽️</span>
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
              <span className="cart-emoji">🏪</span>
            </div>
            <div className="cart-context-text">
              <p className="cart-context-title">{selectedStore?.name || 'Select a store'}</p>
              <p className="cart-context-sub">{orderMode === 'pickup' ? 'Pickup' : 'Delivery'}</p>
            </div>
            <button
              className="cart-context-action copper"
              onClick={() => setShowStorePicker(true)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> Select Store
            </button>
          </div>
        )}
      </div>

      {/* Order mode pills */}
      <div className="cart-mode-wrapper">
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
                title={isDisabled ? 'Scan table QR to enable' : undefined}
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
                  {item.image_url && !brokenImages.has(item.menu_item_id) ? (
                    <img
                      src={resolveAssetUrl(item.image_url) || ''}
                      alt={item.name}
                      onError={() => {
                        setBrokenImages(prev => new Set(prev).add(item.menu_item_id));
                      }}
                    />
                  ) : (
                    <Coffee size={22} color="#384B16" />
                  )}
                </div>
                <div className="cart-item-details">
                  <div className="cart-item-header">
                    <div className="cart-item-title-group">
                      <h4 className="cart-item-name">{item.name}</h4>
                      <span className="cart-item-price">{formatPrice(item.price * item.quantity)}</span>
                    </div>
                    <button
                      className="cart-remove-btn"
                      onClick={() => updateQuantity(index, 0)}
                      aria-label={`Remove ${item.name}`}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                  {tags.length > 0 && (
                    <div className="cart-custom-tags">
                      {tags.map((tag, i) => (
                        <span key={i} className="cart-custom-tag">{tag}</span>
                      ))}
                    </div>
                  )}
                  <div className="cart-item-row">
                    <button className="cart-edit-btn" onClick={() => openCustomize(index)}>
                      <Sliders size={12} /> Add-ons
                    </button>
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
                </div>
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
            <ShoppingBag size={16} color="#7a4e18" />
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
            onClick={() => {
              if (isGuest) {
                triggerSignIn();
                return;
              }
              setCheckoutDraft({ notes: orderNote });
              setPage('checkout');
            }}
            disabled={belowDeliveryMinimum}
          >
            Proceed to Checkout
          </button>
        )}
      </div>

      {/* Clear Cart Confirmation Modal */}
      <div className={`profile-modal-overlay ${showClearConfirm ? 'show' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) setShowClearConfirm(false); }}>
        <div className="profile-modal-box">
          <h3>Clear cart?</h3>
          <p>This will remove {itemCount} item{itemCount !== 1 ? 's' : ''} from your cart.</p>
          <div className="profile-modal-btns">
            <button className="profile-modal-btn profile-modal-btn-cancel" onClick={() => setShowClearConfirm(false)}>Keep Items</button>
            <button className="profile-modal-btn profile-modal-btn-confirm" onClick={handleClearCart}>Clear Cart</button>
          </div>
        </div>
      </div>

      {/* Customization Sheet */}
      {editItem && (
        <ItemCustomizeSheet
          item={editItem}
          isOpen={editingItem !== null}
          onClose={() => { setEditingItem(null); setEditItem(null); setEditOptions([]); }}
          onAdd={handleCustomizeConfirm}
          loadingOptions={editLoading}
          customizations={editOptions}
        />
      )}
    </div>
  );
}
