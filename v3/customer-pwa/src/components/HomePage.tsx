'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ShoppingBag, Bike, Calendar, Megaphone, Ticket, BookOpen, Wallet, Gift, MessageSquareHeart } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useWalletStore } from '@/stores/walletStore';
import { useConfigStore } from '@/stores/configStore';
import { useTranslation } from '@/hooks/useTranslation';
import api from '@/lib/api';
import type { PromoBanner } from '@/lib/api';

import HomeBanner from './home/HomeBanner';
import WelcomeGiftCard from './home/WelcomeGiftCard';
import BirthdayPrompt from './home/BirthdayPrompt';

const TIER_COLORS: Record<string, string> = {
  bloom: '#4CAF50',
  origin: '#FF9800',
  reserve: '#9C27B0',
};

/**
 * Clean dashboard — the home feed was de-crammed (round 38 redesign, 2026-08):
 * 13 stacked content blocks moved to their dedicated pages (events,
 * promotions, lucky draw, referral, info). The dashboard is now a summary:
 * header + tri-stat strip + order tiles + tier progress + quick actions +
 * featured banner + "What's on" hub.
 */
export default function HomePage() {
  const { t } = useTranslation();
  const { setPage, triggerSignIn } = useUIStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { balance, points, lifetimePoints, tier } = useWalletStore();
  const tiers = useConfigStore(s => s.tiers);

  const [banners, setBanners] = useState<PromoBanner[]>([]);
  const [eventCount, setEventCount] = useState(0);
  const [luckyDrawLive, setLuckyDrawLive] = useState(false);

  const loadBanners = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await api.get('/promos/banners', { signal });
      const data = Array.isArray(res.data) ? res.data : [];
      const now = new Date();
      const active = data.filter((b: PromoBanner) => {
        if (!b.start_date || !b.end_date) return true;
        return new Date(b.start_date) <= now && new Date(b.end_date) >= now;
      });
      setBanners(active);
    } catch {
      setBanners([]);
    }
  }, []);

  const loadCounts = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await api.get('/content/events?limit=30', { signal });
      const list = Array.isArray(res.data) ? res.data : [];
      setEventCount(list.length);
    } catch {
      setEventCount(0);
    }
    try {
      const [infoRes, prodRes] = await Promise.all([
        api.get('/content/information?limit=1&content_type=information', { signal }),
        api.get('/content/products?limit=1', { signal }),
      ]);
      void infoRes;
      void prodRes;
    } catch {
      /* info count not surfaced on the hub — load only for future badge use */
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    loadBanners(ac.signal);
    loadCounts(ac.signal);
    api.get('/lucky-draw/active', { signal: ac.signal })
      .then(() => setLuckyDrawLive(true))
      .catch(() => setLuckyDrawLive(false));
    return () => ac.abort();
  }, [loadBanners, loadCounts]);

  // Tier progress toward next milestone
  const sortedTiers = [...tiers].sort((a, b) => a.min_points - b.min_points);
  const currentIdx = Math.max(0, sortedTiers.findIndex(x => x.name.toLowerCase() === (tier || 'bloom').toLowerCase()));
  const current = sortedTiers[currentIdx] ?? null;
  const next = sortedTiers[currentIdx + 1] ?? null;
  const tierProgress = current && next
    ? Math.min(100, Math.max(0, Math.round(((lifetimePoints - current.min_points) / Math.max(1, next.min_points - current.min_points)) * 100)))
    : 100;
  const tierColor = current ? (TIER_COLORS[current.name.toLowerCase()] || '#4CAF50') : '#4CAF50';

  const pageVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { duration: 0.3 } },
  };

  const hubTiles = [
    {
      key: 'events',
      label: t('home.hub.events'),
      sub: t('home.hub.eventsSub'),
      badge: eventCount > 0 ? String(eventCount) : null,
      badgeClass: 'badge-red',
      page: 'events' as const,
    },
    {
      key: 'promotions',
      label: t('home.hub.promotions'),
      sub: t('home.hub.promotionsSub'),
      badge: banners.length > 0 ? String(banners.length) : null,
      badgeClass: 'badge-olive',
      page: 'promotions' as const,
    },
    {
      key: 'lucky',
      label: t('home.hub.lucky'),
      sub: t('home.hub.luckySub'),
      badge: luckyDrawLive ? t('home.hub.new') : null,
      badgeClass: 'badge-gold',
      page: 'lucky-draw' as const,
    },
    {
      key: 'info',
      label: t('home.hub.info'),
      sub: t('home.hub.infoSub'),
      badge: null,
      badgeClass: 'badge-olive',
      page: 'information' as const,
    },
  ];

  return (
    <>
      <motion.div className="home-main" variants={pageVariants} initial="hidden" animate="show">
        {/* Tri-stat strip */}
        <div className="clean-stats">
          <button type="button" className="clean-stat" onClick={() => (isAuthenticated ? setPage('my-rewards') : triggerSignIn())}>
            <span className="clean-stat-val">{isAuthenticated ? points.toLocaleString() : '—'}</span>
            <span className="clean-stat-lbl">{t('home.stats.points')}</span>
          </button>
          <button type="button" className="clean-stat" onClick={() => (isAuthenticated ? setPage('wallet') : triggerSignIn())}>
            <span className="clean-stat-val clean-stat-gold">{isAuthenticated ? `RM ${Number(balance).toFixed(2)}` : '—'}</span>
            <span className="clean-stat-lbl">{t('home.stats.wallet')}</span>
          </button>
          <button type="button" className="clean-stat" onClick={() => (isAuthenticated ? setPage('vip') : triggerSignIn())}>
            <span className="clean-stat-val" style={{ color: tierColor }}>{isAuthenticated ? (current?.name || tier) : '—'}</span>
            <span className="clean-stat-lbl">{t('home.stats.tier')}</span>
          </button>
        </div>

        <div className="clean-scroll">
          {/* Order tiles */}
          <div className="clean-duo">
            <button type="button" className="clean-tile" onClick={() => setPage('menu')}>
              <ShoppingBag size={20} color="var(--color-primary, #3B4A1A)" />
              <span>
                <strong>{t('home.tiles.pickup')}</strong>
                <span className="clean-tile-sub">{t('home.tiles.pickupSub')}</span>
              </span>
            </button>
            <button type="button" className="clean-tile" onClick={() => setPage('menu')}>
              <Bike size={20} color="var(--color-primary, #3B4A1A)" />
              <span>
                <strong>{t('home.tiles.delivery')}</strong>
                <span className="clean-tile-sub">{t('home.tiles.deliverySub')}</span>
              </span>
            </button>
          </div>

          {/* Tier progress card (authenticated only) */}
          {isAuthenticated && current && (
            <button type="button" className="clean-tier-card" onClick={() => setPage('vip')}>
              <div className="clean-tier-card-head">
                <span className="clean-tier-name">
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: tierColor, display: 'inline-block' }} />
                  {current.name}
                </span>
                <span className="clean-tier-pct">{tierProgress}% {next ? `→ ${next.name}` : ''}</span>
              </div>
              <div className="clean-tier-sub">
                {next
                  ? t('home.tier.spendMore', { amount: Math.max(0, next.min_points - lifetimePoints).toLocaleString() })
                  : t('vip.topTier')}
              </div>
              <div className="clean-bar"><span style={{ width: `${tierProgress}%` }} /></div>
              <div className="clean-tier-targets">
                {sortedTiers.map(x => (
                  <span key={x.id} style={{ color: x.name === current.name ? tierColor : undefined }}>{x.name}</span>
                ))}
              </div>
            </button>
          )}

          {/* Quick actions */}
          <div className="clean-quick">
            {[
              { icon: <Calendar size={18} />, label: t('home.quick.checkin'), page: 'checkin' as const, auth: true },
              { icon: <Wallet size={18} />, label: t('home.quick.wallet'), page: 'wallet' as const, auth: true },
              { icon: <Gift size={18} />, label: t('home.quick.referrals'), page: 'referral' as const, auth: true },
              { icon: <MessageSquareHeart size={18} />, label: t('home.quick.feedback'), page: 'feedback' as const, auth: false },
            ].map(a => (
              <button type="button" key={a.page} className="clean-quick-item" onClick={() => (a.auth && !isAuthenticated ? triggerSignIn() : setPage(a.page))}>
                <span className="clean-qicon">{a.icon}</span>
                {a.label}
              </button>
            ))}
          </div>

          {/* Featured promo panel — one relevant active promo for everyone.
              Authed users additionally get the admin home_banner as a modal
              (HomeBanner renders null when none is configured). */}
          <div className="clean-featured">
            {isAuthenticated && <HomeBanner />}
            {(() => {
              const featured = banners[0];
              if (!featured) return null;
              return (
                <button type="button" className="clean-slide dark" onClick={() => setPage('promotions', { selectedPromoId: featured.id })}>
                  <span className="clean-kicker">{t('home.featured')}</span>
                  <h3>{featured.title}</h3>
                  <span className="clean-slide-art">{featured.image_url ? <img src={featured.image_url} alt="" style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover' }} /> : '☕'}</span>
                </button>
              );
            })()}
          </div>

          {/* One-time prompts — compact, dismiss themselves once claimed */}
          {isAuthenticated && <WelcomeGiftCard />}
          {isAuthenticated && <BirthdayPrompt />}

          {/* What's on hub */}
          <div className="clean-hub-head">
            <h2>{t('home.hub.title')}</h2>
          </div>
          <div className="clean-hub">
            {hubTiles.map(h => (
              <button type="button" key={h.key} className="clean-hub-tile" onClick={() => setPage(h.page)}>
                <b>
                  {h.key === 'events' ? <Calendar size={14} /> : h.key === 'promotions' ? <Megaphone size={14} /> : h.key === 'lucky' ? <Ticket size={14} /> : <BookOpen size={14} />}
                  {h.label}
                  {h.badge && <span className={`clean-badge ${h.badgeClass}`}>{h.badge}</span>}
                </b>
                <span className="clean-hub-sub">{h.sub}</span>
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </>
  );
}
