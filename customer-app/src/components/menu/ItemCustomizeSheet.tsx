'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minus, Plus, ShoppingCart, Coffee, AlertTriangle } from 'lucide-react';
import type { MenuItem, CustomizationOption } from '@/lib/api';
import { resolveAssetUrl, formatPrice } from '@/lib/tokens';

interface SelectedOption {
  id: number;
  name: string;
  option_type: string;
  price_adjustment: number;
}

interface ItemCustomizeSheetProps {
  item: MenuItem | null;
  isOpen: boolean;
  onClose: () => void;
  onAdd: (item: MenuItem, quantity: number, customizations: SelectedOption[], totalPrice: number) => void;
  loadingOptions?: boolean;
  customizations?: CustomizationOption[];
  initialSelections?: SelectedOption[];
}

/** Cup sizes with proportional visual dimensions */
const CUP_SIZES: Record<string, { w: number; h: number; label: string }> = {
  small:  { w: 24, h: 32, label: 'Small' },
  medium: { w: 28, h: 38, label: 'Medium' },
  large:  { w: 32, h: 44, label: 'Large' },
  regular:{ w: 28, h: 38, label: 'Regular' },
};

/** Milk option colors */
const MILK_COLORS: Record<string, string> = {
  'full cream': '#FFF8E7',
  'oat': '#F5E6CC',
  'soy': '#F0EDE8',
  'almond': '#F5EDDF',
  'skim': '#F8F8FC',
  'coconut': '#FDF6EE',
  'lactose-free': '#FAF8F2',
};

/** Derive allergen warnings from dietary_tags */
function getAllergenWarning(item: MenuItem): string | null {
  const tags = item.dietary_tags;
  if (!tags) return null;
  const hasDairyFree = tags.some(t => t.toLowerCase() === 'dairy-free');
  if (hasDairyFree) return null;
  if (tags.some(t => t.toLowerCase() === 'vegan')) return null;
  return 'Contains dairy (milk). May contain traces of nuts.';
}

