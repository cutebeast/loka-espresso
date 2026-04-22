'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minus, Plus, ShoppingCart, Coffee, Star } from 'lucide-react';
import type { MenuItem, CustomizationOption } from '@/lib/api';
import { cacheBust } from '@/lib/api';

const LOKA = {
  primary: '#384B16',
  primaryDark: '#2A3910',
  copper: '#D18E38',
  copperLight: '#E5A559',
  copperSoft: 'rgba(209,142,56,0.12)',
  cream: '#F3EEE5',
  brown: '#57280D',
  textPrimary: '#1B2023',
  textSecondary: '#3A4A5A',
  textMuted: '#6A7A8A',
  border: '#D4DCE5',
  borderSubtle: '#E4EAEF',
  surface: '#F5F7FA',
  bg: '#E4EAEF',
  white: '#FFFFFF',
} as const;

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
      /* eslint-disable react-hooks/set-state-in-effect */
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

  const imgSrc = item?.image_url
    ? cacheBust(item.image_url.startsWith('http')
      ? item.image_url
      : `https://admin.loyaltysystem.uk${item.image_url}`)
    : null;

  return (
    <AnimatePresence>
      {isOpen && item && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            background: 'rgba(15,19,23,0.6)',
            backdropFilter: 'blur(2px)',
          }}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 430,
              background: LOKA.white,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
              <div style={{ width: 44, height: 4, borderRadius: 999, background: LOKA.border }} />
            </div>

            <div style={{ position: 'relative', height: 180, background: '#F2F6EA', flexShrink: 0 }}>
              {imgSrc ? (
                <img
                  src={imgSrc}
                  alt={item.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #F2F6EA 0%, #F3EEE5 100%)' }}>
                  <Coffee size={56} color={LOKA.brown} strokeWidth={1.2} />
                </div>
              )}
              <button
                onClick={onClose}
                style={{
                  position: 'absolute', top: 12, right: 12,
                  width: 32, height: 32, borderRadius: 999,
                  background: 'rgba(255,255,255,0.9)',
                  border: 'none', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                }}
                aria-label="Close"
              >
                <X size={16} color={LOKA.textPrimary} />
              </button>
            </div>

            <div className="scroll-container" style={{ flex: 1, overflowY: 'auto' }}>
              <div style={{ padding: '16px 20px 0' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 800, color: LOKA.textPrimary, letterSpacing: '-0.01em' }}>{item.name}</h2>
                    <p style={{ fontSize: 13, color: LOKA.textMuted, marginTop: 4, lineHeight: 1.5 }}>{item.description}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <Star size={12} color={LOKA.copper} fill={LOKA.copper} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: LOKA.copper }}>4.8</span>
                  </div>
                </div>
                <p style={{ fontSize: 20, fontWeight: 800, color: LOKA.primary, marginTop: 8 }}>{formatPrice(item.base_price)}</p>
              </div>

              {loadingOptions ? (
                <div style={{ padding: '20px 20px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[1, 2].map((i) => (
                    <div key={i} className="skeleton" style={{ height: 56, borderRadius: 14 }} />
                  ))}
                </div>
              ) : Object.entries(groupedOptions).length > 0 ? (
                <div style={{ padding: '16px 20px 0', display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {Object.entries(groupedOptions).map(([type, opts]) => {
                    const required = isRequiredGroup(type);
                    return (
                      <div key={type}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: LOKA.textPrimary, textTransform: 'capitalize' }}>
                            {type === 'other' ? 'Options' : type}
                          </span>
                          {required && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: LOKA.copper, background: LOKA.copperSoft, padding: '2px 6px', borderRadius: 999 }}>
                              Required
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {opts.map((opt) => {
                            const isSelected = selectedOptions.some((o) => o.id === opt.id);
                            return (
                              <button
                                key={opt.id}
                                onClick={() => toggleOption(opt)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  width: '100%',
                                  padding: '14px 16px',
                                  borderRadius: 14,
                                  border: isSelected ? `2px solid ${LOKA.primary}` : `1px solid ${LOKA.borderSubtle}`,
                                  background: isSelected ? '#F2F6EA' : LOKA.white,
                                  color: isSelected ? LOKA.primary : LOKA.textPrimary,
                                  fontSize: 14,
                                  fontWeight: isSelected ? 600 : 500,
                                  cursor: 'pointer',
                                  textAlign: 'left',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div style={{
                                    width: 18, height: 18, borderRadius: 999,
                                    border: isSelected ? `2px solid ${LOKA.primary}` : `1.5px solid ${LOKA.border}`,
                                    background: isSelected ? LOKA.primary : 'transparent',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                  }}>
                                    {isSelected && <div style={{ width: 8, height: 8, borderRadius: 999, background: LOKA.white }} />}
                                  </div>
                                  <span>{opt.name}</span>
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 600, color: isSelected ? LOKA.primary : LOKA.textMuted }}>
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

              <div style={{ padding: '20px 20px 0' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: LOKA.textPrimary, marginBottom: 10 }}>
                  Special instructions
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. No sugar, extra hot"
                  rows={2}
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: 14,
                    border: `1px solid ${LOKA.borderSubtle}`,
                    background: LOKA.surface, fontSize: 14, color: LOKA.textPrimary,
                    resize: 'none', outline: 'none', fontFamily: 'inherit',
                  }}
                />
              </div>
            </div>

            <div style={{
              padding: '16px 20px 24px',
              borderTop: `1px solid ${LOKA.borderSubtle}`,
              display: 'flex', alignItems: 'center', gap: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  style={{
                    width: 32, height: 32, borderRadius: 999,
                    border: `1.5px solid ${LOKA.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', background: LOKA.white,
                  }}
                >
                  <Minus size={14} color={LOKA.textPrimary} />
                </motion.button>
                <span style={{ fontSize: 16, fontWeight: 800, color: LOKA.textPrimary, minWidth: 20, textAlign: 'center' }}>
                  {quantity}
                </span>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setQuantity((q) => q + 1)}
                  style={{
                    width: 32, height: 32, borderRadius: 999,
                    border: `1.5px solid ${LOKA.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', background: LOKA.white,
                  }}
                >
                  <Plus size={14} color={LOKA.textPrimary} />
                </motion.button>
              </div>

              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleAdd}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '14px 24px', borderRadius: 999,
                  background: LOKA.primary, color: LOKA.white,
                  fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer',
                  boxShadow: '0 8px 16px rgba(56,75,22,0.25)',
                }}
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