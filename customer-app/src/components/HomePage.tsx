'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  Clock,
  Sparkles,
} from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useCartStore } from '@/stores/cartStore';
import { useWalletStore } from '@/stores/walletStore';
import api from '@/lib/api';
import type { MenuItem, PromoBanner, InformationCard, CustomizationOption } from '@/lib/api';
import ItemCustomizeSheet from '@/components/menu/ItemCustomizeSheet';

import { LOKA, formatPrice } from '@/lib/tokens';

export default function HomePage() {
  const { setPage, showToast } = useUIStore();
  const addItem = useCartStore((s) => s.addItem);
  const { balance, points, tier } = useWalletStore();

  const [featuredItems, setFeaturedItems] = useState<MenuItem[]>([]);
  const [loadingFeatured, setLoadingFeatured] = useState(true);
  const [banners, setBanners] = useState<PromoBanner[]>([]);
  const [loadingBanners, setLoadingBanners] = useState(true);
  const [infoCards, setInfoCards] = useState<InformationCard[]>([]);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [promoIndex, setPromoIndex] = useState(0);
  const [infoIndex, setInfoIndex] = useState(0);
  const promoScrollRef = useRef<HTMLDivElement>(null);
  const infoScrollRef = useRef<HTMLDivElement>(null);

  const loadFeatured = useCallback(async () => {
    setLoadingFeatured(true);
    try {
      // Universal HQ menu (store_id=0) – admin-marked featured items
      // for the "Today's recommendations" section.
      const res = await api.get('/stores/0/items', {
        params: { featured: true, available_only: true, limit: 10 },
      });
      let list: MenuItem[] = Array.isArray(res.data) ? res.data : [];
      // Fallback: if admin hasn't marked any featured yet, show the
      // first handful of items so the section is never empty.
      if (list.length === 0) {
        const all = await api.get('/stores/0/items', {
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
      // Limit to 3 promotional cards (excludes system content like T&C)
      const res = await api.get('/content/information?limit=3');
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
              (new Date(b.start_date) <= now &&
                new Date(b.end_date) >= now);
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

  const handlePromoScroll = () => {
    const el = promoScrollRef.current;
    if (!el) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    setPromoIndex(index);
  };

  const handleInfoScroll = () => {
    const el = infoScrollRef.current;
    if (!el) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    setInfoIndex(index);
  };

  const handleAddToCart = (item: MenuItem) => {
    if (item.customization_options && item.customization_options.length > 0) {
      setCustomizeItem(item);
      loadCustomizations(item);
    } else {
      addItem(
        {
          menu_item_id: item.id,
          name: item.name,
          price: item.base_price,
          quantity: 1,
          customizations: {},
        },
        0,
      );
      showToast(`${item.name} added`, 'success');
    }
  };

  const loadCustomizations = useCallback(async (item: MenuItem) => {
    setLoadingOptions(true);
    try {
      const res = await api.get(`/stores/0/items/${item.id}/customizations`);
      setAvailableOptions(res.data ?? []);
    } catch {
      setAvailableOptions(item.customization_options ?? []);
    } finally {
      setLoadingOptions(false);
    }
  }, []);

  const handleCustomizeAdd = useCallback(
    (item: MenuItem, quantity: number, customizations: { id: number; name: string; option_type: string; price_adjustment: number }[], totalPrice: number) => {
      addItem(
        {
          menu_item_id: item.id,
          name: item.name,
          price: totalPrice,
          quantity,
          customizations: customizations.length > 0
            ? customizations.reduce<Record<string, unknown>>((acc, o) => {
                acc[o.name] = { id: o.id, type: o.option_type, price: o.price_adjustment };
                return acc;
              }, {})
            : {},
        },
        0,
      );
      showToast(`${item.name} added`, 'success');
    },
    [addItem, showToast],
  );

  const [customizeItem, setCustomizeItem] = useState<MenuItem | null>(null);
  const [availableOptions, setAvailableOptions] = useState<CustomizationOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const getBannerAction = (banner: PromoBanner): string => {
    if (banner.action_type === 'survey') return 'Take survey';
    if (banner.action_type === 'detail') return 'Learn more';
    return 'View';
  };

  const showPromos = !loadingBanners && banners.length > 0;
  const showInfoCards = !loadingInfo && infoCards.length > 0;

  const pageVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05, delayChildren: 0.05 },
    },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="show"
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        background: LOKA.bg,
      }}
    >
      {/* ============== WALLET / LOYALTY HERO CARD ============== */}
      <motion.div
        variants={itemVariants}
        style={{
          position: 'relative',
          borderRadius: 28,
          padding: 20,
          color: LOKA.white,
          background: `linear-gradient(135deg, ${LOKA.primaryDark} 0%, ${LOKA.primary} 55%, ${LOKA.primaryDeep} 100%)`,
          boxShadow: '0 18px 36px -14px rgba(31,44,11,0.55)',
          overflow: 'hidden',
        }}
      >
        {/* Decorative coffee-bean halo */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: -60,
            right: -40,
            width: 220,
            height: 220,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(209,142,56,0.22) 0%, rgba(209,142,56,0) 65%)',
            pointerEvents: 'none',
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            bottom: -80,
            left: -60,
            width: 200,
            height: 200,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 65%)',
            pointerEvents: 'none',
          }}
        />

        <div style={{ position: 'relative' }}>
          <div className="flex items-center justify-between">
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                fontWeight: 500,
                opacity: 0.9,
              }}
            >
              <Wallet size={14} /> Loka Balance
            </span>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setPage('wallet')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 13,
                fontWeight: 600,
                color: LOKA.copperLight,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Top Up <ChevronRight size={14} />
            </motion.button>
          </div>

          <div
            className="flex items-end justify-between"
            style={{ marginTop: 6, gap: 12 }}
          >
            <span
              style={{
                fontSize: 36,
                fontWeight: 800,
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
              }}
            >
              {formatPrice(balance)}
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 999,
                background: LOKA.copperSoft,
                border: `1px solid ${LOKA.copperMid}`,
                fontSize: 13,
                fontWeight: 700,
                color: LOKA.copperLight,
                whiteSpace: 'nowrap',
              }}
            >
              <Crown size={13} strokeWidth={2.4} />
              {points.toLocaleString()} pts
            </span>
          </div>

          <div
            className="flex items-center"
            style={{ marginTop: 8, gap: 6, fontSize: 12, opacity: 0.75 }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: LOKA.copperLight,
              }}
            />
            <span style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
              {tier || 'Bronze'} Member
            </span>
          </div>

          <div className="flex" style={{ gap: 8, marginTop: 18 }}>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setPage('my-rewards', { initialTab: 'rewards' })}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 16px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.10)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: LOKA.white,
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                backdropFilter: 'blur(6px)',
              }}
            >
              <Gift size={14} /> Rewards
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setPage('my-rewards', { initialTab: 'vouchers' })}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 16px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.10)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: LOKA.white,
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                backdropFilter: 'blur(6px)',
              }}
            >
              <Ticket size={14} /> Vouchers
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* ============== PROMO CAROUSEL ============== */}
      {showPromos && (
        <motion.div variants={itemVariants} style={{ position: 'relative' }}>
          <div
            className="flex items-baseline justify-between"
            style={{ marginBottom: 10 }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: LOKA.copper,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}
              >
                <Gift size={11} style={{ display: 'inline', marginRight: 4 }} />
                Special Offers
              </div>
              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: LOKA.textPrimary,
                  letterSpacing: '-0.01em',
                  marginTop: 2,
                }}
              >
                Promotions
              </h3>
            </div>
            <button
              onClick={() => setPage('promotions')}
              style={{
                color: LOKA.primary,
                fontSize: 13,
                fontWeight: 600,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              See all <ArrowRight size={12} />
            </button>
          </div>
          <div
            ref={promoScrollRef}
            onScroll={handlePromoScroll}
            className="scrollbar-hide"
            style={{
              display: 'flex',
              gap: 14,
              overflowX: 'auto',
              scrollSnapType: 'x mandatory',
              paddingBottom: 4,
            }}
          >
            {banners.map((banner) => {
              const bImg = banner.image_url
                ? banner.image_url.startsWith('http')
                  ? banner.image_url
                  : `https://admin.loyaltysystem.uk${banner.image_url}`
                : null;
              return (
                <motion.button
                  key={banner.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setPage('promotions', { selectedPromoId: banner.id })}
                  style={{
                    flex: '0 0 85%',
                    scrollSnapAlign: 'start',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: 16,
                    background: '#F2F6EA',
                    border: `1px solid rgba(56,75,22,0.10)`,
                    borderLeft: `5px solid ${LOKA.copper}`,
                    borderRadius: 20,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      flexShrink: 0,
                      borderRadius: 16,
                      overflow: 'hidden',
                      background: '#E8EDE0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {bImg ? (
                      <img
                        src={bImg}
                        alt={banner.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <Gift size={22} color={LOKA.primary} strokeWidth={1.5} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: LOKA.textPrimary, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {banner.title}
                    </div>
                    {banner.short_description && (
                      <div style={{ marginTop: 3, fontSize: 12, color: LOKA.textSecondary, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {banner.short_description}
                      </div>
                    )}
                    <div style={{ marginTop: 8 }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          background: LOKA.primary,
                          color: LOKA.white,
                          padding: '5px 12px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {getBannerAction(banner)} <ArrowRight size={11} />
                      </span>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
          {banners.length > 1 && (
            <div
              className="flex justify-center"
              style={{ gap: 6, marginTop: 8 }}
            >
              {banners.map((_, i) => (
                <span
                  key={i}
                  style={{
                    height: 6,
                    width: i === promoIndex ? 22 : 6,
                    borderRadius: 999,
                    background: i === promoIndex ? LOKA.primary : LOKA.border,
                    transition: 'all 0.25s ease',
                  }}
                />
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* ============== INFORMATION / FEATURE CARDS ============== */}
      {showInfoCards && (
        <motion.div variants={itemVariants} style={{ position: 'relative' }}>
          <div
            className="flex items-baseline justify-between"
            style={{ marginBottom: 10 }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: LOKA.copper,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}
              >
                <Sparkles size={11} style={{ display: 'inline', marginRight: 4 }} />
                Discover
              </div>
              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: LOKA.textPrimary,
                  letterSpacing: '-0.01em',
                  marginTop: 2,
                }}
              >
                What&apos;s New
              </h3>
            </div>
            <button
              onClick={() => setPage('information')}
              style={{
                color: LOKA.primary,
                fontSize: 13,
                fontWeight: 600,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              See all <ArrowRight size={12} />
            </button>
          </div>
          <div
            ref={infoScrollRef}
            onScroll={handleInfoScroll}
            className="scrollbar-hide"
            style={{
              display: 'flex',
              gap: 14,
              overflowX: 'auto',
              scrollSnapType: 'x mandatory',
              paddingBottom: 4,
            }}
          >
            {infoCards.slice(0, 3).map((card) => (
              <motion.button
                key={card.id}
                whileTap={{ scale: 0.985 }}
                onClick={() => setPage('information', { selectedInfoId: card.id })}
                style={{
                  flex: '0 0 85%',
                  scrollSnapAlign: 'start',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: 16,
                  background: LOKA.cream,
                  border: `1px solid rgba(209,142,56,0.35)`,
                  borderRadius: 20,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {card.image_url ? (
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      flexShrink: 0,
                      borderRadius: 16,
                      overflow: 'hidden',
                      background: '#EBE2D2',
                    }}
                  >
                    <img
                      src={
                        card.image_url.startsWith('http')
                          ? card.image_url
                          : `https://admin.loyaltysystem.uk${card.image_url}`
                      }
                      alt={card.title}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      flexShrink: 0,
                      borderRadius: 16,
                      background: '#FFFFFF',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: `1px solid rgba(209,142,56,0.3)`,
                    }}
                  >
                    <Sparkles size={26} style={{ color: LOKA.brown }} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4
                    style={{
                      fontWeight: 700,
                      fontSize: 15,
                      color: LOKA.textPrimary,
                      margin: 0,
                      marginBottom: 4,
                    }}
                  >
                    {card.title}
                  </h4>
                  {card.short_description && (
                    <p
                      style={{
                        fontSize: 13,
                        color: LOKA.textSecondary,
                        lineHeight: 1.4,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {card.short_description}
                    </p>
                  )}
                </div>
                <ChevronRight
                  size={20}
                  style={{ color: LOKA.primary, flexShrink: 0 }}
                />
              </motion.button>
            ))}
          </div>
          {infoCards.length > 1 && (
            <div
              className="flex justify-center"
              style={{ gap: 6, marginTop: 8 }}
            >
              {infoCards.slice(0, 3).map((_, i) => (
                <span
                  key={i}
                  style={{
                    height: 6,
                    width: i === infoIndex ? 22 : 6,
                    borderRadius: 999,
                    background: i === infoIndex ? LOKA.primary : LOKA.border,
                    transition: 'all 0.25s ease',
                  }}
                />
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* ============== TODAY'S RECOMMENDATIONS ============== */}
      <motion.div variants={itemVariants}>
        <div
          className="flex items-baseline justify-between"
          style={{ marginBottom: 10 }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: LOKA.copper,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              <Clock size={11} style={{ display: 'inline', marginRight: 4 }} />
              Today
            </div>
            <h3
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: LOKA.textPrimary,
                letterSpacing: '-0.01em',
                marginTop: 2,
              }}
            >
              Recommended for you
            </h3>
          </div>
          <button
            onClick={() => setPage('menu')}
            style={{
              color: LOKA.primary,
              fontSize: 13,
              fontWeight: 600,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            See all <ArrowRight size={12} />
          </button>
        </div>

        {loadingFeatured ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  background: LOKA.white,
                  borderRadius: 18,
                  border: `1px solid ${LOKA.borderSubtle}`,
                }}
              >
                <div style={{ width: 60, height: 60, borderRadius: 14, background: LOKA.surface, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ height: 13, background: LOKA.surface, borderRadius: 4, width: '65%', marginBottom: 6 }} />
                  <div style={{ height: 11, background: LOKA.surface, borderRadius: 4, width: '40%' }} />
                </div>
                <div style={{ width: 32, height: 32, borderRadius: 999, background: LOKA.surface }} />
              </div>
            ))}
          </div>
        ) : featuredItems.length === 0 ? (
          <div
            style={{
              fontSize: 13,
              padding: '24px 16px',
              textAlign: 'center',
              width: '100%',
              color: LOKA.textMuted,
              background: LOKA.white,
              borderRadius: 18,
              border: `1px dashed ${LOKA.border}`,
            }}
          >
            No items available yet
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {featuredItems.slice(0, 5).map((item) => {
              const imgSrc = item.image_url
                ? item.image_url.startsWith('http')
                  ? item.image_url
                  : `https://admin.loyaltysystem.uk${item.image_url}`
                : null;
              return (
                <motion.div
                  key={item.id}
                  whileTap={{ scale: 0.98 }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: 10,
                    background: LOKA.white,
                    borderRadius: 18,
                    border: `1px solid ${LOKA.borderSubtle}`,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  }}
                >
                  <div
                    style={{
                      width: 60,
                      height: 60,
                      flexShrink: 0,
                      borderRadius: 14,
                      overflow: 'hidden',
                      background: imgSrc ? '#EFEAE0' : `linear-gradient(135deg, #F2F6EA 0%, ${LOKA.cream} 100%)`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {imgSrc ? (
                      <img
                        src={imgSrc}
                        alt={item.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <Coffee size={24} style={{ color: LOKA.brown }} strokeWidth={1.5} />
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: LOKA.textPrimary,
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        lineHeight: 1.3,
                      }}
                    >
                      {item.name}
                    </div>
                    {item.description && (
                      <div
                        style={{
                          fontSize: 11,
                          color: LOKA.textMuted,
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis',
                          marginTop: 2,
                          lineHeight: 1.3,
                        }}
                      >
                        {item.description}
                      </div>
                    )}
                    <div style={{ fontSize: 13, fontWeight: 800, color: LOKA.primary, marginTop: 4 }}>
                      {formatPrice(item.base_price)}
                    </div>
                  </div>

                  <motion.button
                    whileTap={{ scale: 0.88 }}
                    onClick={() => handleAddToCart(item)}
                    style={{
                      width: 34,
                      height: 34,
                      flexShrink: 0,
                      borderRadius: 999,
                      background: LOKA.primary,
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Plus size={16} color={LOKA.white} strokeWidth={2.5} />
                  </motion.button>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>

      <div style={{ height: 8 }} />

      <ItemCustomizeSheet
        item={customizeItem}
        isOpen={!!customizeItem}
        onClose={() => { setCustomizeItem(null); setAvailableOptions([]); }}
        onAdd={handleCustomizeAdd}
        loadingOptions={loadingOptions}
        customizations={availableOptions}
      />
    </motion.div>
  );
}
