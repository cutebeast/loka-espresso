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
      className="px-4 pt-4 pb-24"
    >
      {/* Greeting */}
      <motion.div variants={staggerItem} className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">
          {getGreeting()}, {firstName}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">{formatDate()}</p>
      </motion.div>

      {/* Balance Card */}
      <motion.div variants={staggerItem} className="mb-5">
        <div className="gradient-card rounded-3xl p-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Wallet size={18} className="opacity-80" />
                <span className="text-sm font-medium opacity-80">Balance</span>
              </div>
              <p className="text-3xl font-bold">{formatPrice(balance)}</p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1.5 justify-end mb-1">
                <Crown size={16} className="opacity-80" />
                <span className="text-sm font-medium opacity-80">{tier}</span>
              </div>
              <p className="text-xl font-semibold">{points.toLocaleString()} pts</p>
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setPage('wallet')}
              className="flex-1 bg-white/20 hover:bg-white/30 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
            >
              Top Up
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setPage('rewards')}
              className="flex-1 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
            >
              Rewards
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Order Mode Toggle */}
      <motion.div variants={staggerItem} className="mb-5">
        <div className="flex bg-gray-100 rounded-2xl p-1">
          {ORDER_MODE_OPTIONS.map(({ mode, label, icon: Icon }) => (
            <button
              key={mode}
              onClick={() => setOrderMode(mode)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all ${
                orderMode === mode
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Promo Banner */}
      <motion.div variants={staggerItem} className="mb-6">
        {loadingBanners ? (
          <div className="h-32 bg-gray-100 rounded-3xl animate-pulse" />
        ) : activeBanner ? (
          <div className="gradient-card rounded-3xl p-5 text-white shadow-md">
            <h3 className="text-lg font-bold">{activeBanner.title}</h3>
            {activeBanner.subtitle && (
              <p className="text-sm opacity-80 mt-1">{activeBanner.subtitle}</p>
            )}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setPage('menu')}
              className="mt-4 bg-white/20 hover:bg-white/30 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors inline-flex items-center gap-1"
            >
              Order Now
              <ChevronRight size={16} />
            </motion.button>
          </div>
        ) : (
          <div className="gradient-card rounded-3xl p-5 text-white shadow-md">
            <h3 className="text-lg font-bold">Welcome to Loka Espresso</h3>
            <p className="text-sm opacity-80 mt-1">
              Enjoy handcrafted coffee at your fingertips
            </p>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setPage('menu')}
              className="mt-4 bg-white/20 hover:bg-white/30 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors inline-flex items-center gap-1"
            >
              Browse Menu
              <ChevronRight size={16} />
            </motion.button>
          </div>
        )}
      </motion.div>

      {/* Popular Items */}
      <motion.div variants={staggerItem} className="mb-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Popular Items</h2>
          <button
            onClick={() => setPage('menu')}
            className="text-primary text-sm font-semibold flex items-center gap-0.5 hover:text-primary-dark"
          >
            See all
            <ChevronRight size={16} />
          </button>
        </div>
      </motion.div>

      <motion.div variants={staggerItem} className="grid grid-cols-2 gap-3 mb-6">
        {loadingPopular
          ? Array.from({ length: 4 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))
          : popularItems.map((item) => (
              <motion.div
                key={item.id}
                whileTap={{ scale: 0.98 }}
                className="bg-white rounded-2xl p-3 shadow-card border border-gray-100 flex flex-col"
              >
                <div className="bg-primary/5 rounded-xl h-28 flex items-center justify-center mb-3">
                  <Coffee size={32} className="text-primary/40" />
                </div>
                <p className="text-sm font-semibold text-gray-900 leading-tight line-clamp-1">
                  {item.name}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 leading-snug line-clamp-2">
                  {truncate(item.description, 40)}
                </p>
                <div className="flex items-center justify-between mt-auto pt-3">
                  <span className="text-sm font-bold text-primary">
                    {formatPrice(item.base_price)}
                  </span>
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={() => handleAddToCart(item)}
                    className="w-9 h-9 bg-primary rounded-full flex items-center justify-center text-white shadow-md touch-target"
                  >
                    <Plus size={18} />
                  </motion.button>
                </div>
              </motion.div>
            ))}
      </motion.div>

      {/* Recent Orders */}
      {(loadingOrders || recentOrders.length > 0) && (
        <motion.div variants={staggerItem}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900">Recent Orders</h2>
            <button
              onClick={() => setPage('orders')}
              className="text-primary text-sm font-semibold flex items-center gap-0.5 hover:text-primary-dark"
            >
              View All
              <ChevronRight size={16} />
            </button>
          </div>

          {loadingOrders ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl p-4 shadow-card border border-gray-100 animate-pulse"
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
                  className="w-full bg-white rounded-2xl p-4 shadow-card border border-gray-100 text-left"
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
                        className={`inline-flex items-center font-medium rounded-full px-2.5 py-1 text-xs ${
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

      {/* Store Selection Alert */}
      {!selectedStore && (
        <motion.div variants={staggerItem} className="mt-5">
          <button
            onClick={() => setPage('home')}
            className="w-full bg-warning-light border border-warning/20 rounded-2xl p-4 flex items-center gap-3 text-left"
          >
            <div className="w-10 h-10 bg-warning/10 rounded-xl flex items-center justify-center shrink-0">
              <MapPin size={18} className="text-warning" />
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
