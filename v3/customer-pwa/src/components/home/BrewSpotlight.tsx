'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { resolveAssetUrl, formatPrice } from '@/lib/tokens';
import { useTranslation } from '@/hooks/useTranslation';
import { useUIStore } from '@/stores/uiStore';

interface ProductCard {
  id: number;
  title: string;
  short_description?: string | null;
  image_url?: string | null;
  price?: number | null;
  action_url?: string | null;
  action_label?: string | null;
}

/** "The Daily Brew Spotlight" — origin-story card from the product_cards
 * content (mockup: INSIDER ACCESS HUB → THE DAILY BREW SPOTLIGHT). */
export default function BrewSpotlight() {
  const { t } = useTranslation();
  const { setPage } = useUIStore();
  const [card, setCard] = useState<ProductCard | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get('/content/products', { params: { limit: 1 } })
      .then((res) => {
        if (cancelled) return;
        const list: ProductCard[] = Array.isArray(res.data) ? res.data : [];
        setCard(list[0] || null);
      })
      .catch(() => setCard(null));
    return () => { cancelled = true; };
  }, []);

  if (!card) return null;
  const img = resolveAssetUrl(card.image_url);

  return (
    <div className="home-extra-card home-spotlight">
      <div className="home-extra-title">{t('homeExtras.brewSpotlight')}</div>
      <div className="home-spotlight-row">
        {img && <img src={img} alt={card.title} className="home-spotlight-img" loading="lazy" />}
        <div className="home-spotlight-body">
          <div className="home-spotlight-name">{card.title}</div>
          {card.short_description && <div className="home-spotlight-desc">{card.short_description}</div>}
          {card.price != null && <div className="home-spotlight-price">{formatPrice(card.price)}</div>}
          <button
            className="home-spotlight-btn"
            onClick={() => {
              const url = card.action_url || '#menu';
              if (url.startsWith('#')) setPage(url.slice(1) as never);
            }}
          >
            {card.action_label || t('homeExtras.orderNow')}
          </button>
        </div>
      </div>
    </div>
  );
}
