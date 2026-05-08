'use client';

import { memo, useRef } from 'react';
import { Coffee } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { formatPrice, resolveAssetUrl, LOKA } from '@/lib/tokens';
import { useFitText } from '@/hooks/useFitText';
import type { MenuItem } from '@/lib/api';
import { Plus, ArrowRight } from 'lucide-react';

const ProductCard = memo(function ProductCard({
  item,
  onAdd,
}: {
  item: MenuItem;
  onAdd: () => void;
}) {
  const { t } = useTranslation();
  const imgSrc = resolveAssetUrl(item.image_url);
  const priceRef = useRef<HTMLDivElement>(null);
  useFitText(priceRef, [item.base_price], 10, 0.5);
  return (
    <div className="product-card">
      <div className="product-img">
        {imgSrc ? (
          <img src={imgSrc} alt="" className="card-bg-img" loading="lazy" />
        ) : (
        <div className="home-img-fallback">
            <Coffee size={24} strokeWidth={1.5} color={LOKA.border} />
          </div>
        )}
      </div>
      <div className="product-info">
        <div className="product-name">{item.name}</div>
        <div className="product-price" ref={priceRef}>{formatPrice(item.base_price)}</div>
        <button className="add-btn" onClick={(e) => { e.stopPropagation(); onAdd(); }}>
          <Plus size={12} strokeWidth={2.5} /> {t('home.add')}
        </button>
      </div>
    </div>
  );
});

interface PromotionsSectionProps {
  featuredItems: MenuItem[];
  loading: boolean;
  onAddToCart: (item: MenuItem) => void;
  onSeeAll: () => void;
}

export default function PromotionsSection({ featuredItems, loading, onAddToCart, onSeeAll }: PromotionsSectionProps) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="home-section-header">
        <h3 className="home-section-title">{t('home.todaysPicks')}</h3>
        <button
          onClick={onSeeAll}
          className="link home-see-all-link"
        >
          {t('home.seeAll')} <ArrowRight size={12} />
        </button>
      </div>

      {loading ? (
        <div className="product-scroll">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="product-card home-skeleton-card">
              <div className="product-img">
                <div className="skeleton home-skeleton-img" />
              </div>
              <div className="product-info">
                <div className="skeleton home-skeleton-name" />
                <div className="skeleton home-skeleton-price" />
                <div className="skeleton home-skeleton-btn" />
              </div>
            </div>
          ))}
        </div>
      ) : featuredItems.length === 0 ? (
        <div className="home-empty">
          <div className="home-empty-icon"><Coffee size={32} strokeWidth={1.5} /></div>
          <p className="home-empty-text">{t('home.noItemsAvailable')}</p>
        </div>
      ) : (
        <div className="product-scroll">
          {featuredItems.slice(0, 8).map((item) => (
            <ProductCard
              key={item.id}
              item={item}
              onAdd={() => onAddToCart(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
