'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Coffee, ArrowRight } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { useCartStore } from '@/stores/cartStore';
import { useUIStore } from '@/stores/uiStore';
import { formatPrice, resolveAssetUrl, LOKA } from '@/lib/tokens';
import type { BundleProduct } from '@/lib/api';

interface MultiCourseBundleSheetProps {
  bundle: BundleProduct;
  onClose: () => void;
  onDone: (bundle: BundleProduct) => void;
}

export default function MultiCourseBundleSheet({ bundle, onClose, onDone }: MultiCourseBundleSheetProps) {
  const { t } = useTranslation();
  const addItem = useCartStore((s) => s.addItem);
  const { selectedStore, showToast } = useUIStore();
  const groups = bundle.groups || [];
  const [currentGroupIdx, setCurrentGroupIdx] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Record<number, Set<number>>>({});

  const currentGroup = groups[currentGroupIdx];
  const currentSelections = selectedIds[currentGroupIdx] || new Set<number>();
  const pickCount = currentGroup?.pick_count ?? 0;
  const maxPick = currentGroup?.max_pick ?? pickCount;
  const isLastGroup = currentGroupIdx >= groups.length - 1;

  const isGroupSatisfied = currentSelections.size >= pickCount;
  const canComplete = groups.every((_, gi) => {
    const sel = selectedIds[gi] || new Set<number>();
    return sel.size >= (groups[gi]?.pick_count ?? 0);
  });

  const poolItems = useMemo(() => {
    if (!currentGroup) return [];
    return (currentGroup.components || []).map((comp) => ({
      componentId: comp.id,
      menu_item_id: comp.menu_item_id,
      name: comp.menu_item_name || `Item #${comp.menu_item_id}`,
      price: comp.menu_item_price ?? 0,
      image_url: comp.menu_item_image_url || null,
    }));
  }, [currentGroup]);

  const toggleItem = (componentId: number) => {
    setSelectedIds((prev) => {
      const current = new Set(prev[currentGroupIdx] || []);
      if (current.has(componentId)) {
        current.delete(componentId);
      } else if (current.size < maxPick) {
        current.add(componentId);
      }
      return { ...prev, [currentGroupIdx]: current };
    });
  };

  const isSelected = (id: number) => currentSelections.has(id);
  const isSelectable = (id: number) => currentSelections.has(id) || currentSelections.size < maxPick;

  const nextGroup = () => {
    if (currentGroupIdx < groups.length - 1) {
      setCurrentGroupIdx(currentGroupIdx + 1);
    }
  };

  const handleAddToCart = () => {
    if (!canComplete) return;

    let totalExtraPrice = 0;
    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi];
      if (!group) continue;
      const sel = selectedIds[gi] || new Set<number>();
      const items = group.components || [];
      const selectedItems = items.filter((c) => sel.has(c.id));
      const withinPick = selectedItems.slice(0, group.pick_count);
      const extras = selectedItems.slice(group.pick_count);

      for (const comp of withinPick) {
        addItem({
          menu_item_id: comp.menu_item_id,
          name: comp.menu_item_name || `Item #${comp.menu_item_id}`,
          price: comp.menu_item_price ?? 0,
          base_price: comp.menu_item_price ?? 0,
          quantity: 1,
          customizations: {},
          store_id: selectedStore?.id,
          customization_count: 0,
          bundle_product_id: bundle.id,
          bundle_component_id: comp.id,
        });
      }

      for (const comp of extras) {
        totalExtraPrice += (comp.menu_item_price ?? 0);
        addItem({
          menu_item_id: comp.menu_item_id,
          name: comp.menu_item_name || `Item #${comp.menu_item_id}`,
          price: comp.menu_item_price ?? 0,
          base_price: comp.menu_item_price ?? 0,
          quantity: 1,
          customizations: {},
          store_id: selectedStore?.id,
          customization_count: 0,
          bundle_product_id: bundle.id,
          bundle_component_id: comp.id,
        });
      }
    }

    const msg = totalExtraPrice > 0
      ? `${bundle.title} added (+RM ${totalExtraPrice.toFixed(2)} extras)`
      : `${bundle.title} added`;
    showToast(msg, 'success');
    onDone(bundle);
  };

  const progressPct = groups.length > 0 ? Math.round(((currentGroupIdx + (isGroupSatisfied ? 1 : 0)) / groups.length) * 100) : 0;

  return (
    <AnimatePresence>
      <motion.div
        className="bps-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mcb-title"
      >
        <motion.div
          className="bps-sheet"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        >
          <div className="bps-handle-wrap">
            <div className="bps-handle" />
          </div>

          <div className="bps-header">
            <div className="bps-header-text">
              <h3 id="mcb-title" className="bps-title">{bundle.title}</h3>
              <p className="bps-subtitle">{t('menu.multiCourseSubtitle') || 'Build your combo'}</p>
            </div>
            <button className="bps-close-btn" onClick={onClose} aria-label={t('common.close')}>
              <X size={20} />
            </button>
          </div>

          <div className="bps-progress-bar">
            <div className="bps-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>

          <div style={{ display: "flex", gap: 0, overflowX: "auto", padding: "0 16px 8px", borderBottom: "1px solid var(--color-border-light)", marginBottom: 8 }}>
            {groups.map((g, gi) => {
              const sel = selectedIds[gi] || new Set<number>();
              const done = sel.size >= g.pick_count;
              return (
                <button
                  key={gi}
                  onClick={() => setCurrentGroupIdx(gi)}
                  style={{
                    padding: "8px 14px", fontSize: 12, fontWeight: currentGroupIdx === gi ? 700 : 400,
                    border: "none", borderBottom: currentGroupIdx === gi ? "3px solid var(--color-primary)" : "3px solid transparent",
                    background: "transparent", cursor: "pointer", whiteSpace: "nowrap",
                    color: done ? "var(--color-success)" : currentGroupIdx === gi ? "var(--color-primary)" : "var(--color-text-muted)",
                    opacity: done ? 0.7 : 1,
                  }}
                >
                  {done && "✓ "}{g.group_label} ({sel.size}/{g.pick_count})
                </button>
              );
            })}
          </div>

          {currentGroup && (
            <>
              <div style={{ padding: "0 16px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h4 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{currentGroup.group_label}</h4>
                  <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "2px 0 0" }}>
                    {t('menu.pickXSelected', { selected: currentSelections.size, count: pickCount })}
                    {maxPick > pickCount && ` (up to ${maxPick})`}
                  </p>
                </div>
                {currentSelections.size >= pickCount && currentSelections.size < maxPick && (
                  <span style={{ fontSize: 11, color: "var(--color-warning)" }}>+RM each extra</span>
                )}
              </div>

              <div className="bps-scroll" style={{ flex: 1 }}>
                <div className="bps-grid">
                  {poolItems.map((item) => {
                    const imgSrc = resolveAssetUrl(item.image_url);
                    const selected = isSelected(item.componentId);
                    const selectable = isSelectable(item.componentId);

                    return (
                      <div
                        key={item.componentId}
                        className={`bps-item-card ${selected ? 'bps-selected' : ''} ${!selectable && !selected ? 'bps-dimmed' : ''}`}
                        onClick={() => toggleItem(item.componentId)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleItem(item.componentId); } }}
                        role="button"
                        tabIndex={0}
                        aria-pressed={selected}
                      >
                        <div className="bps-item-img">
                          {imgSrc ? (
                            <img src={imgSrc} alt={item.name} loading="lazy" />
                          ) : (
                            <Coffee size={20} color={LOKA.border} />
                          )}
                          {selected && (
                            <div className="bps-check-badge">
                              <Check size={12} />
                            </div>
                          )}
                        </div>
                        <div className="bps-item-info">
                          <div className="bps-item-name">{item.name}</div>
                          <div className="bps-item-price">{formatPrice(item.price)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <div className="bps-footer" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div className="bps-footer-price" style={{ flex: 1 }}>
              <span className="bps-footer-label">{bundle.title}</span>
              <span className="bps-footer-amount">{formatPrice(bundle.bundle_price)}</span>
            </div>

            {isLastGroup ? (
              <button
                className={`bps-add-btn ${canComplete ? '' : 'bps-add-btn-disabled'}`}
                disabled={!canComplete}
                onClick={handleAddToCart}
              >
                {canComplete ? t('menu.pickXAddToCart') : `${currentSelections.size}/${pickCount} selected`}
              </button>
            ) : (
              <button
                className={`bps-add-btn ${isGroupSatisfied ? '' : 'bps-add-btn-disabled'}`}
                disabled={!isGroupSatisfied}
                onClick={nextGroup}
                style={{ display: "flex", alignItems: "center", gap: 4 }}
              >
                Next <ArrowRight size={16} />
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