export default function ItemCustomizeSheet({
  item,
  isOpen,
  onClose,
  onAdd,
  loadingOptions,
  customizations = [],
  initialSelections,
}: ItemCustomizeSheetProps) {
  const [quantity, setQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState<SelectedOption[]>([]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (item) {
      setQuantity(1);
      setSelectedOptions(initialSelections || []);
      setNotes('');
    }
  }, [item]);

  const toggleOption = useCallback((opt: CustomizationOption) => {
    setSelectedOptions((prev) => {
      const exists = prev.find((o) => o.id === opt.id);
      if (exists) return prev.filter((o) => o.id !== opt.id);
      return [...prev, { id: opt.id, name: opt.name, option_type: opt.option_type, price_adjustment: opt.price_adjustment }];
    });
  }, []);

  const toggleCupSize = useCallback((opt: CustomizationOption) => {
    setSelectedOptions((prev) => {
      const existing = prev.filter((o) => o.option_type !== opt.option_type);
      // If already selected this cup, deselect
      if (prev.some(o => o.id === opt.id)) return existing;
      return [...existing, { id: opt.id, name: opt.name, option_type: opt.option_type, price_adjustment: opt.price_adjustment }];
    });
  }, []);

  const basePrice = item?.base_price ?? 0;
  const optionDelta = selectedOptions.reduce((sum, o) => sum + o.price_adjustment, 0);
  const totalPrice = basePrice + optionDelta;

  const groupedOptions = customizations.reduce<Record<string, CustomizationOption[]>>((acc, opt) => {
    const type = opt.option_type || 'other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(opt);
    return acc;
  }, {});

  const handleAdd = () => {
    if (!item) return;
    onAdd(item, quantity, selectedOptions, totalPrice);
    onClose();
  };

  const imgSrc = item?.image_url ? resolveAssetUrl(item.image_url) : null;
  const allergenWarning = item ? getAllergenWarning(item) : null;
  const isSelected = (id: number) => selectedOptions.some((o) => o.id === id);

  return (
    <AnimatePresence>
      {isOpen && item && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="ics-overlay"
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="ics-sheet"
          >
            <div className="ics-handle-wrap">
              <div className="ics-handle" />
            </div>

            {/* Image */}
            <div className="ics-image-wrap">
              {imgSrc ? (
                <img src={imgSrc} alt={item.name} className="ics-image" />
              ) : (
                <div className="ics-image-fallback">
                  <Coffee size={56} color="#57280D" strokeWidth={1.2} />
                </div>
              )}
              <button onClick={onClose} className="ics-close-btn" aria-label="Close">
                <X size={14} />
              </button>
            </div>

            <div className="ics-scroll">
              <div className="ics-body">
                <h2 className="ics-title">{item.name}</h2>
                <p className="ics-desc">{item.description}</p>
              </div>

              {/* Live price */}
              <div className="ics-live-price">
                {formatPrice(totalPrice)}
                {optionDelta > 0 && (
                  <span className="ics-price-delta">+{formatPrice(optionDelta)}</span>
                )}
              </div>

              {/* Allergen warning */}
              {allergenWarning && (
                <div className="ics-allergen">
                  <AlertTriangle size={16} />
                  <div className="ics-allergen-text">{allergenWarning}</div>
                </div>
              )}

              {/* Option groups */}
              {loadingOptions ? (
                <div className="ics-skeleton-wrap">
                  {[1, 2].map((i) => <div key={i} className="skeleton ics-skeleton" />)}
                </div>
              ) : Object.entries(groupedOptions).map(([type, opts]) => {
                const isSize = type.toLowerCase().includes('size');
                const isMilk = type.toLowerCase().includes('milk');
                const hasPopular = opts.some(o => o.is_popular);

                return (
                  <div key={type} className="ics-group">
                    <div className="ics-group-header">
                      <span className="ics-group-title">
                        {type === 'other' ? 'Options' : type}
                        {hasPopular && (
                          <span className="ics-popular-badge">
                            <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                            Popular
                          </span>
                        )}
                      </span>
                      <span className="ics-group-req">
                        {isSize ? 'Required' : 'Optional'}
                      </span>
                    </div>

                    {isSize ? (
                      /* Cup previews for Size */
                      <div className="ics-cup-row">
                        {opts.map((opt) => {
                          const key = opt.name.toLowerCase();
                          const cup = CUP_SIZES[key] || CUP_SIZES['regular'];
                          const sel = isSelected(opt.id);
                          return (
                            <div
                              key={opt.id}
                              className={`ics-cup-option ${sel ? 'selected' : ''}`}
                              onClick={() => toggleCupSize(opt)}
                            >
                              <div className="ics-cup-visual" style={{ width: cup.w + 32, height: cup.h + 24 }}>
                                <svg width={cup.w} height={cup.h} viewBox={`0 0 ${cup.w} ${cup.h}`} fill="none">
                                  <rect x="2" y="4" width={cup.w - 4} height={cup.h - 8} rx="2" fill="#57280D" />
                                  <rect x="4" y="6" width={cup.w - 8} height={cup.h - 20} rx="1" fill="#D18E38" opacity="0.3" />
                                  <path d={`M${cup.w - 6} ${cup.h / 3} C${cup.w} ${cup.h / 3} ${cup.w + 3} ${cup.h / 2} ${cup.w + 3} ${cup.h / 2 + 3} C${cup.w + 3} ${cup.h / 2 + 8} ${cup.w} ${cup.h / 2 + 10} ${cup.w - 6} ${cup.h / 2 + 10}`} stroke="#57280D" strokeWidth="2" fill="none" />
                                </svg>
                              </div>
                              <span className="ics-cup-label">{cup.label || opt.name}</span>
                              <span className="ics-cup-price">{formatPrice(basePrice + opt.price_adjustment)}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="ics-options-list">
                        {opts.map((opt) => {
                          const sel = isSelected(opt.id);
                          const milkColor = isMilk ? (MILK_COLORS[opt.name.toLowerCase()] || '#FFF8E7') : null;
                          return (
                            <button
                              key={opt.id}
                              onClick={() => toggleOption(opt)}
                              className={`ics-option-btn ${sel ? 'selected' : ''}`}
                            >
                              {milkColor && <span className="ics-milk-dot" style={{ background: milkColor }} />}
                              <span>{opt.name}</span>
                              <span className="ics-option-price">
                                {opt.price_adjustment > 0 ? `+RM ${opt.price_adjustment.toFixed(2)}` : ''}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Special instructions */}
              <div className="ics-notes-section">
                <div className="ics-notes-title">Special instructions</div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g., Less foam, extra hot..."
                  className="ics-textarea"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="ics-footer">
              <div className="ics-qty-row">
                <button className="ics-qty-btn" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
                  <Minus size={14} />
                </button>
                <span className="ics-qty-value">{quantity}</span>
                <button className="ics-qty-btn" onClick={() => setQuantity((q) => q + 1)}>
                  <Plus size={14} />
                </button>
              </div>
              <button onClick={handleAdd} className="ics-add-btn">
                Add{quantity > 1 ? ` ${quantity} ·` : ''} {formatPrice(totalPrice * quantity)}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
