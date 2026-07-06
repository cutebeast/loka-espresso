'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Minus, Check, Coffee } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { useCartStore } from '@/stores/cartStore';
import { useUIStore } from '@/stores/uiStore';
import { formatPrice, resolveAssetUrl, LOKA } from '@/lib/tokens';
import type { BundleProduct } from '@/lib/api';
interface BundlePickerSheetProps {
  bundle: BundleProduct;
  onClose: () => void;
  onDone: (bundle: BundleProduct) => void;
}
export default function BundlePickerSheet({
  bundle,
  onClose,
  onDone
}: BundlePickerSheetProps) {
  const {
    t
  } = useTranslation();
  const addItem = useCartStore(s => s.addItem);
  const {
    selectedStore,
    showToast
  } = useUIStore();
  const pickCount = bundle.pick_count ?? 0;
  const allowDuplicates = bundle.allow_duplicates ?? false;
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const poolItems = useMemo(() => {
    return (bundle.components || []).map(comp => ({
      componentId: comp.id,
      menu_item_id: comp.menu_item_id,
      name: comp.menu_item_name || `Item #${comp.menu_item_id}`,
      price: comp.menu_item_price ?? 0,
      image_url: comp.menu_item_image_url || null
    }));
  }, [bundle.components]);
  const totalSelected = allowDuplicates ? Object.values(quantities).reduce((sum, q) => sum + q, 0) : selectedIds.size;
  const canAdd = totalSelected === pickCount;
  const toggleItem = (item: typeof poolItems[number]) => {
    if (allowDuplicates) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(item.componentId)) {
        next.delete(item.componentId);
      } else if (next.size < pickCount) {
        next.add(item.componentId);
      }
      return next;
    });
  };
  const incQty = (componentId: number) => {
    if (!allowDuplicates) return;
    setQuantities(prev => {
      const cur = prev[componentId] || 0;
      if (totalSelected >= pickCount) return prev;
      return {
        ...prev,
        [componentId]: cur + 1
      };
    });
  };
  const decQty = (componentId: number) => {
    if (!allowDuplicates) return;
    setQuantities(prev => {
      const cur = prev[componentId] || 0;
      if (cur <= 0) return prev;
      const next = {
        ...prev,
        [componentId]: cur - 1
      };
      if (next[componentId] === 0) delete next[componentId];
      return next;
    });
  };
  const handleAddToCart = () => {
    if (!canAdd) return;
    if (allowDuplicates) {
      for (const [componentIdStr, qty] of Object.entries(quantities)) {
        const componentId = Number(componentIdStr);
        if (qty <= 0) continue;
        const item = poolItems.find(p => p.componentId === componentId);
        if (!item) continue;
        addItem({
          menu_item_id: item.menu_item_id,
          name: item.name,
          price: item.price,
          base_price: item.price,
          quantity: qty,
          customizations: {},
          store_id: selectedStore?.id,
          customization_count: 0,
          bundle_product_id: bundle.id,
          bundle_component_id: item.componentId
        });
      }
    } else {
      for (const componentId of selectedIds) {
        const item = poolItems.find(p => p.componentId === componentId);
        if (!item) continue;
        addItem({
          menu_item_id: item.menu_item_id,
          name: item.name,
          price: item.price,
          base_price: item.price,
          quantity: 1,
          customizations: {},
          store_id: selectedStore?.id,
          customization_count: 0,
          bundle_product_id: bundle.id,
          bundle_component_id: item.componentId
        });
      }
    }
    showToast(t('menu.addedToCartToast'), 'success');
    onDone(bundle);
  };
  const progressPct = pickCount > 0 ? Math.round(totalSelected / pickCount * 100) : 0;
  const isItemSelected = (componentId: number) => {
    if (allowDuplicates) return (quantities[componentId] || 0) > 0;
    return selectedIds.has(componentId);
  };
  const isSelectable = (componentId: number) => {
    if (allowDuplicates) return totalSelected < pickCount;
    if (selectedIds.has(componentId)) return true;
    return selectedIds.size < pickCount;
  };
  return <AnimatePresence>
      <motion.div className="bps-overlay" initial={{
      opacity: 0
    }} animate={{
      opacity: 1
    }} exit={{
      opacity: 0
    }} onClick={e => {
      if (e.target === e.currentTarget) onClose();
    }} role="dialog" aria-modal="true" aria-labelledby="bps-title">
        <motion.div className="bps-sheet" initial={{
        y: '100%'
      }} animate={{
        y: 0
      }} exit={{
        y: '100%'
      }} transition={{
        type: 'spring',
        damping: 30,
        stiffness: 300
      }}>
          <div className="bps-handle-wrap">
            <div className="bps-handle" />
          </div>

          {bundle.image_url && <div className="bps-header-img">
              <img src={resolveAssetUrl(bundle.image_url) || ''} alt={bundle.title} />
            </div>}

          <div className="bps-header">
            <div className="bps-header-text">
              <h3 id="bps-title" className="bps-title">{bundle.title}</h3>
              <p className="bps-subtitle">{t('menu.pickXSubtitle', {
                count: pickCount
              })}</p>
            </div>
            <button className="bps-close-btn" onClick={onClose} aria-label={t('common.close')}>
              <X size={20} />
            </button>
          </div>

          <div className="bps-progress-bar">
            <div className="bps-progress-fill" style={{
            width: `${progressPct}%`
          }} />
          </div>
          <div className="bps-counter">
            {t('menu.pickXSelected', {
            selected: totalSelected,
            count: pickCount
          })}
          </div>

          {!allowDuplicates && selectedIds.size >= pickCount && <p style={{
          textAlign: 'center',
          fontSize: 12,
          color: 'var(--color-warning)',
          margin: '0 0 8px'
        }}>
              {t('menu.pickXMaxReached')}
            </p>}

          <div className="bps-scroll">
            <div className="bps-grid">
              {poolItems.map(item => {
              const {
                t
              } = useTranslation();
              const imgSrc = resolveAssetUrl(item.image_url);
              const selected = isItemSelected(item.componentId);
              const selectable = isSelectable(item.componentId);
              const qty = quantities[item.componentId] || 0;
              return <div key={item.componentId} className={`bps-item-card ${selected ? 'bps-selected' : ''} ${!selectable && !selected ? 'bps-dimmed' : ''}`} onClick={() => toggleItem(item)} onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleItem(item);
                }
              }} role="button" tabIndex={0} aria-pressed={selected}>
                    <div className="bps-item-img">
                      {imgSrc ? <img src={imgSrc} alt={item.name} loading="lazy" /> : <Coffee size={20} color={LOKA.border} />}
                      {selected && !allowDuplicates && <div className="bps-check-badge">
                          <Check size={12} />
                        </div>}
                    </div>
                    <div className="bps-item-info">
                      <div className="bps-item-name">{item.name}</div>
                      <div className="bps-item-price">{formatPrice(item.price)}</div>
                    </div>

                    {allowDuplicates && <div className="bps-qty-controls" onClick={e => e.stopPropagation()}>
                        <button className="bps-qty-btn" disabled={qty <= 0} onClick={() => decQty(item.componentId)} aria-label={t("menu.bundle_picker_sheet.decrease_quantity")}>
                          <Minus size={14} />
                        </button>
                        <span className="bps-qty-display">{qty}</span>
                        <button className="bps-qty-btn" disabled={totalSelected >= pickCount} onClick={() => incQty(item.componentId)} aria-label={t("menu.bundle_picker_sheet.increase_quantity")}>
                          <Plus size={14} />
                        </button>
                      </div>}
                  </div>;
            })}
            </div>
          </div>

          <div className="bps-footer">
            <div className="bps-footer-price">
              <span className="bps-footer-label">{bundle.title}</span>
              <span className="bps-footer-amount">{formatPrice(bundle.bundle_price)}</span>
            </div>
            <button className={`bps-add-btn ${canAdd ? '' : 'bps-add-btn-disabled'}`} disabled={!canAdd} onClick={handleAddToCart}>
              {canAdd ? t('menu.pickXAddToCart') : t('menu.pickXMinRequired', {
              count: pickCount
            })}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>;
}