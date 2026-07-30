'use client';

import { Calendar, Crown, GraduationCap, MapPin, Star, Users } from 'lucide-react';
import type { MenuItem } from '@/lib/api';
import { formatPrice, resolveAssetUrl, LOKA } from '@/lib/tokens';
import { getLocale } from '@/stores/localeStore';
import { useTranslation } from '@/hooks/useTranslation';

export interface ExperienceSession {
  id: number;
  session_date: string;
  start_time: string;
  capacity: number;
  booked_pax: number;
  remaining: number;
  location: string | null;
}

interface ExperienceCardProps {
  item: MenuItem;
  sessions: ExperienceSession[];
  imageBroken: boolean;
  onImageError: () => void;
  onBook: () => void;
}

function fmtSessionDate(dateStr: string): string {
  try {
    return new Date(`${dateStr}T00:00:00`).toLocaleDateString(getLocale(), {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Rich card for classes/workshops (Experiences category) — a class is not a
 * drink: it needs the full description, schedule and a booking CTA rather
 * than the compact "+ Add" product card used for regular menu items.
 */
export default function ExperienceCard({ item, sessions, imageBroken, onImageError, onBook }: ExperienceCardProps) {
  const { t } = useTranslation();
  const imgSrc = resolveAssetUrl(item.image_url);
  const desc = item.long_description || item.description || '';
  const variantPrices = (item.variants ?? [])
    .filter((v) => v.is_available)
    .map((v) => item.base_price + Number(v.price_adjustment || 0));
  const min = Math.min(item.base_price, ...variantPrices);
  const max = Math.max(item.base_price, ...variantPrices);
  const priceText = min === max ? formatPrice(min) : `${formatPrice(min)} – ${formatPrice(max)}`;
  const nextSessions = sessions.slice(0, 3);
  const bookable = sessions.length > 0;

  return (
    <div className="menu-experience-card" onClick={onBook} role="button" aria-label={item.item_name}>
      <div className="menu-experience-img">
        {imgSrc && !imageBroken ? (
          <img src={imgSrc} alt={item.item_name} loading="lazy" onError={onImageError} />
        ) : (
          <div className="menu-experience-img-fallback">
            <GraduationCap size={36} color={LOKA.border} strokeWidth={1.5} />
          </div>
        )}
        {item.is_featured && (
          <span className="menu-img-badge">
            <Star color="var(--color-gold)" size={12} fill="currentColor" />
          </span>
        )}
        {item.minimum_tier_id ? (
          <span className="menu-img-badge" style={{ right: 4, top: 4, left: 'auto', background: 'rgba(0,0,0,0.6)', color: 'var(--color-gold)', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>
            <Crown size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /> {t('menu_page.members')}
          </span>
        ) : null}
      </div>

      <div className="menu-experience-body">
        <div className="menu-experience-title">{item.item_name}</div>
        {desc && <div className="menu-experience-desc">{desc}</div>}

        <div className="menu-experience-meta">
          <span className="menu-experience-price">{priceText}</span>
          <span className="menu-experience-per">{t('menu_page.per_person')}</span>
        </div>

        <div className="menu-experience-sessions">
          {nextSessions.length === 0 ? (
            <span className="menu-experience-no-session">{t('workshops.noSessions')}</span>
          ) : (
            nextSessions.map((s) => (
              <span key={s.id} className="menu-experience-session-chip">
                <Calendar size={11} /> {fmtSessionDate(s.session_date)} {s.start_time}
                {s.location && (
                  <>
                    <MapPin size={10} /> {s.location}
                  </>
                )}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, opacity: 0.85 }}>
                  <Users size={10} /> {s.remaining <= 0 ? t('workshops.full') : t('workshops.seatsLeft', { count: s.remaining })}
                </span>
              </span>
            ))
          )}
        </div>

        <button
          className="menu-experience-book-btn"
          disabled={!bookable}
          onClick={(e) => {
            e.stopPropagation();
            onBook();
          }}
        >
          {bookable ? t('workshops.book') : t('workshops.noSessions')}
        </button>
      </div>
    </div>
  );
}
