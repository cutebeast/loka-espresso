'use client';

import { useCallback, useRef, useState, memo, useMemo } from 'react';
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
        <span className="info-badge">{card.content_type === 'product' ? 'Product' : 'Experience'}</span>
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
  productCards: InformationCard[];
  loadingInfo: boolean;
  onPromoClick: (id: number) => void;
  onInfoClick: (id: number, contentType?: string) => void;
}

export default function HomeCarousel({ banners, loadingBanners, infoCards, productCards, loadingInfo, onPromoClick, onInfoClick }: HomeCarouselProps) {
  const promoScrollRef = useRef<HTMLDivElement>(null);
  const discoverScrollRef = useRef<HTMLDivElement>(null);
  const [promoIndex, setPromoIndex] = useState(0);
  const [discoverIndex, setDiscoverIndex] = useState(0);
  const promoIndexRef = useRef(0);
  const discoverIndexRef = useRef(0);

  // Interleave info and product cards: info[0], product[0], info[1], product[1], ...
  const discoverCards = useMemo(() => {
    const result: InformationCard[] = [];
    const maxLen = Math.max(infoCards.length, productCards.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < infoCards.length) result.push(infoCards[i]);
      if (i < productCards.length) result.push(productCards[i]);
    }
    return result.slice(0, 6);
  }, [infoCards, productCards]);

  const showPromos = !loadingBanners && banners.length > 0;
  const showDiscover = !loadingInfo && discoverCards.length > 0;

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

  const handleDiscoverScroll = useCallback(() => {
    const el = discoverScrollRef.current;
    if (!el) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    const clamped = Math.min(Math.max(index, 0), discoverCards.length - 1);
    if (clamped !== discoverIndexRef.current) {
      discoverIndexRef.current = clamped;
      setDiscoverIndex(clamped);
    }
  }, [discoverCards.length]);

  return (
    <>
      {/* Combined Discover Carousel (info + product alternating) — no title */}
      {showDiscover && (
        <div>
          <div className="carousel" ref={discoverScrollRef} onScroll={handleDiscoverScroll}>
            {discoverCards.map((card) => (
              <InfoCard
                key={card.id}
                card={card}
                onClick={() => onInfoClick(card.id, card.content_type || undefined)}
              />
            ))}
          </div>
          <div className="carousel-dots">
            {discoverCards.map((_, i) => (
              <button
                key={i}
                className={`dot ${i === discoverIndex ? 'active' : ''}`}
                onClick={() => {
                  const el = discoverScrollRef.current;
                  if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
                }}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Promotion Carousel — no title */}
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
