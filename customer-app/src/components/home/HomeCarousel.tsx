'use client';

import { useCallback, useRef, useState, memo } from 'react';
import { resolveAssetUrl } from '@/lib/tokens';
import type { PromoBanner, InformationCard } from '@/lib/api';

const InfoCard = memo(function InfoCard({
  card,
  onClick,
}: {
  card: InformationCard;
  onClick: () => void;
}) {
  const cardImage = resolveAssetUrl(card.image_url);
  return (
    <div className="info-card" onClick={onClick}>
      {cardImage && <img src={cardImage} alt="" className="card-bg-img" loading="lazy" />}
      <div className="info-content">
        <span className="info-badge">Discover</span>
        <div className="info-title">{card.title}</div>
        {card.short_description && <div className="info-desc">{card.short_description}</div>}
        <button className="info-btn" onClick={(e) => { e.stopPropagation(); onClick(); }}>
          Learn more
        </button>
      </div>
    </div>
  );
});

const PromoCard = memo(function PromoCard({
  banner,
  onClick,
}: {
  banner: PromoBanner;
  onClick: () => void;
}) {
  const bannerImage = resolveAssetUrl(banner.image_url);
  return (
    <div className="promo-card" onClick={onClick}>
      {bannerImage && <img src={bannerImage} alt="" className="card-bg-img" loading="lazy" />}
      <div className="promo-content">
        <div className="promo-title">{banner.title}</div>
        {banner.short_description && <div className="promo-sub">{banner.short_description}</div>}
        <button className="promo-btn" onClick={(e) => { e.stopPropagation(); onClick(); }}>
          {banner.action_type === 'survey' ? 'Take survey' : banner.action_type === 'detail' ? 'Learn more' : 'View'}
        </button>
      </div>
    </div>
  );
});

interface HomeCarouselProps {
  banners: PromoBanner[];
  loadingBanners: boolean;
  infoCards: InformationCard[];
  loadingInfo: boolean;
  onPromoClick: (id: number) => void;
  onInfoClick: (id: number) => void;
}

export default function HomeCarousel({ banners, loadingBanners, infoCards, loadingInfo, onPromoClick, onInfoClick }: HomeCarouselProps) {
  const promoScrollRef = useRef<HTMLDivElement>(null);
  const infoScrollRef = useRef<HTMLDivElement>(null);
  const [promoIndex, setPromoIndex] = useState(0);
  const [infoIndex, setInfoIndex] = useState(0);
  const promoIndexRef = useRef(0);
  const infoIndexRef = useRef(0);

  const visibleInfoCards = infoCards.slice(0, 3);
  const showPromos = !loadingBanners && banners.length > 0;
  const showInfoCards = !loadingInfo && visibleInfoCards.length > 0;

  const handlePromoScroll = useCallback(() => {
    const el = promoScrollRef.current;
    if (!el) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    const clamped = Math.min(Math.max(index, 0), banners.length - 1);
    if (clamped !== promoIndexRef.current) {
      promoIndexRef.current = clamped;
      setPromoIndex(clamped);
    }
  }, [banners.length]);

  const handleInfoScroll = useCallback(() => {
    const el = infoScrollRef.current;
    if (!el) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    const clamped = Math.min(Math.max(index, 0), Math.min(infoCards.length, 3) - 1);
    if (clamped !== infoIndexRef.current) {
      infoIndexRef.current = clamped;
      setInfoIndex(clamped);
    }
  }, [infoCards.length]);

  return (
    <>
      {/* Information Carousel */}
      {showInfoCards && (
        <div>
          <div className="carousel" ref={infoScrollRef} onScroll={handleInfoScroll}>
            {visibleInfoCards.map((card) => (
              <InfoCard
                key={card.id}
                card={card}
                onClick={() => onInfoClick(card.id)}
              />
            ))}
          </div>
          <div className="carousel-dots">
            {visibleInfoCards.map((_, i) => (
              <button
                key={i}
                className={`dot ${i === infoIndex ? 'active' : ''}`}
                onClick={() => {
                  const el = infoScrollRef.current;
                  if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
                }}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Promotion Carousel */}
      {showPromos && (
        <div>
          <div className="carousel" ref={promoScrollRef} onScroll={handlePromoScroll}>
            {banners.map((banner) => (
              <PromoCard
                key={banner.id}
                banner={banner}
                onClick={() => onPromoClick(banner.id)}
              />
            ))}
          </div>
          <div className="carousel-dots">
            {banners.map((_, i) => (
              <button
                key={i}
                className={`dot ${i === promoIndex ? 'active' : ''}`}
                onClick={() => {
                  const el = promoScrollRef.current;
                  if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
                }}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
