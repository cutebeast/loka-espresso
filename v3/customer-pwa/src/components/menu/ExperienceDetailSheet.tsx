'use client';

import { Calendar, GraduationCap, Leaf, MapPin, Users, X } from 'lucide-react';
import type { MenuItem } from '@/lib/api';
import { formatPrice, resolveAssetUrl } from '@/lib/tokens';
import { getLocale } from '@/stores/localeStore';
import { useTranslation } from '@/hooks/useTranslation';
import type { ExperienceSession } from './ExperienceCard';

interface ExperienceDetailSheetProps {
  item: MenuItem;
  sessions: ExperienceSession[];
  onClose: () => void;
  onBook: () => void;
}

function fmtDate(dateStr: string): string {
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
 * Full-screen "journey" view for a class/workshop — the mockup language:
 * ornamental gold-framed hero, bracketed bordered sections
 * ([ Reserve Your Seat ], [ About the Experience ]), serif title.
 * Opens from an ExperienceCard; Book Now hands off to the customize sheet.
 */
export default function ExperienceDetailSheet({ item, sessions, onClose, onBook }: ExperienceDetailSheetProps) {
  const { t } = useTranslation();
  const img = resolveAssetUrl(item.image_url);
  const desc = item.long_description || item.description || '';
  const nextSessions = sessions.slice(0, 3);
  const variantPrices = (item.variants ?? [])
    .filter((v) => v.is_available)
    .map((v) => item.base_price + Number(v.price_adjustment || 0));
  const min = Math.min(item.base_price, ...variantPrices);
  const max = Math.max(item.base_price, ...variantPrices);
  const priceText = min === max ? formatPrice(min) : `${formatPrice(min)} – ${formatPrice(max)}`;
  const location = nextSessions.find((s) => s.location)?.location || null;

  return (
    <div className="xp-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="xp-page" role="dialog" aria-label={item.item_name}>
        <button className="xp-close" onClick={onClose} aria-label={t('common.back')}>
          <X size={20} />
        </button>

        <div className="xp-scroll">
          {/* Ornamental gold-framed hero */}
          <div className="xp-hero-frame">
            <span className="xp-corner xp-corner-tl" />
            <span className="xp-corner xp-corner-tr" />
            <span className="xp-corner xp-corner-bl" />
            <span className="xp-corner xp-corner-br" />
            {img ? (
              <img src={img} alt={item.item_name} className="xp-hero-img" />
            ) : (
              <div className="xp-hero-fallback"><GraduationCap size={44} strokeWidth={1.2} /></div>
            )}
          </div>

          <h1 className="xp-title">{item.item_name}</h1>
          <div className="xp-price">{priceText} <span>{t('menu_page.per_person')}</span></div>

          {/* [ Reserve Your Seat ] */}
          <section className="xp-section">
            <h2 className="xp-section-title">{t('experience.reserve')}</h2>
            <p className="xp-section-sub">{t('experience.priorityBooking')}</p>
            <div className="xp-sessions">
              {nextSessions.length === 0 ? (
                <span className="xp-no-session">{t('workshops.noSessions')}</span>
              ) : (
                nextSessions.map((s) => (
                  <span key={s.id} className="xp-session-chip">
                    <Calendar size={12} /> {fmtDate(s.session_date)} {s.start_time}
                    <span className="xp-session-seats">
                      <Users size={11} /> {s.remaining <= 0 ? t('workshops.full') : t('workshops.seatsLeft', { count: s.remaining })}
                    </span>
                  </span>
                ))
              )}
            </div>
            {location && (
              <p className="xp-location"><MapPin size={12} /> {location}</p>
            )}
            <button className="xp-book-btn" disabled={sessions.length === 0} onClick={onBook}>
              {sessions.length === 0 ? t('workshops.noSessions') : t('workshops.book')}
            </button>
          </section>

          {/* [ About the Experience ] */}
          {desc && (
            <section className="xp-section">
              <h2 className="xp-section-title">
                <Leaf size={15} color="var(--color-gold)" /> {t('experience.about')}
              </h2>
              <p className="xp-desc">{desc}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
