'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Calendar, GraduationCap, MapPin, Users } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useCartStore } from '@/stores/cartStore';
import api, { type MenuItem } from '@/lib/api';
import { resolveAssetUrl, formatPrice } from '@/lib/tokens';
import { useTranslation } from '@/hooks/useTranslation';
import { getLocale } from '@/stores/localeStore';
import ItemCustomizeSheet from './menu/ItemCustomizeSheet';

interface WorkshopVariant {
  id: number;
  variant_name: string;
  price_adjustment: string;
}

interface WorkshopSession {
  id: number;
  session_date: string;
  start_time: string;
  capacity: number;
  booked_pax: number;
  remaining: number;
  location: string | null;
}

interface Workshop {
  id: number;
  item_code: string;
  item_name: string;
  description: string | null;
  long_description: string | null;
  image_url: string | null;
  base_price: string;
  minimum_tier_id: number | null;
  variants: WorkshopVariant[];
  sessions: WorkshopSession[];
  total_remaining: number;
}

interface WorkshopsPageProps {
  onBack: () => void;
}

function fmtDate(dateStr: string): string {
  try {
    return new Date(`${dateStr}T00:00:00`).toLocaleDateString(getLocale(), { weekday: 'short', month: 'short', day: 'numeric' });
  } catch { return dateStr; }
}

export default function WorkshopsPage({ onBack }: WorkshopsPageProps) {
  const { t } = useTranslation();
  const { showToast, selectedStore } = useUIStore();
  const addItem = useCartStore((s) => s.addItem);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [brokenImages, setBrokenImages] = useState<Set<number>>(new Set());
  const [bookingItem, setBookingItem] = useState<MenuItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/menu/workshops?locale=${getLocale()}`);
      setWorkshops(Array.isArray(res.data) ? res.data : []);
    } catch {
      setWorkshops([]);
      showToast(t('workshops.loadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  useEffect(() => { load(); }, [load]);

  const priceText = (w: Workshop): string => {
    const prices = w.variants.length > 0
      ? w.variants.map((v) => Number(w.base_price) + Number(v.price_adjustment))
      : [Number(w.base_price)];
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? formatPrice(min) : `${formatPrice(min)} – ${formatPrice(max)}`;
  };

  const openBooking = (w: Workshop) => {
    // Hand the customize sheet a full MenuItem-shaped object — it enforces
    // session selection for EX- items itself and re-fetches live sessions.
    setBookingItem({
      id: w.id,
      item_code: w.item_code,
      item_name: w.item_name,
      description: w.description ?? undefined,
      long_description: w.long_description ?? undefined,
      image_url: w.image_url ?? undefined,
      base_price: Number(w.base_price),
      is_available: true,
      variants: w.variants.map((v) => ({
        id: v.id,
        parent_item_id: w.id,
        variant_name: v.variant_name,
        price_adjustment: Number(v.price_adjustment),
        is_available: true,
      })),
      modifier_groups: [],
    } as unknown as MenuItem);
  };

  const handleAdd = useCallback((
    item: MenuItem,
    quantity: number,
    selectedOptions: { id: number; name: string; price_adjustment: number }[],
    totalPrice: number,
    variant?: { id: number; variant_name: string; price_adjustment: number } | null,
    session?: { id: number; session_date: string; start_time: string; location: string | null } | null,
  ) => {
    const sessionLabel = session
      ? `${new Date(`${session.session_date}T${session.start_time}`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${session.start_time}`
      : undefined;
    addItem({
      menu_item_id: item.id,
      name: variant ? `${item.item_name} (${variant.variant_name})` : item.item_name,
      price: totalPrice,
      base_price: item.base_price,
      quantity,
      variant_id: variant?.id,
      variant_name: variant?.variant_name,
      class_session_id: session?.id,
      class_session_label: sessionLabel,
      customizations: { options: selectedOptions.map((o) => ({ id: o.id, name: o.name, price_adjustment: o.price_adjustment })) },
      store_id: selectedStore?.id,
      customization_option_ids: selectedOptions.map((o) => o.id),
      customization_count: selectedOptions.length,
    });
    setBookingItem(null);
    showToast(t('workshops.addedToCart'), 'success');
  }, [addItem, selectedStore?.id, showToast, t]);

  return (
    <div className="info-screen">
      <div className="info-header">
        <div className="info-header-left">
          <button className="info-back-btn" onClick={onBack} aria-label={t('common.back')}>
            <ArrowLeft size={20} />
          </button>
          <h1 className="info-page-title">{t('workshops.title')}</h1>
        </div>
      </div>

      <div className="info-card-list">
        {loading ? (
          [1, 2].map((i) => <div key={i} className="skeleton info-skeleton-card" />)
        ) : workshops.length === 0 ? (
          <div className="info-empty">
            <GraduationCap size={40} className="info-empty-icon" />
            <p className="info-empty-title">{t('workshops.noWorkshops')}</p>
            <p className="info-empty-desc">{t('workshops.checkBackSoon')}</p>
          </div>
        ) : (
          workshops.map((w) => {
            const img = resolveAssetUrl(w.image_url);
            const nextSessions = w.sessions.slice(0, 3);
            return (
              <div key={w.id} className="info-card" style={{ cursor: 'default', flexDirection: 'column', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div className="info-card-thumb">
                    {img && !brokenImages.has(w.id) ? (
                      <img src={img} alt={w.item_name} loading="lazy" onError={() => setBrokenImages((prev) => new Set(prev).add(w.id))} />
                    ) : (
                      <div className="info-card-thumb-fallback"><GraduationCap size={24} strokeWidth={1.5} /></div>
                    )}
                  </div>
                  <div className="info-card-body" style={{ flex: 1 }}>
                    <div className="info-card-title">{w.item_name}</div>
                    {w.description && <div className="info-card-desc">{w.description}</div>}
                    <div className="info-card-tag experience">{priceText(w)}</div>
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  {nextSessions.length === 0 ? (
                    <div className="info-card-desc" style={{ fontStyle: 'italic' }}>{t('workshops.noSessions')}</div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {nextSessions.map((s) => (
                        <span key={s.id} className="info-card-tag experience" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Calendar size={11} /> {fmtDate(s.session_date)} {s.start_time}
                          {s.location && <><MapPin size={10} /> {s.location}</>}
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, opacity: 0.85 }}>
                            <Users size={10} /> {s.remaining <= 0 ? t('workshops.full') : t('workshops.seatsLeft', { count: s.remaining })}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  className="info-share-btn"
                  style={{ justifyContent: 'center', marginTop: 12 }}
                  disabled={w.sessions.length === 0}
                  onClick={() => openBooking(w)}
                >
                  {w.sessions.length === 0 ? t('workshops.noSessions') : t('workshops.book')}
                </button>
              </div>
            );
          })
        )}
      </div>

      {bookingItem && (
        <ItemCustomizeSheet
          item={bookingItem}
          isOpen={bookingItem !== null}
          onClose={() => setBookingItem(null)}
          onAdd={handleAdd}
          customizations={[]}
        />
      )}
    </div>
  );
}
