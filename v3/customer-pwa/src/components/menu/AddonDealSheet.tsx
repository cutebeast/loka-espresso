'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Check, Coffee, Sparkles } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { useCartStore } from '@/stores/cartStore';
import { useUIStore } from '@/stores/uiStore';
import { formatPrice, resolveAssetUrl, LOKA } from '@/lib/tokens';
import { eligibleAddonsForBundle } from '@/lib/addonDeal';
import type { MenuItem, BundleProduct } from '@/lib/api';

interface AddonDealSheetProps {
  bundle: BundleProduct | null;
  menuItems: MenuItem[];
  onClose: () => void;
}

export default function AddonDealSheet({ bundle, menuItems, onClose }: AddonDealSheetProps) {
  const { t } = useTranslation();
  const addItem = useCartStore((s) => s.addItem);
  const { selectedStore, showToast, setPage } = useUIStore();
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());

  const addons = useMemo(() => {
    if (!bundle) return [];
    return eligibleAddonsForBundle(menuItems, bundle.id);
  }, [bundle, menuItems]);

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

  const viewCart = () => {
    onClose();
    setPage('cart');
  };

  return (
    <AnimatePresence>
      {bundle && addons.length > 0 && (
        <motion.div
          className="ads-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ads-title"
        >
          <motion.div
            className="ads-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="ads-handle-wrap">
              <div className="ads-handle" />
            </div>

            <div className="ads-header">
              <div className="ads-header-text">
                <div className="ads-header-icon">
                  <Sparkles size={16} color={LOKA.gold} />
                </div>
                <div>
                  <h3 id="ads-title" className="ads-title">{t('menu.addonSuggested')}</h3>
                  <p className="ads-subtitle">{t('menu.addonSuggestedSub', { bundle: bundle.title })}</p>
                </div>
              </div>
              <button className="ads-close-btn" onClick={onClose} aria-label={t('common.close')}>
                <X size={20} />
              </button>
            </div>

            <div className="ads-scroll">
              {addons.map(({ item, preview }) => {
                const isAdded = addedIds.has(item.id);
                const imgSrc = resolveAssetUrl(item.image_url);
                return (
                  <div key={item.id} className="ads-item-card">
                    <div className="ads-item-img">
                      {imgSrc ? (
                        <img src={imgSrc} alt={item.item_name} loading="lazy" />
                      ) : (
                        <Coffee size={20} color={LOKA.border} />
                      )}
                    </div>
                    <div className="ads-item-info">
                      <div className="ads-item-name">{item.item_name}</div>
                      {item.description && (
                        <div className="ads-item-desc">{item.description}</div>
                      )}
                      <div className="ads-price-row">
                        <span className="ads-price-old">{formatPrice(preview.unitPrice)}</span>
                        <span className="ads-price-new">{formatPrice(preview.discountedUnitPrice)}</span>
                        <span className="ads-save-badge">
                          {t('menu.addonSave', { amount: formatPrice(preview.savingsPerUnit) })}
                        </span>
                      </div>
                    </div>
                    <button
                      className={`ads-add-btn ${isAdded ? 'added' : ''}`}
                      onClick={() => !isAdded && handleAdd(item)}
                      disabled={isAdded}
                    >
                      {isAdded ? <Check size={16} /> : <Plus size={16} />}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="ads-footer">
              <button className="ads-skip-btn" onClick={onClose}>
                {t('menu.addonMaybeLater')}
              </button>
              <button className="ads-cart-btn" onClick={viewCart}>
                {t('menu.addonViewCart')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
