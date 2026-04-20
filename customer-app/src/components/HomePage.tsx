'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Coffee,
  Plus,
  ChevronRight,
  Wallet,
  Crown,
  Truck,
  ShoppingBag,
  UtensilsCrossed,
  MapPin,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useCartStore } from '@/stores/cartStore';
import { useWalletStore } from '@/stores/walletStore';
import { useOrderStore } from '@/stores/orderStore';
import api from '@/lib/api';
import type { MenuItem, Banner } from '@/lib/api';
import { ProductCardSkeleton } from '@/components/ui/Skeleton';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.07 },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-MY', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function formatPrice(val: number): string {
  return `RM ${val.toFixed(2)}`;
}

function truncate(str: string, max: number): string {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

const ORDER_MODE_OPTIONS: { mode: 'pickup' | 'delivery' | 'dine_in'; label: string; icon: typeof ShoppingBag }[] = [
  { mode: 'pickup', label: 'Pickup', icon: ShoppingBag },
  { mode: 'delivery', label: 'Delivery', icon: Truck },
  { mode: 'dine_in', label: 'Dine-in', icon: UtensilsCrossed },
];

export default function HomePage() {
  const user = useAuthStore((s) => s.user);
  const { selectedStore, setPage, orderMode, setOrderMode } = useUIStore();
  const addItem = useCartStore((s) => s.addItem);
  const { balance, points, tier } = useWalletStore();
  const { orders, setOrders } = useOrderStore();

  const [banners, setBanners] = useState<Banner[]>([]);
  const [popularItems, setPopularItems] = useState<MenuItem[]>([]);
  const [loadingBanners, setLoadingBanners] = useState(true);
  const [loadingPopular, setLoadingPopular] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);

  const firstName = user?.name?.split(' ')[0] || 'Guest';

  const loadBanners = useCallback(async () => {
    setLoadingBanners(true);
    try {
      const res = await api.get('/promos/banners');
      setBanners(res.data ?? []);
    } catch {
      setBanners([]);
    } finally {
      setLoadingBanners(false);
    }
  }, []);

  const loadPopular = useCallback(async () => {
    if (!selectedStore) {
      setLoadingPopular(false);
      return;
    }
    setLoadingPopular(true);
    try {
      const res = await api.get(`/stores/${selectedStore.id}/items/popular`);
      setPopularItems(Array.isArray(res.data) ? res.data.slice(0, 4) : []);
    } catch {
      try {
        const fallback = await api.get(`/stores/${selectedStore.id}/items`);
        setPopularItems(Array.isArray(fallback.data) ? fallback.data.slice(0, 4) : []);
      } catch {
        setPopularItems([]);
      }
    } finally {
      setLoadingPopular(false);
    }
  }, [selectedStore]);

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const res = await api.get('/orders', { params: { page_size: 3 } });
      setOrders(Array.isArray(res.data) ? res.data : (res.data?.orders ?? []));
    } catch {
      // orders remain from store or empty
    } finally {
      setLoadingOrders(false);
    }
  }, [setOrders]);

  useEffect(() => {
    loadBanners();
    loadPopular();
    loadOrders();
  }, [loadBanners, loadPopular, loadOrders]);

  const handleAddToCart = (item: MenuItem) => {
    addItem(
      {
        menu_item_id: item.id,
        name: item.name,
        price: item.base_price,
        quantity: 1,
        customizations: {},
      },
      item.store_id,
    );
  };

  const recentOrders = orders.slice(0, 3);

  const activeBanner = banners[0];

  const statusVariant = (status: string): 'success' | 'warning' | 'error' | 'info' | 'default' => {
    const s = status?.toLowerCase();
    if (s === 'completed' || s === 'delivered' || s === 'picked_up') return 'success';
    if (s === 'preparing' || s === 'in_progress') return 'warning';
    if (s === 'cancelled') return 'error';
    if (s === 'pending' || s === 'confirmed') return 'info';
    return 'default';
  };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="px-4 pt-4 pb-6"
    >
      <motion.div variants={staggerItem} className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">
          {getGreeting()}, {firstName}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">{formatDate()}</p>
      </motion.div>

      <motion.div variants={staggerItem} className="mb-5">
        <div className="bg-gradient-to-r from-[#384B16] to-[#5a7a2e] rounded-2xl p-4 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Wallet size={16} className="opacity-80" />
                <span className="text-xs font-medium opacity-80">Balance</span>
              </div>
              <p className="text-2xl font-bold">{formatPrice(balance)}</p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1.5 justify-end mb-1">
                <Crown size={14} className="opacity-80" />
                <span className="text-xs font-medium opacity-80">{tier}</span>
              </div>
              <p className="text-lg font-semibold">{points} pts</p>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setPage('wallet')}
              className="bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-4 py-1.5 rounded-full transition-colors"
            >
              Top Up
            </motion.button>
          </div>
        </div>
      </motion.div>

      <motion.div variants={staggerItem} className="mb-5">
        <div className="flex bg-gray-100 rounded-xl p-1">
          {ORDER_MODE_OPTIONS.map(({ mode, label, icon: Icon }) => (
            <button
              key={mode}
              onClick={() => setOrderMode(mode)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${
                orderMode === mode
                  ? 'bg-[#384B16] text-white shadow-sm'
                  : 'text-gray-500'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      </motion.div>

      <motion.div variants={staggerItem} className="mb-5">
        {loadingBanners ? (
          <div className="h-28 bg-gray-100 rounded-2xl animate-pulse" />
        ) : activeBanner ? (
          <div className="bg-gradient-to-br from-[#384B16] to-[#6b8f3a] rounded-2xl p-5 text-white shadow-md">
            <h3 className="text-base font-bold">{activeBanner.title}</h3>
            {activeBanner.subtitle && (
              <p className="text-sm opacity-80 mt-1">{activeBanner.subtitle}</p>
            )}
            {activeBanner.action_url && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setPage('menu')}
                className="mt-3 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-4 py-1.5 rounded-full transition-colors inline-flex items-center gap-1"
              >
                Order Now
                <ChevronRight size={14} />
              </motion.button>
            )}
          </div>
        ) : (
          <div className="bg-gradient-to-br from-[#384B16] to-[#6b8f3a] rounded-2xl p-5 text-white shadow-md">
            <h3 className="text-base font-bold">Welcome to Loka Espresso</h3>
            <p className="text-sm opacity-80 mt-1">
              Enjoy handcrafted coffee at your fingertips
            </p>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setPage('menu')}
              className="mt-3 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-4 py-1.5 rounded-full transition-colors inline-flex items-center gap-1"
            >
              Browse Menu
              <ChevronRight size={14} />
            </motion.button>
          </div>
        )}
      </motion.div>

      <motion.div variants={staggerItem} className="mb-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Popular Items</h2>
          <button
            onClick={() => setPage('menu')}
            className="text-[#384B16] text-sm font-semibold flex items-center gap-0.5"
          >
            See all
            <ChevronRight size={15} />
          </button>
        </div>
      </motion.div>

      <motion.div variants={staggerItem} className="grid grid-cols-2 gap-3 mb-6">
        {loadingPopular
          ? Array.from({ length: 4 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))
          : popularItems.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 flex flex-col"
              >
                <div className="bg-[#384B16]/10 rounded-xl h-24 flex items-center justify-center mb-3">
                  <Coffee size={28} className="text-[#384B16]/50" />
                </div>
                <p className="text-sm font-semibold text-gray-900 leading-tight">
                  {item.name}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 leading-snug">
                  {truncate(item.description, 48)}
                </p>
                <div className="flex items-center justify-between mt-auto pt-2.5">
                  <span className="text-sm font-bold text-[#384B16]">
                    {formatPrice(item.base_price)}
                  </span>
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={() => handleAddToCart(item)}
                    className="w-8 h-8 bg-[#384B16] rounded-full flex items-center justify-center text-white shadow-sm"
                  >
                    <Plus size={16} />
                  </motion.button>
                </div>
              </div>
            ))}
      </motion.div>

      {(loadingOrders || recentOrders.length > 0) && (
        <motion.div variants={staggerItem}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-gray-900">Recent Orders</h2>
            <button
              onClick={() => setPage('orders')}
              className="text-[#384B16] text-sm font-semibold flex items-center gap-0.5"
            >
              View All
              <ChevronRight size={15} />
            </button>
          </div>

          {loadingOrders ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 animate-pulse"
                >
                  <div className="h-4 bg-gray-100 rounded w-24 mb-3" />
                  <div className="h-3 bg-gray-100 rounded w-16" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {recentOrders.map((order) => (
                <motion.button
                  key={order.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setPage('orders')}
                  className="w-full bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-left"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        #{order.order_number}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {new Date(order.created_at).toLocaleDateString('en-MY', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex items-center font-medium rounded-full px-2.5 py-0.5 text-xs ${
                          statusVariant(order.status) === 'success'
                            ? 'bg-green-100 text-green-700'
                            : statusVariant(order.status) === 'warning'
                            ? 'bg-amber-100 text-amber-700'
                            : statusVariant(order.status) === 'error'
                            ? 'bg-red-100 text-red-700'
                            : statusVariant(order.status) === 'info'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {order.status}
                      </span>
                      <span className="text-sm font-bold text-gray-900">
                        {formatPrice(order.total)}
                      </span>
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {!selectedStore && (
        <motion.div variants={staggerItem} className="mt-5">
          <button
            onClick={() => setPage('home')}
            className="w-full bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-left"
          >
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
              <MapPin size={18} className="text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Select a store</p>
              <p className="text-xs text-gray-500">Choose a location to see menu items</p>
            </div>
            <ChevronRight size={18} className="text-gray-400 ml-auto shrink-0" />
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}
