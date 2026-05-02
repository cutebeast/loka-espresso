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
    <div className="homepage-info-card" onClick={onClick}>
      {cardImage && <img src={cardImage} alt="" className="card-bg-img" loading="lazy" />}
      <div className="homepage-info-content">
        <span className="homepage-info-badge">{card.content_type === 'product' ? 'Product' : 'Experience'}</span>
        <div className="homepage-info-title">{card.title}</div>
        {card.short_description && <div className="homepage-info-desc">{card.short_description}</div>}
        <button className="homepage-info-btn" onClick={(e) => { e.stopPropagation(); onClick(); }}>
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
    <div className="homepage-promo-card" onClick={onClick}>
      {bannerImage && <img src={bannerImage} alt="" className="card-bg-img" loading="lazy" />}
      <div className="homepage-promo-content">
        <div className="homepage-promo-title">{banner.title}</div>
        {banner.short_description && <div className="homepage-promo-sub">{banner.short_description}</div>}
        <button className="homepage-promo-btn" onClick={(e) => { e.stopPropagation(); onClick(); }}>
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
  onViewAllPromos?: () => void;
  onViewAllDiscover?: () => void;
}

export default function HomeCarousel({ banners, loadingBanners, infoCards, productCards, loadingInfo, onPromoClick, onInfoClick, onViewAllPromos, onViewAllDiscover }: HomeCarouselProps) {
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
      {/* Discover Carousel */}
      {showDiscover && (
        <div>
          <div className="home-section-header">
            <h3 className="home-section-title">Discover</h3>
            <button className="home-see-all-link" onClick={onViewAllDiscover}>
              View all →
            </button>
          </div>
          <div className="homepage-carousel" ref={discoverScrollRef} onScroll={handleDiscoverScroll}>
            {discoverCards.map((card) => (
              <InfoCard
                key={card.id}
                card={card}
                onClick={() => onInfoClick(card.id, card.content_type || undefined)}
              />
            ))}
          </div>
          <div className="homepage-carousel-dots">
            {discoverCards.map((_, i) => (
              <button
                key={i}
                className={`homepage-dot ${i === discoverIndex ? 'active' : ''}`}
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

      {/* Promotion Carousel */}
      {showPromos && (
        <div>
          <div className="home-section-header">
            <h3 className="home-section-title">Promotions</h3>
            <button className="home-see-all-link" onClick={onViewAllPromos}>
              View all →
            </button>
          </div>
          <div className="homepage-carousel" ref={promoScrollRef} onScroll={handlePromoScroll}>
            {banners.map((banner) => (
              <PromoCard
                key={banner.id}
                banner={banner}
                onClick={() => onPromoClick(banner.id)}
              />
            ))}
          </div>
          <div className="homepage-carousel-dots">
            {banners.map((_, i) => (
              <button
                key={i}
                className={`homepage-dot ${i === promoIndex ? 'active' : ''}`}
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
