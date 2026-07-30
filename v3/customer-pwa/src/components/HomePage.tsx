'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useCartStore } from '@/stores/cartStore';
import { useWalletStore } from '@/stores/walletStore';
import { useTranslation } from '@/hooks/useTranslation';
import api from '@/lib/api';
import type { MenuItem, PromoBanner, InformationCard } from '@/lib/api';

import { HomeCarousel, WalletCard, PromotionsSection } from './home';
import MembershipHero from './home/MembershipHero';
import EventCountdown from './home/EventCountdown';
import BrewSpotlight from './home/BrewSpotlight';
import LuckyDrawPanel from './home/LuckyDrawPanel';
import BirthdayPrompt from './home/BirthdayPrompt';
import WelcomeGiftCard from './home/WelcomeGiftCard';
import ReferralCard from './home/ReferralCard';
import TuesdayCard from './home/TuesdayCard';

export default function HomePage() {
  const { t } = useTranslation();
  const { setPage, isGuest, triggerSignIn, selectedStore, showToast } = useUIStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const addItem = useCartStore((s) => s.addItem);
  const { balance, points, tier, lifetimePoints } = useWalletStore();

  const [featuredItems, setFeaturedItems] = useState<MenuItem[]>([]);
  const [loadingFeatured, setLoadingFeatured] = useState(true);
  const [banners, setBanners] = useState<PromoBanner[]>([]);
  const [loadingBanners, setLoadingBanners] = useState(true);
  const [infoCards, setInfoCards] = useState<InformationCard[]>([]);
  const [productCards, setProductCards] = useState<InformationCard[]>([]);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [luckyDrawLive, setLuckyDrawLive] = useState(false);
  const isLoading = loadingFeatured || loadingBanners || loadingInfo;

  const loadFeatured = useCallback(async (signal?: AbortSignal) => {
    setLoadingFeatured(true);
    try {
      const res = await api.get(`/menu/items`, {
        params: { is_featured: true, is_available: true, limit: 10 },
        signal,
      });
      // v3 returns { items: [...], categories: [...] } from /menu/stores/{store_id}
      let list: MenuItem[] = [];
      if (res.data && typeof res.data === 'object' && res.data.items) {
        list = Array.isArray(res.data.items) ? res.data.items : [];
      } else if (Array.isArray(res.data)) {
        list = res.data;
      }
      if (list.length === 0) {
        const all = await api.get(`/menu/items`, {
          params: { is_available: true, limit: 8 },
          signal,
        });
        if (all.data && typeof all.data === 'object' && all.data.items) {
          list = Array.isArray(all.data.items) ? all.data.items : [];
        } else if (Array.isArray(all.data)) {
          list = all.data;
        }
      }
      setFeaturedItems(list.slice(0, 10));
    } catch {
      console.error('Failed to load featured items');
      showToast(t('toast.failedToLoad'), 'error');
      setFeaturedItems([]);
    } finally {
      setLoadingFeatured(false);
    }
  }, []);

  const loadBanners = useCallback(async (signal?: AbortSignal) => {
    setLoadingBanners(true);
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
      console.error('Failed to load banners');
      showToast(t('toast.failedToLoad'), 'error');
      setBanners([]);
    } finally {
      setLoadingBanners(false);
    }
  }, []);

  const loadInfoCards = useCallback(async (signal?: AbortSignal) => {
    setLoadingInfo(true);
    try {
      const [infoRes, prodRes] = await Promise.all([
        api.get('/content/information?limit=3&content_type=information', { signal }),
        api.get('/content/products?limit=3', { signal }),
      ]);
      setInfoCards(Array.isArray(infoRes.data) ? infoRes.data : []);
      setProductCards(Array.isArray(prodRes.data) ? prodRes.data : []);
    } catch {
      console.error('Failed to load info cards');
      showToast(t('toast.failedToLoad'), 'error');
      try {
        const res = await api.get('/promos/banners', { signal });
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
        console.error('Failed to load info fallback from banners');
        showToast(t('toast.failedToLoad'), 'error');
        setInfoCards([]);
      }
    } finally {
      setLoadingInfo(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    loadFeatured(ac.signal);
    loadBanners(ac.signal);
    loadInfoCards(ac.signal);
    // Lucky draw banner visibility — 404 simply means no live campaign
    api.get('/lucky-draw/active', { signal: ac.signal })
      .then(() => setLuckyDrawLive(true))
      .catch(() => setLuckyDrawLive(false));
    return () => ac.abort();
  }, [loadFeatured, loadBanners, loadInfoCards]);

  const handleAddToCart = (item: MenuItem) => {
    addItem({ menu_item_id: item.id, name: item.item_name, price: item.base_price, base_price: item.base_price, quantity: 1, image_url: item.image_url ?? undefined, customizations: {}, store_id: selectedStore?.id, customization_count: item.modifier_groups?.length ?? 0 });
  };

  const pageVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { duration: 0.3 } },
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
        {/* Membership hero (membership card + scan + tier preview) for
            authenticated users; guest wallet card prompts sign-in */}
        {isAuthenticated && (
          <motion.div variants={itemVariants}>
            <MembershipHero
              points={points}
              lifetimePoints={lifetimePoints}
              tier={tier}
              onScan={() => setPage('my-card')}
              onRewards={() => setPage('my-rewards', { initialTab: 'rewards' })}
              onVouchers={() => setPage('my-rewards', { initialTab: 'vouchers' })}
              onCheckin={() => setPage('checkin')}
            />
          </motion.div>
        )}
        {!isAuthenticated && (
          <motion.div variants={itemVariants}>
            <WalletCard
              isGuest={isGuest}
              isAuthenticated={isAuthenticated}
              balance={balance}
              points={points}
              tier={tier}
              onTopUp={() => setPage('wallet')}
              onRewards={() => setPage('my-rewards', { initialTab: 'rewards' })}
              onVouchers={() => setPage('my-rewards', { initialTab: 'vouchers' })}
              onCheckin={() => setPage('checkin')}
              onSignIn={triggerSignIn}
            />
          </motion.div>
        )}

        {/* Day-one welcome gift card (new members with an unused welcome voucher) */}
        {isAuthenticated && (
          <motion.div variants={itemVariants}>
            <WelcomeGiftCard />
          </motion.div>
        )}

        {/* Live extras: birthday enrichment (authed, no DOB) + next-session countdown */}
        {isAuthenticated && (
          <motion.div variants={itemVariants}>
            <BirthdayPrompt />
          </motion.div>
        )}
        <motion.div variants={itemVariants}>
          <EventCountdown />
        </motion.div>

        {/* Lucky Draw panel — live campaign with entries/spins balance */}
        {luckyDrawLive && (
          <motion.div variants={itemVariants}>
            <LuckyDrawPanel />
          </motion.div>
        )}

        {/* Referral entry (share your code, both sides earn) */}
        {isAuthenticated && (
          <motion.div variants={itemVariants}>
            <ReferralCard />
          </motion.div>
        )}

        {/* LOKA Tuesday — standing weekly promo with countdown */}
        <motion.div variants={itemVariants}>
          <TuesdayCard />
        </motion.div>

        {/* Banners & Info Carousels */}
        <HomeCarousel
          banners={banners}
          loading={isLoading}
          infoCards={infoCards}
          productCards={productCards}
          onPromoClick={(id) => setPage('promotions', { selectedPromoId: id })}
          onInfoClick={(id, contentType) => setPage('information', { selectedInfoId: id, selectedInfoContentType: contentType })}
          onViewAllPromos={() => setPage('promotions')}
          onViewAllDiscover={() => setPage('information')}
        />

        {/* Daily Brew Spotlight — origin-story product card */}
        <motion.div variants={itemVariants}>
          <BrewSpotlight />
        </motion.div>

        {/* Today's Picks */}
        <motion.div variants={itemVariants}>
          <PromotionsSection
            featuredItems={featuredItems}
            loading={isLoading}
            onAddToCart={handleAddToCart}
            onSeeAll={() => setPage('menu')}
          />
        </motion.div>
      </motion.div>

    </>
  );
}
