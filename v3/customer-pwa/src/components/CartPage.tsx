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
  Trash2,
  Sliders,
  Utensils,
  Store,
  MapPin,
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { useCartStore } from '@/stores/cartStore';
import { useUIStore } from '@/stores/uiStore';
import { useConfigStore } from '@/stores/configStore';
import { formatPrice, resolveAssetUrl, LOKA } from '@/lib/tokens';
import api from '@/lib/api';
import type { MenuItem, CustomizationOption as ApiCustomOption } from '@/lib/api';
import ItemCustomizeSheet from '@/components/menu/ItemCustomizeSheet';

interface CustomizationStructure {
  options?: Array<{ id: number; name: string; option_type: string; price_adjustment: number }>;
  note?: string;
}

function getCustomizationTags(customizations: Record<string, unknown> | undefined): string[] {
  if (!customizations || typeof customizations !== 'object') return [];
  const cust = customizations as CustomizationStructure;
  const tags: string[] = [];
  if (cust.options && Array.isArray(cust.options) && cust.options.length > 0) {
    tags.push(...cust.options.map(o => {
      // Strip type prefix like "Sugar Level: No Sugar" → "No Sugar"
      const name = o.name || '';
      const colonIdx = name.indexOf(': ');
      return colonIdx >= 0 ? name.slice(colonIdx + 2) : name;
    }));
  }
  if (cust.note) tags.push(cust.note);
  return tags;
}

const ORDER_MODES = [
  { key: 'pickup' as const, labelKey: 'cart.mode.pickup' },
  { key: 'delivery' as const, labelKey: 'cart.mode.delivery' },
  { key: 'dine_in' as const, labelKey: 'cart.mode.dineIn' },
];

