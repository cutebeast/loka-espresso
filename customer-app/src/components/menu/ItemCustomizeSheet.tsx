'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minus, Plus, ShoppingCart, Coffee, Star } from 'lucide-react';
import type { MenuItem, CustomizationOption } from '@/lib/api';
import { resolveAssetUrl } from '@/lib/tokens';

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
}

function formatPrice(val: number | string): string {
  return `RM ${Number(val).toFixed(2)}`;
}

export default function ItemCustomizeSheet({
  item,
  isOpen,
  onClose,
  onAdd,
  loadingOptions,
  customizations = [],
}: ItemCustomizeSheetProps) {
  const [quantity, setQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState<SelectedOption[]>([]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (item) {
      setQuantity(1);
      setSelectedOptions([]);
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

  const totalPrice = item
    ? item.base_price + selectedOptions.reduce((sum, o) => sum + o.price_adjustment, 0)
    : 0;

  const groupedOptions = customizations.reduce<Record<string, CustomizationOption[]>>((acc, opt) => {
    const type = opt.option_type || 'other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(opt);
    return acc;
  }, {});

  const isRequiredGroup = (type: string) => {
    const requiredTypes = ['size', ' drink size', '杯型', 'size (required)'];
    return requiredTypes.some((r) => type.toLowerCase().includes(r.toLowerCase()));
  };

  const handleAdd = () => {
    if (!item) return;
    onAdd(item, quantity, selectedOptions, totalPrice);
    onClose();
  };

  const imgSrc = item?.image_url ? resolveAssetUrl(item.image_url) : null;

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

            <div className="ics-image-wrap">
              {imgSrc ? (
                <img
                  src={imgSrc}
                  alt={item.name}
                  className="ics-image"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div className="ics-image-fallback">
                  <Coffee size={56} color="#57280D" strokeWidth={1.2} />
                </div>
              )}
              <button
                onClick={onClose}
                className="ics-close-btn"
                aria-label="Close"
              >
                <X size={16} color="#1B2023" />
              </button>
            </div>

            <div className="scroll-container ics-scroll">
              <div className="ics-body">
                <div className="ics-header">
                  <div className="ics-header-text">
                    <h2 className="ics-title">{item.name}</h2>
                    <p className="ics-desc">{item.description}</p>
                  </div>
                  <div className="ics-rating">
                    <Star size={12} color="#D18E38" fill="#D18E38" />
                    <span className="ics-rating-text">4.8</span>
                  </div>
                </div>
                <p className="ics-price">{formatPrice(item.base_price)}</p>
              </div>

              {loadingOptions ? (
                <div className="ics-skeleton-wrap">
                  {[1, 2].map((i) => (
                    <div key={i} className="skeleton ics-skeleton" />
                  ))}
                </div>
              ) : Object.entries(groupedOptions).length > 0 ? (
                <div className="ics-section">
                  {Object.entries(groupedOptions).map(([type, opts]) => {
                    const required = isRequiredGroup(type);
                    return (
                      <div key={type} className="ics-group">
                        <div className="ics-group-header">
                          <span className="ics-group-title">
                            {type === 'other' ? 'Options' : type}
                          </span>
                          {required && (
                            <span className="ics-badge-required">
                              Required
                            </span>
                          )}
                        </div>
                        <div className="ics-options-list">
                          {opts.map((opt) => {
                            const isSelected = selectedOptions.some((o) => o.id === opt.id);
                            return (
                              <button
                                key={opt.id}
                                onClick={() => toggleOption(opt)}
                                className={`ics-option-btn ${isSelected ? 'selected' : ''}`}
                              >
                                <div className="ics-option-label">
                                  <div className={`ics-check ${isSelected ? 'selected' : ''}`}>
                                    {isSelected && <div className="ics-check-dot" />}
                                  </div>
                                  <span>{opt.name}</span>
                                </div>
                                <span className={`ics-option-price ${isSelected ? 'selected' : ''}`}>
                                  {opt.price_adjustment > 0 ? `+${formatPrice(opt.price_adjustment)}` : 'included'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              <div className="ics-notes-section">
                <div className="ics-notes-title">
                  Special instructions
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. No sugar, extra hot"
                  rows={2}
                  className="ics-textarea"
                />
              </div>
            </div>

            <div className="ics-footer">
              <div className="ics-qty-row">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="ics-qty-btn"
                >
                  <Minus size={14} color="#1B2023" />
                </motion.button>
                <span className="ics-qty-value">
                  {quantity}
                </span>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setQuantity((q) => q + 1)}
                  className="ics-qty-btn"
                >
                  <Plus size={14} color="#1B2023" />
                </motion.button>
              </div>

              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleAdd}
                className="ics-add-btn"
              >
                <ShoppingCart size={16} />
                Add {quantity > 1 ? `${quantity} · ` : ''}{formatPrice(totalPrice * quantity)}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
