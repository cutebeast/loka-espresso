'use client';

import { useCallback, useEffect, useState } from 'react';
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
  Sparkles,
  Package,
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { useCartStore } from '@/stores/cartStore';
import { useUIStore } from '@/stores/uiStore';
import { useConfigStore } from '@/stores/configStore';
import { useWalletStore } from '@/stores/walletStore';
import { formatPrice, resolveAssetUrl, LOKA } from '@/lib/tokens';
import api from '@/lib/api';
import type { MenuItem, CustomizationOption as ApiCustomOption } from '@/lib/api';
import { deriveCustomizationOptions } from '@/lib/storeHelpers';
import ItemCustomizeSheet from '@/components/menu/ItemCustomizeSheet';
import AddonDealShelf from '@/components/menu/AddonDealShelf';

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
  const { orderMode, setOrderMode, selectedStore, dineInSession, setDineInSession, setPage, showToast, setShowStorePicker, setCheckoutDraft, isGuest, triggerSignIn, menuItems } = useUIStore();
  const { config } = useConfigStore();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [editingItem, setEditingItem] = useState<number | null>(null); // cart item index
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [editOptions, setEditOptions] = useState<ApiCustomOption[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
  const subtotal = getTotal();
  const deliveryFee = orderMode === 'delivery' ? config.delivery_fee : 0;
  const total = subtotal + deliveryFee;
  const itemCount = getItemCount();
  const belowDeliveryMinimum = orderMode === 'delivery' && config.min_order_delivery > 0 && subtotal < config.min_order_delivery;

  // "You'll earn" estimate — mirrors the backend order-creation math
  // (floor(items subtotal × loyalty.points_per_currency[default 1]) × tier
  // multiplier; birthday-month/BYOT bonuses can only add more, hence "~").
  const tiers = useConfigStore(s => s.tiers);
  const tier = useWalletStore(s => s.tier);
  const earnMultiplier = (() => {
    const cur = tiers.find(x => x.name.toLowerCase() === (tier || '').toLowerCase());
    const m = cur ? Number(cur.points_multiplier) : 1;
    return Number.isFinite(m) && m > 0 ? m : 1;
  })();
  const earnEstimate = !isGuest && subtotal > 0 ? Math.floor(subtotal * earnMultiplier) : 0;

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
      // Use the FULL menu item (variants included) so the edit sheet renders
      // the variant picker and prices options against the real base price.
      // v3: customization options are included in the menu item response
      // via the /menu/stores/{store_id} endpoint. Try the dedicated endpoint first,
      // but fall back to using the menu items already loaded.
      let fullItem: MenuItem | undefined;
      try {
        const res = await api.get(`/menu/items/${item.menu_item_id}`);
        fullItem = res.data as MenuItem | undefined;
        setEditOptions(fullItem ? deriveCustomizationOptions(fullItem) : []);
      } catch {
        // Fallback: use menu items already in state
        const { menuItems } = useUIStore.getState();
        fullItem = menuItems.find((mi: MenuItem) => mi.id === item.menu_item_id);
        setEditOptions(fullItem ? deriveCustomizationOptions(fullItem) : []);
      }
      setEditItem(fullItem ?? ({ id: item.menu_item_id, item_name: item.name, base_price: item.base_price ?? item.price, category_id: 0 } as unknown as MenuItem));
      setEditingItem(index);
    } catch { showToast(t('toast.genericError'), 'error'); }
    finally { setEditLoading(false); }
  };

  const handleCustomizeConfirm = (_item: MenuItem, quantity: number, customizations: { id: number; name: string; price_adjustment: number }[], totalPrice: number, variant?: { id: number; variant_name: string; price_adjustment: number } | null, _session?: unknown, notes?: string) => {
    if (editingItem === null) return;
    updateItem(editingItem, {
      quantity,
      price: totalPrice,
      base_price: (items[editingItem]?.base_price ?? items[editingItem]?.price),
      // Keep the line's identity in sync with the edited selection — a stale
      // variant_id would make the server charge a different price than shown.
      name: variant ? `${_item.item_name} (${variant.variant_name})` : _item.item_name,
      variant_id: variant?.id,
      variant_name: variant?.variant_name,
      customizations: {
        options: customizations.map(o => ({ id: o.id, name: o.name, price_adjustment: o.price_adjustment })),
        ...(notes ? { note: notes } : {}),
      },
      customization_option_ids: customizations.map(o => o.id),
      customization_count: customizations.length,
    });
    setEditingItem(null);
    setEditItem(null);
    setEditOptions([]);
  };

  const handleScanQR = useCallback(() => {
    const event = new CustomEvent('open-qr-scanner');
    window.dispatchEvent(event);
  }, []);

  // Bundle display: group component lines by bundle_product_id and fetch the
  // bundle's display info (image + title) for the group header box.
  const [bundleInfo, setBundleInfo] = useState<Record<number, { title: string; image_url: string | null }>>({});
  useEffect(() => {
    const ids = new Set(items.map(i => i.bundle_product_id).filter((x): x is number => typeof x === 'number'));
    if (ids.size === 0) { setBundleInfo({}); return; }
    api.get('/menu/bundle-products', { params: selectedStore?.id ? { store_id: selectedStore.id } : undefined })
      .then(res => {
        const list = Array.isArray(res.data) ? res.data : [];
        const map: Record<number, { title: string; image_url: string | null }> = {};
        for (const bp of list) {
          if (ids.has(bp.id)) map[bp.id] = { title: bp.title, image_url: bp.image_url ?? null };
        }
        setBundleInfo(map);
      })
      .catch(() => { /* header falls back to the line's bundle_name */ });
  }, [items, selectedStore?.id]);

  const cartGroups = (() => {
    const groups: { bundleId: number | null; lines: { item: typeof items[number]; index: number }[] }[] = [];
    const seen = new Map<number, number>();
    items.forEach((item, index) => {
      const bid = typeof item.bundle_product_id === 'number' ? item.bundle_product_id : null;
      if (bid === null) { groups.push({ bundleId: null, lines: [{ item, index }] }); return; }
      const gi = seen.get(bid);
      if (gi !== undefined && groups[gi]) groups[gi]!.lines.push({ item, index });
      else { seen.set(bid, groups.length); groups.push({ bundleId: bid, lines: [{ item, index }] }); }
    });
    return groups;
  })();

  const renderCartLine = (item: (typeof items)[number], index: number) => {
    const tags = getCustomizationTags(item.customizations);
    return (
      <div
        key={`${item.menu_item_id}-${index}-${JSON.stringify([...(item.customization_option_ids ?? [])].sort())}`}
        className="cart-item-card"
      >
        <div className="cart-item-thumb">
          {item.image_url && !brokenImages.has(`${item.menu_item_id}-${item.customization_option_ids?.join(',') || '0'}`) ? (
            <img
              src={resolveAssetUrl(item.image_url) || ''}
              alt={item.name}
              loading="lazy"
              onError={() => {
                setBrokenImages(prev => new Set(prev).add(`${item.menu_item_id}-${item.customization_option_ids?.join(',') || '0'}`));
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
            <button className="cart-edit-btn" onClick={() => openCustomize(index)}>
              <Sliders size={12} /> {t('cart.addons')}
            </button>
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
  };

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
              <p className="cart-context-title">{selectedStore?.store_name || t('cart.selectStore')}</p>
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
        {/* Add-on deal suggestions (shown when a bundle is in cart) */}
        <AddonDealShelf menuItems={menuItems} cartItems={items} />

        <AnimatePresence>
          {cartGroups.map(group => {
            const first = group.lines[0];
            if (!first) return null;
            if (group.bundleId === null) {
              return renderCartLine(first.item, first.index);
            }
            const info = bundleInfo[group.bundleId];
            const title = info?.title || first.item.bundle_name || '';
            const imgSrc = info?.image_url ? resolveAssetUrl(info.image_url) : null;
            return (
              <div className="cart-bundle-box" key={`bundle-${group.bundleId}`}>
                <div className="cart-bundle-header">
                  {imgSrc ? (
                    <img src={imgSrc} alt={title} className="cart-bundle-thumb" loading="lazy" />
                  ) : (
                    <div className="cart-bundle-thumb cart-bundle-thumb-fallback">
                      <Package size={18} color={LOKA.primary} />
                    </div>
                  )}
                  <div className="cart-bundle-title">{title}</div>
                  <div className="cart-bundle-count">{t('cart.bundleItems', { count: group.lines.length })}</div>
                </div>
                {group.lines.map(({ item, index }) => renderCartLine(item, index))}
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

        {/* Points earn preview (estimate — credited on payment capture) */}
        {earnEstimate > 0 && (
          <div className="cart-earn-banner">
            <Sparkles size={15} />
            <span>{t('cart.earnBanner', { points: earnEstimate.toLocaleString() })}</span>
          </div>
        )}
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
        <div className="profile-modal-box" role="dialog" aria-modal="true" aria-labelledby="clear-cart-title">
          <h3 id="clear-cart-title">{t('cart.clearConfirm')}</h3>
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
          initialVariantId={editingItem !== null ? (items[editingItem]?.variant_id ?? null) : null}
          initialNote={editingItem !== null ? ((items[editingItem]?.customizations as CustomizationStructure | undefined)?.note ?? '') : ''}
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
