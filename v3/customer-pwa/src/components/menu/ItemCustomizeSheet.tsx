'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minus, Plus, Coffee, AlertTriangle, Heart } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import api from '@/lib/api';
import { useFavoritesStore } from '@/stores/favoritesStore';
import type { MenuItem, CustomizationOption, ClassSession } from '@/lib/api';
import { resolveAssetUrl, formatPrice, LOKA } from '@/lib/tokens';
interface SelectedOption {
  id: number;
  name: string;
  option_type: string;
  price_adjustment: number;
}
interface SelectedVariant {
  id: number;
  variant_name: string;
  price_adjustment: number;
}
interface ItemCustomizeSheetProps {
  item: MenuItem | null;
  isOpen: boolean;
  onClose: () => void;
  onAdd: (item: MenuItem, quantity: number, customizations: SelectedOption[], totalPrice: number, variant?: SelectedVariant | null, session?: ClassSession | null) => void;
  loadingOptions?: boolean;
  customizations?: CustomizationOption[];
  initialSelections?: SelectedOption[];
}

/** Cup sizes with proportional visual dimensions */
const CUP_SIZES: Record<string, {
  w: number;
  h: number;
}> = {
  small: {
    w: 24,
    h: 32
  },
  medium: {
    w: 28,
    h: 38
  },
  large: {
    w: 32,
    h: 44
  },
  regular: {
    w: 28,
    h: 38
  }
};

