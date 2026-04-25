'use client';

import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { motion } from 'framer-motion';
import {
  Wallet,
  Crown,
  Gift,
  Ticket,
  ChevronRight,
  Plus,
  ArrowRight,
  Coffee,
} from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useCartStore } from '@/stores/cartStore';
import { useWalletStore } from '@/stores/walletStore';
import api from '@/lib/api';
import type { MenuItem, PromoBanner, InformationCard, CustomizationOption } from '@/lib/api';
import ItemCustomizeSheet from '@/components/menu/ItemCustomizeSheet';
import { formatPrice, resolveAssetUrl } from '@/lib/tokens';

/* ── Memoized carousel cards to prevent re-render flash ── */
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

const ProductCard = memo(function ProductCard({
  item,
  onAdd,
}: {
  item: MenuItem;
  onAdd: () => void;
}) {
  const imgSrc = resolveAssetUrl(item.image_url);
  return (
    <div className="product-card">
      <div className="product-img">
        {imgSrc ? (
          <img src={imgSrc} alt="" className="card-bg-img" loading="lazy" />
        ) : (
        <div className="home-img-fallback">
            <Coffee size={24} strokeWidth={1.5} color="#C4CED8" />
          </div>
        )}
      </div>
      <div className="product-info">
        <div className="product-name">{item.name}</div>
        <div className="product-price">{formatPrice(item.base_price)}</div>
        <button className="add-btn" onClick={(e) => { e.stopPropagation(); onAdd(); }}>
          <Plus size={12} strokeWidth={2.5} /> Add
        </button>
      </div>
    </div>
  );
});

