'use client';

import { useMemo, useState } from 'react';
import { Plus, Check, Coffee, Sparkles } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { useCartStore } from '@/stores/cartStore';
import { useUIStore } from '@/stores/uiStore';
import { formatPrice, resolveAssetUrl, LOKA } from '@/lib/tokens';
import { eligibleAddonItems } from '@/lib/addonDeal';
import type { MenuItem, CartItem, BundleProduct } from '@/lib/api';

interface AddonDealShelfProps {
  menuItems: MenuItem[];
  cartItems: CartItem[];
  bundleProducts?: BundleProduct[];
}

export default function AddonDealShelf({ menuItems, cartItems, bundleProducts }: AddonDealShelfProps) {
  const { t } = useTranslation();
  const addItem = useCartStore((s) => s.addItem);
  const { selectedStore, showToast } = useUIStore();
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());

  const suggestions = useMemo(
    () => eligibleAddonItems(menuItems, cartItems, bundleProducts),
    [menuItems, cartItems, bundleProducts],
  );

  const handleAdd = (item: MenuItem) => {
    addItem({
      menu_item_id: item.id,
      name: item.item_name,
      price: item.base_price,
      base_price: item.base_price,
      quantity: 1,
      customizations: {},
      store_id: selectedStore?.id,
      customization_count: item.modifier_groups?.length ?? 0,
    });
    setAddedIds((prev) => new Set(prev).add(item.id));
    showToast(t('menu.addonAdded', { name: item.item_name }), 'success');
  };

  if (suggestions.length === 0) return null;

  return (
    <div className="ads-shelf">
      <div className="ads-shelf-header">
        <Sparkles size={14} color={LOKA.gold} />
        <span className="ads-shelf-title">{t('cart.addonShelfTitle')}</span>
      </div>
      <div className="ads-shelf-scroll">
        {suggestions.map(({ item, preview }) => {
          const isAdded = addedIds.has(item.id);
          const imgSrc = resolveAssetUrl(item.image_url);
          return (
            <div key={item.id} className="ads-shelf-card">
              <div className="ads-shelf-img">
                {imgSrc ? (
                  <img src={imgSrc} alt={item.item_name} loading="lazy" />
                ) : (
                  <Coffee size={16} color={LOKA.border} />
                )}
              </div>
              <div className="ads-shelf-info">
                <div className="ads-shelf-name">{item.item_name}</div>
                <div className="ads-shelf-price-row">
                  <span className="ads-shelf-price-new">{formatPrice(preview.discountedUnitPrice)}</span>
                  <span className="ads-shelf-price-old">{formatPrice(preview.unitPrice)}</span>
                </div>
              </div>
              <button
                className={`ads-shelf-add-btn ${isAdded ? 'added' : ''}`}
                onClick={() => !isAdded && handleAdd(item)}
                disabled={isAdded}
                aria-label={t('common.add') + ' ' + item.item_name}
              >
                {isAdded ? <Check size={14} /> : <Plus size={14} />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