/** Milk option colors */
const MILK_COLORS: Record<string, string> = {
  'full cream': 'var(--color-warning-light)',
  'oat': '#F5E6CC',
  'soy': '#F0EDE8',
  'almond': '#F5EDDF',
  'skim': '#F8F8FC',
  'coconut': '#FDF6EE',
  'lactose-free': '#FAF8F2'
};
export default function ItemCustomizeSheet({
  item,
  isOpen,
  onClose,
  onAdd,
  loadingOptions,
  customizations = [],
  initialSelections
}: ItemCustomizeSheetProps) {
  const {
    t
  } = useTranslation();
  const cupLabels: Record<string, string> = {
    small: t('menu.cup.small'),
    medium: t('menu.cup.medium'),
    large: t('menu.cup.large'),
    regular: t('menu.cup.regular')
  };
  const [quantity, setQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState<SelectedOption[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<SelectedVariant | null>(null);
  const [notes, setNotes] = useState('');
  // Class sessions (experience items only)
  const isExperience = (item?.item_code ?? '').startsWith('EX-');
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ClassSession | null>(null);
  const variants = (item?.variants ?? []).filter(v => v.is_available);
  useEffect(() => {
    if (item && isOpen) {
      setQuantity(1);
      setSelectedOptions(initialSelections || []);
      // Default to the item's default variant (or first available)
      const avail = (item.variants ?? []).filter(v => v.is_available);
      const first = avail[0];
      setSelectedVariant(first ? { id: first.id, variant_name: first.variant_name, price_adjustment: first.price_adjustment } : null);
      setSelectedSession(null);
      setNotes('');
      if ((item.item_code ?? '').startsWith('EX-')) {
        api.get(`/menu/items/${item.id}/sessions`)
          .then(res => setSessions(Array.isArray(res.data) ? res.data : []))
          .catch(() => setSessions([]));
      }
    }
  }, [item, isOpen]);
  const toggleOption = useCallback((opt: CustomizationOption) => {
    setSelectedOptions(prev => {
      const exists = prev.find(o => o.id === opt.id);
      if (exists) return prev.filter(o => o.id !== opt.id);
      return [...prev, {
        id: opt.id,
        name: opt.name,
        option_type: opt.option_type,
        price_adjustment: opt.price_adjustment
      }];
    });
  }, []);
  const toggleCupSize = useCallback((opt: CustomizationOption) => {
    setSelectedOptions(prev => {
      const existing = prev.filter(o => o.option_type !== opt.option_type);
      // If already selected this cup, deselect
      if (prev.some(o => o.id === opt.id)) return existing;
      return [...existing, {
        id: opt.id,
        name: opt.name,
        option_type: opt.option_type,
        price_adjustment: opt.price_adjustment
      }];
    });
  }, []);
  const getAllergenWarning = useCallback((item: MenuItem): string | null => {
    const tags = item.dietary_tags;
    if (!tags) return null;
    const hasDairyFree = tags.some(t => t.toLowerCase() === 'dairy-free');
    if (hasDairyFree) return null;
    if (tags.some(t => t.toLowerCase() === 'vegan')) return null;
    return t('menu.allergenWarning');
  }, [t]);
  const basePrice = item?.base_price ?? 0;
  const variantDelta = selectedVariant?.price_adjustment ?? 0;
  const optionDelta = selectedOptions.reduce((sum, o) => sum + o.price_adjustment, 0);
  const totalPrice = basePrice + variantDelta + optionDelta;
  const groupedOptions = customizations.reduce<Record<string, CustomizationOption[]>>((acc, opt) => {
    const type = opt.option_type || 'other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(opt);
    return acc;
  }, {});
  const handleAdd = () => {
    if (!item) return;
    if (isExperience && !selectedSession) return; // session required for classes
    onAdd(item, quantity, selectedOptions, totalPrice, selectedVariant, selectedSession);
    onClose();
  };
  // "Your Usuals" — save the current item + variant + option selection
  const { toggleFavorite, isFavorite } = useFavoritesStore();
  const isFav = item ? isFavorite(item.id) : false;
  const saveUsual = () => {
    if (!item) return;
    toggleFavorite({
      menu_item_id: item.id,
      name: item.item_name,
      price: totalPrice,
      base_price: item.base_price,
      image_url: item.image_url ?? null,
      variant_id: selectedVariant?.id ?? null,
      variant_name: selectedVariant?.variant_name ?? null,
      options: selectedOptions.map((o) => ({ id: o.id, name: o.name, price_adjustment: o.price_adjustment })),
    });
  };
  const imgSrc = item?.image_url ? resolveAssetUrl(item.image_url) : null;
  const allergenWarning = item ? getAllergenWarning(item) : null;
  const isSelected = (id: number) => selectedOptions.some(o => o.id === id);
  return <AnimatePresence>
      {isOpen && item && <motion.div initial={{
      opacity: 0
    }} animate={{
      opacity: 1
    }} exit={{
      opacity: 0
    }} onClick={onClose} className="ics-overlay" role="dialog" aria-label={item?.item_name || t('menu.customizeItemAriaLabel')}>
          <motion.div initial={{
        y: '100%'
      }} animate={{
        y: 0
      }} exit={{
        y: '100%'
      }} transition={{
        type: 'spring',
        damping: 25,
        stiffness: 300
      }} onClick={e => e.stopPropagation()} className="ics-sheet">
            <div className="ics-handle-wrap">
              <div className="ics-handle" />
            </div>

            {/* Image */}
            <div className="ics-image-wrap">
              {imgSrc ? <img src={imgSrc} alt={item.item_name} loading="lazy" className="ics-image" /> : <div className="ics-image-fallback">
                  <Coffee size={56} color={LOKA.brown} strokeWidth={1.2} />
                </div>}
              <button onClick={onClose} className="ics-close-btn" aria-label={t('common.close')}>
                <X size={14} />
              </button>
            </div>

            <div className="ics-scroll">
              <div className="ics-body">
                <h2 className="ics-title">{item.item_name}</h2>
                <p className="ics-desc">{item.description}</p>
                {item.calories != null && item.calories > 0 && <p className="ics-calories" style={{
              fontSize: 12,
              color: 'var(--color-text-muted)',
              marginTop: 4
            }}>
                    {item.calories}{t("menu.item_customize_sheet.kcal")}</p>}
              </div>

              {/* Live price */}
              <div className="ics-live-price">
                {formatPrice(totalPrice)}
                {optionDelta > 0 && <span className="ics-price-delta">+{formatPrice(optionDelta)}</span>}
              </div>

              {/* Allergen warning */}
              {allergenWarning && <div className="ics-allergen">
                  <AlertTriangle size={16} />
                  <div className="ics-allergen-text">{allergenWarning}</div>
                </div>}

              {/* Variant picker (Hot/Cold, package size, etc.) */}
              {variants.length > 0 && (
                <div className="ics-group">
                  <div className="ics-group-header">
                    <span className="ics-group-title">{t('menu.variant')}</span>
                    <span className="ics-group-req">{t('menu.required')}</span>
                  </div>
                  <div className="ics-options-list">
                    {variants.map(v => {
                      const sel = selectedVariant?.id === v.id;
                      return <button key={v.id} onClick={() => setSelectedVariant(v)} className={`ics-option-btn ${sel ? 'selected' : ''}`}>
                        <span>{v.variant_name}</span>
                        <span className="ics-option-price">
                          {v.price_adjustment > 0 ? `+${formatPrice(v.price_adjustment)}` : ''}
                        </span>
                      </button>;
                    })}
                  </div>
                </div>
              )}

              {/* Class session picker (experience items — required) */}
              {isExperience && (
                <div className="ics-group">
                  <div className="ics-group-header">
                    <span className="ics-group-title">{t('menu.selectSession')}</span>
                    <span className="ics-group-req">{t('menu.required')}</span>
                  </div>
                  {sessions.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--color-text-muted)', padding: '4px 0' }}>{t('menu.noSessions')}</p>
                  ) : (
                    <div className="ics-options-list">
                      {sessions.map(s => {
                        const sel = selectedSession?.id === s.id;
                        const full = s.remaining <= 0;
                        const d = new Date(`${s.session_date}T${s.start_time}`);
                        const dateLabel = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                        return <button key={s.id} disabled={full} onClick={() => setSelectedSession(s)} className={`ics-option-btn ${sel ? 'selected' : ''}`} style={full ? { opacity: 0.5 } : undefined}>
                          <span>{dateLabel} · {s.start_time}{s.location ? ` · ${s.location}` : ''}</span>
                          <span className="ics-option-price">{full ? t('menu.sessionFull') : t('menu.seatsLeft', { count: s.remaining })}</span>
                        </button>;
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Option groups */}
              {loadingOptions ? <div className="ics-skeleton-wrap">
                  {[1, 2].map(i => <div key={i} className="skeleton ics-skeleton" />)}
                </div> : Object.entries(groupedOptions).map(([type, opts]) => {
            const isSize = type.toLowerCase().includes('size');
            const isMilk = type.toLowerCase().includes('milk');
            const hasPopular = opts.some(o => o.is_popular);
            return <div key={type} className="ics-group">
                    <div className="ics-group-header">
                      <span className="ics-group-title">
                        {type === 'other' ? t('menu.options') : type}
                        {hasPopular && <span className="ics-popular-badge">
                            <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                            {t('menu.popular')}
                          </span>}
                      </span>
                      <span className="ics-group-req">
                        {isSize ? t('menu.required') : t('common.optional')}
                      </span>
                    </div>

                    {isSize ? (/* Cup previews for Size */
              <div className="ics-cup-row">
                        {opts.map(opt => {
                  const key = opt.name.toLowerCase();
                  const cup = CUP_SIZES[key] ?? CUP_SIZES['regular'];
                  if (!cup) return null;
                  const cupLabelKey = key in CUP_SIZES ? key : 'regular';
                  const sel = isSelected(opt.id);
                  return <div key={opt.id} className={`ics-cup-option ${sel ? 'selected' : ''}`} onClick={() => toggleCupSize(opt)}>
                              <div className="ics-cup-visual" style={{
                      width: cup.w + 32,
                      height: cup.h + 24
                    }}>
                                <svg width={cup.w} height={cup.h} viewBox={`0 0 ${cup.w} ${cup.h}`} fill="none">
                                  <rect x="2" y="4" width={cup.w - 4} height={cup.h - 8} rx="2" fill={LOKA.brown} />
                                  <rect x="4" y="6" width={cup.w - 8} height={cup.h - 20} rx="1" fill={LOKA.copper} opacity="0.3" />
                                  <path d={`M${cup.w - 6} ${cup.h / 3} C${cup.w} ${cup.h / 3} ${cup.w + 3} ${cup.h / 2} ${cup.w + 3} ${cup.h / 2 + 3} C${cup.w + 3} ${cup.h / 2 + 8} ${cup.w} ${cup.h / 2 + 10} ${cup.w - 6} ${cup.h / 2 + 10}`} stroke={LOKA.brown} strokeWidth="2" fill="none" />
                                </svg>
                              </div>
                              <span className="ics-cup-label">{cupLabels[cupLabelKey]}</span>
                              <span className="ics-cup-price">{formatPrice(basePrice + opt.price_adjustment)}</span>
                            </div>;
                })}
                      </div>) : <div className="ics-options-list">
                        {opts.map(opt => {
                  const sel = isSelected(opt.id);
                  const milkColor = isMilk ? MILK_COLORS[opt.name.toLowerCase()] || 'var(--color-warning-light)' : null;
                  return <button key={opt.id} onClick={() => toggleOption(opt)} className={`ics-option-btn ${sel ? 'selected' : ''}`}>
                              {milkColor && <span className="ics-milk-dot" style={{
                      background: milkColor
                    }} />}
                              <span>{opt.name}</span>
                              <span className="ics-option-price">
                                {opt.price_adjustment > 0 ? `+${formatPrice(opt.price_adjustment)}` : ''}
                              </span>
                            </button>;
                })}
                      </div>}
                  </div>;
          })}

              {/* Special instructions */}
              <div className="ics-notes-section">
                <div className="ics-notes-title">{t('menu.specialInstructions')}</div>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('menu.specialInstructionsPlaceholder')} className="ics-textarea" />
              </div>
            </div>

            {/* Footer */}
            <div className="ics-footer">
              <div className="ics-qty-row">
                <button className="ics-qty-btn" onClick={() => setQuantity(q => Math.max(1, q - 1))}>
                  <Minus size={14} />
                </button>
                <span className="ics-qty-value">{quantity}</span>
                <button className="ics-qty-btn" onClick={() => setQuantity(q => q + 1)}>
                  <Plus size={14} />
                </button>
              </div>
              {/* Save this exact configuration as a "usual" (one-tap reorder on the menu) */}
              <button className={`ics-fav-btn ${isFav ? 'active' : ''}`} onClick={saveUsual} aria-label={t('menu_page.saveUsualAria')} aria-pressed={isFav}>
                <Heart size={17} fill={isFav ? 'currentColor' : 'none'} />
              </button>
              <button onClick={handleAdd} className="ics-add-btn" disabled={isExperience && !selectedSession} style={isExperience && !selectedSession ? { opacity: 0.6 } : undefined}>
                {isExperience && !selectedSession ? t('menu.selectSessionFirst') : quantity > 1 ? t('menu.addQuantity', {
              quantity,
              price: formatPrice(totalPrice * quantity)
            }) : t('menu.addPrice', {
              price: formatPrice(totalPrice * quantity)
            })}
              </button>
            </div>
          </motion.div>
        </motion.div>}
    </AnimatePresence>;
}