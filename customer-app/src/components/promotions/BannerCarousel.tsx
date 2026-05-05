'use client';

import { motion } from 'framer-motion';
import { useTranslation } from '@/hooks/useTranslation';
import { Gift, Clock } from 'lucide-react';
import { TypePill } from '@/components/shared';
import { resolveAssetUrl } from '@/lib/tokens';
import type { PromoBanner } from '@/lib/api';

function getDaysLeft(end: string | null) {
  if (!end) return 'Ongoing';
  const diff = Math.ceil((new Date(end).getTime() - Date.now()) / 86400000);
  if (diff <= 0) return 'Ended';
  return diff === 1 ? '1 day left' : `${diff} days left`;
}

function getTagVariant(t: string | null): 'offer' | 'survey' | 'limited' | 'system' {
  if (t === 'survey') return 'survey';
  if (t === 'detail') return 'offer';
  return 'system';
}

interface BannerCarouselProps {
  promotions: PromoBanner[];
  loading: boolean;
  onSelectPromo: (promo: PromoBanner) => void;
}

export default function BannerCarousel({ promotions, loading, onSelectPromo }: BannerCarouselProps) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="promo-skeleton-list">
        {[1, 2, 3].map((i) => (<div key={i} className="skeleton promo-skeleton-card" />))}
      </div>
    );
  }

  if (promotions.length === 0) {
    return (
      <div className="promo-empty">
        <Gift size={40} className="promo-empty-icon" />
        <p className="promo-empty-title">{t('promotions.noPromotions')}</p>
        <p className="promo-empty-desc">{t('promotions.checkBackSoon')}</p>
      </div>
    );
  }

  return (
    <div className="promo-list">
      {promotions.map((promo) => {
        const img = resolveAssetUrl(promo.image_url);
        const tagText = promo.action_type === 'survey' ? t('promotions.survey') : promo.action_type === 'detail' ? t('promotions.offer') : t('promotions.promo');
        return (
          <motion.button
            key={promo.id}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectPromo(promo)}
            className="promo-list-card"
          >
            <div className="promo-list-card-thumb">
              {img ? (
                <img src={img} alt="" loading="lazy" className="promo-list-card-thumb-img" />
              ) : (
                <div className="promo-list-card-thumb-fallback">
                  <Gift size={24} strokeWidth={1.5} className="promo-list-card-thumb-icon" />
                </div>
              )}
            </div>
            <div className="promo-list-card-body">
              <div className="promo-list-card-tags">
                <TypePill variant={getTagVariant(promo.action_type)}>{tagText}</TypePill>
              </div>
              <p className="promo-list-card-title">
                {promo.title}
              </p>
              {promo.short_description && (
                <p className="promo-list-card-desc">
                  {promo.short_description}
                </p>
              )}
              <span className="promo-list-card-meta">
                <Clock size={10} /> {getDaysLeft(promo.end_date)}
              </span>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