export default function HomePage() {
  const { setPage, showToast, isGuest } = useUIStore();
  const addItem = useCartStore((s) => s.addItem);
  const { balance, points } = useWalletStore();

  const [featuredItems, setFeaturedItems] = useState<MenuItem[]>([]);
  const [loadingFeatured, setLoadingFeatured] = useState(true);
  const [banners, setBanners] = useState<PromoBanner[]>([]);
  const [loadingBanners, setLoadingBanners] = useState(true);
  const [infoCards, setInfoCards] = useState<InformationCard[]>([]);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [promoIndex, setPromoIndex] = useState(0);
  const [infoIndex, setInfoIndex] = useState(0);
  const [customizeItem, setCustomizeItem] = useState<MenuItem | null>(null);
  const [availableOptions, setAvailableOptions] = useState<CustomizationOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const promoScrollRef = useRef<HTMLDivElement>(null);
  const infoScrollRef = useRef<HTMLDivElement>(null);
  const promoIndexRef = useRef(0);
  const infoIndexRef = useRef(0);

  const loadFeatured = useCallback(async () => {
    setLoadingFeatured(true);
    try {
      const res = await api.get(`/menu/items`, {
        params: { featured: true, available_only: true, limit: 10 },
      });
      let list: MenuItem[] = Array.isArray(res.data) ? res.data : [];
      if (list.length === 0) {
        const all = await api.get(`/menu/items`, {
          params: { available_only: true, limit: 8 },
        });
        list = Array.isArray(all.data) ? all.data : [];
      }
      setFeaturedItems(list.slice(0, 10));
    } catch {
      setFeaturedItems([]);
    } finally {
      setLoadingFeatured(false);
    }
  }, []);

  const loadBanners = useCallback(async () => {
    setLoadingBanners(true);
    try {
      const res = await api.get('/promos/banners');
      const data = Array.isArray(res.data) ? res.data : [];
      const now = new Date();
      const active = data.filter((b: PromoBanner) => {
        if (!b.start_date || !b.end_date) return true;
        return new Date(b.start_date) <= now && new Date(b.end_date) >= now;
      });
      setBanners(active);
    } catch {
      setBanners([]);
    } finally {
      setLoadingBanners(false);
    }
  }, []);

  const loadInfoCards = useCallback(async () => {
    setLoadingInfo(true);
    try {
      const res = await api.get('/content/information?limit=3&content_type=information');
      setInfoCards(Array.isArray(res.data) ? res.data : []);
    } catch {
      try {
        const res = await api.get('/promos/banners');
        const data = Array.isArray(res.data) ? res.data : [];
        const now = new Date();
        const detailBanners = data
          .filter((b: PromoBanner) => {
            const inRange =
              !b.start_date ||
              !b.end_date ||
              (new Date(b.start_date) <= now && new Date(b.end_date) >= now);
            return inRange && b.action_type === 'detail';
          })
          .map((b: PromoBanner) => ({
            id: b.id,
            title: b.title,
            short_description: b.short_description,
            action_type: b.action_type,
            image_url: b.image_url,
          }));
        setInfoCards(detailBanners);
      } catch {
        setInfoCards([]);
      }
    } finally {
      setLoadingInfo(false);
    }
  }, []);

  useEffect(() => {
    loadFeatured();
    loadBanners();
    loadInfoCards();
  }, [loadFeatured, loadBanners, loadInfoCards]);

  /* ── Throttled scroll: only update state when index actually changes ── */
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

  const handleAddToCart = (item: MenuItem) => {
    if (isGuest) {
      showToast('Sign in to order', 'info');
      return;
    }
    if (item.customization_options && item.customization_options.length > 0) {
      setCustomizeItem(item);
      loadCustomizations(item);
    } else {
      addItem({
        menu_item_id: item.id,
        name: item.name,
        price: item.base_price,
        quantity: 1,
        customizations: {},
      });
      showToast(`${item.name} added`, 'success');
    }
  };

  const loadCustomizations = useCallback(async (item: MenuItem) => {
    setLoadingOptions(true);
    try {
      const res = await api.get(`/menu/items/${item.id}/customizations`);
      setAvailableOptions(res.data ?? []);
    } catch {
      setAvailableOptions(item.customization_options ?? []);
    } finally {
      setLoadingOptions(false);
    }
  }, []);

  const handleCustomizeAdd = useCallback(
    (
      item: MenuItem,
      quantity: number,
      customizations: { id: number; name: string; option_type: string; price_adjustment: number }[],
      totalPrice: number,
    ) => {
      addItem({
        menu_item_id: item.id,
        name: item.name,
        price: totalPrice,
        quantity,
        customizations:
          customizations.length > 0
            ? { options: customizations.map((o) => ({ id: o.id, name: o.name, price_adjustment: o.price_adjustment })) }
            : {},
        customization_option_ids: customizations.length > 0 ? customizations.map((o) => o.id) : [],
      });
      showToast(`${item.name} added`, 'success');
    },
    [addItem, showToast],
  );

  const visibleInfoCards = infoCards.slice(0, 3);
  const showPromos = !loadingBanners && banners.length > 0;
  const showInfoCards = !loadingInfo && visibleInfoCards.length > 0;

  const pageVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.08, delayChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
  };

  return (
    <>
      <motion.div
        className="home-main"
        variants={pageVariants}
        initial="hidden"
        animate="show"
      >
        {/* Wallet Card — or guest sign-in prompt */}
        <motion.div variants={itemVariants}>
          {isGuest ? (
            <div className="wallet-card wallet-card-guest" onClick={() => {
              useUIStore.getState().setIsGuest(false);
            }}>
              <div className="wallet-row">
                <span className="balance-label">
                  <Wallet size={14} strokeWidth={2} /> Loka Wallet
                </span>
              </div>
              <div className="wallet-row wallet-row-mt">
                <span className="guest-wallet-text">Sign in to access wallet & rewards</span>
              </div>
              <div className="wallet-chip-row">
                <span className="wallet-chip wallet-chip-signin">
                  <ArrowRight size={12} strokeWidth={2} /> Sign In
                </span>
              </div>
            </div>
          ) : (
            <>
            <div className="wallet-row">
              <span className="balance-label">
                <Wallet size={14} strokeWidth={2} /> Loka Balance
              </span>
              <button
                className="topup-btn"
                onClick={(e) => { e.stopPropagation(); setPage('wallet'); }}
              >
                Top Up <ChevronRight size={12} />
              </button>
            </div>
            <div className="wallet-row wallet-row-mt">
              <span className="amount">{formatPrice(balance)}</span>
              <span className="points-badge">
                <Crown size={12} strokeWidth={2} /> {points.toLocaleString()} pts
              </span>
            </div>
            <div className="wallet-chip-row">
              <span className="wallet-chip" onClick={(e) => { e.stopPropagation(); setPage('my-rewards', { initialTab: 'rewards' }); }}>
                <Gift size={12} strokeWidth={2} /> Rewards
              </span>
              <span className="wallet-chip" onClick={(e) => { e.stopPropagation(); setPage('my-rewards', { initialTab: 'vouchers' }); }}>
                <Ticket size={12} strokeWidth={2} /> Vouchers
              </span>
            </div>
            </>
          )}
        </motion.div>

        {/* Information Carousel — plain div, no motion wrapper */}
        {showInfoCards && (
          <div>
            <div className="carousel" ref={infoScrollRef} onScroll={handleInfoScroll}>
              {visibleInfoCards.map((card) => (
                <InfoCard
                  key={card.id}
                  card={card}
                  onClick={() => setPage('information', { selectedInfoId: card.id })}
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

        {/* Promotion Carousel — plain div, no motion wrapper */}
        {showPromos && (
          <div>
            <div className="carousel" ref={promoScrollRef} onScroll={handlePromoScroll}>
              {banners.map((banner) => (
                <PromoCard
                  key={banner.id}
                  banner={banner}
                  onClick={() => setPage('promotions', { selectedPromoId: banner.id })}
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

        {/* Today's Picks */}
        <motion.div variants={itemVariants}>
          <div className="home-section-header">
            <h3 className="home-section-title">Today&apos;s picks</h3>
            <button
              onClick={() => setPage('menu')}
              className="link home-see-all-link"
            >
              See all <ArrowRight size={12} />
            </button>
          </div>

          {loadingFeatured ? (
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
              <p className="home-empty-text">No items available yet</p>
            </div>
          ) : (
            <div className="product-scroll">
              {featuredItems.slice(0, 8).map((item) => (
                <ProductCard
                  key={item.id}
                  item={item}
                  onAdd={() => handleAddToCart(item)}
                />
              ))}
            </div>
          )}
        </motion.div>
      </motion.div>

      <ItemCustomizeSheet
        item={customizeItem}
        isOpen={!!customizeItem}
        onClose={() => {
          setCustomizeItem(null);
          setAvailableOptions([]);
        }}
        onAdd={handleCustomizeAdd}
        loadingOptions={loadingOptions}
        customizations={availableOptions}
      />
    </>
  );
}
