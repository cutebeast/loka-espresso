'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useCartStore } from '@/stores/cartStore';
import { useWalletStore } from '@/stores/walletStore';
import api from '@/lib/api';
import type { MenuItem, PromoBanner, InformationCard, CustomizationOption } from '@/lib/api';
import ItemCustomizeSheet from '@/components/menu/ItemCustomizeSheet';

import { HomeCarousel, WalletCard, PromotionsSection } from './home';

export default function HomePage() {
  const { setPage, showToast, isGuest, triggerSignIn, selectedStore } = useUIStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const addItem = useCartStore((s) => s.addItem);
  const { balance, points, tier } = useWalletStore();

  const [featuredItems, setFeaturedItems] = useState<MenuItem[]>([]);
  const [loadingFeatured, setLoadingFeatured] = useState(true);
  const [banners, setBanners] = useState<PromoBanner[]>([]);
  const [loadingBanners, setLoadingBanners] = useState(true);
  const [infoCards, setInfoCards] = useState<InformationCard[]>([]);
  const [productCards, setProductCards] = useState<InformationCard[]>([]);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [customizeItem, setCustomizeItem] = useState<MenuItem | null>(null);
  const [availableOptions, setAvailableOptions] = useState<CustomizationOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

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
      console.error('Failed to load featured items');
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
      console.error('Failed to load banners');
      setBanners([]);
    } finally {
      setLoadingBanners(false);
    }
  }, []);

  const loadInfoCards = useCallback(async () => {
    setLoadingInfo(true);
    try {
      const [infoRes, prodRes] = await Promise.all([
        api.get('/content/information?limit=3&content_type=information'),
        api.get('/content/information?limit=3&content_type=product'),
      ]);
      setInfoCards(Array.isArray(infoRes.data) ? infoRes.data : []);
      setProductCards(Array.isArray(prodRes.data) ? prodRes.data : []);
    } catch {
      console.error('Failed to load info cards');
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
        console.error('Failed to load info fallback from banners');
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

  const handleAddToCart = (item: MenuItem) => {
    addItem({ menu_item_id: item.id, name: item.name, price: item.base_price, base_price: item.base_price, quantity: 1, customizations: {}, store_id: selectedStore?.id, customization_count: item.customization_count ?? 0 });
  };

  const loadCustomizations = useCallback(async (item: MenuItem) => {
    setLoadingOptions(true);
    try {
      const res = await api.get(`/menu/items/${item.id}/customizations`);
      setAvailableOptions(res.data ?? []);
    } catch {
      console.error('Failed to load customizations');
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
        base_price: item.base_price,
        quantity,
        customizations:
          customizations.length > 0
            ? { options: customizations.map((o) => ({ id: o.id, name: o.name, price_adjustment: o.price_adjustment })) }
            : {},
        customization_option_ids: customizations.length > 0 ? customizations.map((o) => o.id) : [],
      });
    },
    [addItem],
  );

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
        {/* Wallet Card — hidden for guests, shown for authenticated users */}
        {isAuthenticated && (
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
              onSignIn={triggerSignIn}
            />
          </motion.div>
        )}

        {/* Banners & Info Carousels */}
        <HomeCarousel
          banners={banners}
          loadingBanners={loadingBanners}
          infoCards={infoCards}
          productCards={productCards}
          loadingInfo={loadingInfo}
          onPromoClick={(id) => setPage('promotions', { selectedPromoId: id })}
          onInfoClick={(id, contentType) => setPage('information', { selectedInfoId: id, selectedInfoContentType: contentType })}
          onViewAllPromos={() => setPage('promotions')}
          onViewAllDiscover={() => setPage('information')}
        />

        {/* Today's Picks */}
        <motion.div variants={itemVariants}>
          <PromotionsSection
            featuredItems={featuredItems}
            loading={loadingFeatured}
            onAddToCart={handleAddToCart}
            onSeeAll={() => setPage('menu')}
          />
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