export default function CartPage() {
  const { t } = useTranslation();
  const { items, updateQuantity, updateItem, getTotal, getItemCount, clearCart, orderNote, setOrderNote } = useCartStore();
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
      setEditItem({ id: item.menu_item_id, name: item.name, base_price: item.base_price ?? item.price, category_id: 0 } as MenuItem);
      setEditingItem(index);
    } catch { showToast(t('toast.genericError'), 'error'); }
    finally { setEditLoading(false); }
  };

  const handleCustomizeConfirm = (item: MenuItem, quantity: number, customizations: { id: number; name: string; price_adjustment: number }[], totalPrice: number) => {
    if (editingItem === null) return;
    updateItem(editingItem, {
      quantity,
      price: totalPrice,
      base_price: (items[editingItem]?.base_price ?? items[editingItem]?.price),
      customizations: { options: customizations.map(o => ({ id: o.id, name: o.name, price_adjustment: o.price_adjustment })) },
      customization_option_ids: customizations.map(o => o.id),
    });
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
          <ShoppingBag size={32} color={LOKA.primary} />
        </div>
        <p className="cart-empty-title">{t('cart.emptyTitle')}</p>
        <p className="cart-empty-text">{t('cart.emptySubtitle')}</p>
        <button className="cart-empty-btn" onClick={() => setPage('menu')}>
          {t('cart.browseMenu')} <ArrowRight size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="cart-screen">
      {/* Header */}
      <div className="cart-header">
        <button className="cart-back-btn" onClick={() => setPage('menu')} aria-label={t('common.back')}>
          <ArrowLeft size={20} />
        </button>
        <h3 className="cart-header-title">{t('cart.title')} <span className="cart-header-count">({t('cart.itemCount', { count: itemCount })})</span></h3>
        <button className="cart-header-clear" onClick={() => setShowClearConfirm(true)}>
          {t('cart.clear')}
        </button>
      </div>

      {/* Context card (store / dine-in info) */}
      <div className="cart-context-wrapper">
        {orderMode === 'dine_in' && dineInSession ? (
          <div className="cart-context-card dinein">
            <div className="cart-context-icon copper">
              <span className="cart-emoji"><Utensils size={16} /></span>
            </div>
            <div className="cart-context-text">
              <p className="cart-context-title">{t('cart.tableInfo', { tableNumber: dineInSession.tableNumber, storeName: dineInSession.storeName })}</p>
              <p className="cart-context-sub">{t('cart.mode.dineIn')}</p>
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
              <span className="cart-emoji"><Store size={16} /></span>
            </div>
            <div className="cart-context-text">
              <p className="cart-context-title">{selectedStore?.name || t('cart.selectStore')}</p>
              <p className="cart-context-sub">{orderMode === 'pickup' ? t('cart.mode.pickup') : t('cart.mode.delivery')}</p>
            </div>
            <button
              className="cart-context-action copper"
              onClick={() => setShowStorePicker(true)}
            >
              <MapPin size={14} /> {t('cart.selectStoreBtn')}
            </button>
          </div>
        )}
      </div>

      {/* Order mode pills */}
      <div className="cart-mode-wrapper">
        <div className="cart-mode-bar">
          {ORDER_MODES.map((m) => {
            const isActive = orderMode === m.key;
            const isDineInDisabled = m.key === 'dine_in' && !dineInSession;
            const label = t(`cart.mode.${m.key === 'dine_in' ? 'dineIn' : m.key}`);
            return (
              <button
                key={m.key}
                className={`cart-mode-btn ${isActive ? 'active' : ''} ${isDineInDisabled ? 'disabled' : ''}`}
                  onClick={() => {
                    if (isDineInDisabled) {
                      showToast(t('toast.dineInUnavailable'), 'info', t('toast.dineInUnavailableTitle'));
                      return;
                    }
                    if (dineInSession && m.key !== 'dine_in') {
                      showToast(t('toast.finishDineInFirst'), 'info');
                      return;
                    }
                    handleOrderModeChange(m.key);
                }}
                title={isDineInDisabled ? t('cart.scanTable') : undefined}
              >
                {isDineInDisabled && <QrCode size={14} className="mr-1" />}
                {label}
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
                      loading="lazy"
                      onError={() => {
                        setBrokenImages(prev => new Set(prev).add(item.menu_item_id));
                      }}
                    />
                  ) : (
                    <Coffee size={22} color={LOKA.primary} />
                  )}
                </div>
                <div className="cart-item-details">
                  <div className="cart-item-header">
                    <div className="cart-item-title-group">
                      <h4 className="cart-item-name">{item.name}</h4>
                    </div>
                    <div className="cart-item-price-group">
                      <div className="cart-item-price">{formatPrice(item.price * item.quantity)}</div>
                      {item.quantity > 1 && (
                        <div className="cart-item-unit-price">{formatPrice(item.price)} × {item.quantity}</div>
                      )}
                    </div>
                  </div>
                  {tags.length > 0 && (
                    <div className="cart-custom-tags">
                      {tags.map((tag, i) => (
                        <span key={i} className="cart-custom-tag">{tag}</span>
                      ))}
                    </div>
                  )}
                  <div className="cart-item-row">
                    {(item.customization_count ?? 0) > 0 ? (
                      <button className="cart-edit-btn" onClick={() => openCustomize(index)}>
                        <Sliders size={12} /> {t('cart.addons')}
                      </button>
                    ) : <span />}
                    <button
                      className="cart-remove-btn"
                      onClick={() => updateQuantity(index, 0)}
                      aria-label={t('common.remove') + ' ' + item.name}
                    >
                      <Trash2 size={12} /> {t('common.remove')}
                    </button>
                  </div>
                  <div className="cart-item-row">
                    <div className="cart-qty-control">
                      <button
                        className="cart-qty-btn"
                        onClick={() => updateQuantity(index, item.quantity - 1)}
                      >
                        <Minus size={13} />
                      </button>
                      <span className="cart-qty-value">{item.quantity}</span>
                      <button
                        className="cart-qty-btn"
                        onClick={() => updateQuantity(index, item.quantity + 1)}
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
          <div className="cart-notes-label">{t('cart.orderNote') + ' ' + t('common.optionalLower')}</div>
          <textarea
            className="cart-notes-input"
            placeholder={t('cart.orderNotePlaceholder')}
            value={orderNote}
            onChange={(e) => setOrderNote(e.target.value)}
          />
        </div>

        {/* Summary */}
        <div className="cart-summary-card">
          <div className="cart-summary-row">
            <span>{t('cart.subtotal') + ' (' + t('cart.itemCount', { count: itemCount }) + ')'}</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          {orderMode === 'delivery' && (deliveryFee > 0 ? (
            <div className="cart-summary-row">
              <span>{t('cart.deliveryFee')}</span>
              <span>{formatPrice(deliveryFee)}</span>
            </div>
          ) : (
            <div className="cart-summary-row">
              <span>{t('cart.deliveryFee')}</span>
              <span className="cart-delivery-free">{t('cart.free')}</span>
            </div>
          ))}
          <div className="cart-summary-row total">
            <span>{t('cart.total')}</span>
            <span>{formatPrice(total)}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="cart-footer">
        {orderMode === 'delivery' && config.min_order_delivery > 0 && subtotal < config.min_order_delivery && (
          <div className="cart-delivery-min">
            <ShoppingBag size={16} color={LOKA.brown} />
            <span>{t('cart.deliveryMin', { amount: formatPrice(config.min_order_delivery - subtotal) })}</span>
          </div>
        )}
        {orderMode === 'dine_in' && !dineInSession ? (
          <button className="cart-scan-btn" onClick={handleScanQR}>
            <QrCode size={18} />
            {t('cart.scanTable')}
          </button>
        ) : (
          <button
            className="cart-checkout-btn"
            onClick={() => {
              if (isGuest) {
                triggerSignIn();
                return;
              }
              if ((orderMode === 'delivery' || orderMode === 'pickup') && !selectedStore) {
                setShowStorePicker(true);
                return;
              }
              setCheckoutDraft({ notes: orderNote });
              setPage('checkout');
            }}
            disabled={belowDeliveryMinimum}
          >
            <span>{t('cart.checkout')}</span>
            <span className="cart-checkout-price">{formatPrice(total)}</span>
          </button>
        )}
      </div>

      {/* Clear Cart Confirmation Modal */}
      <div className={`profile-modal-overlay ${showClearConfirm ? 'show' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) setShowClearConfirm(false); }}>
        <div className="profile-modal-box">
          <h3>{t('cart.clearConfirm')}</h3>
          <p>{t('cart.removeConfirm', { count: itemCount })}</p>
          <div className="profile-modal-btns">
            <button className="profile-modal-btn profile-modal-btn-cancel" onClick={() => setShowClearConfirm(false)}>{t('cart.keepItems')}</button>
            <button className="profile-modal-btn profile-modal-btn-confirm" onClick={handleClearCart}>{t('cart.clearCart')}</button>
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
          initialSelections={
            editingItem !== null && items[editingItem]
              ? ((items[editingItem].customizations as CustomizationStructure)?.options || [])
              : []
          }
        />
      )}
    </div>
  );
}
