'use client';

import { motion } from 'framer-motion';
import { Home, Menu, Crown, ShoppingBag, Receipt, User } from 'lucide-react';
import { useCartStore } from '../../stores';
import type { PageId } from '../../lib/api';

interface BottomNavProps {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
}

const navItems: Array<{ id: PageId; icon: typeof Home; label: string }> = [
  { id: 'home', icon: Home, label: 'Home' },
  { id: 'menu', icon: Menu, label: 'Menu' },
  { id: 'rewards', icon: Crown, label: 'Rewards' },
  { id: 'cart', icon: ShoppingBag, label: 'Cart' },
  { id: 'orders', icon: Receipt, label: 'Orders' },
  { id: 'profile', icon: User, label: 'Profile' },
];

export function BottomNav({ currentPage, onNavigate }: BottomNavProps) {
  const itemCount = useCartStore((state) => state.getItemCount());

  return (
    <nav className="bg-white border-t border-gray-100 px-2 pb-safe pb-2 pt-2">
      <div className="flex justify-around items-center">
        {navItems.map((item) => {
          const isActive = currentPage === item.id;
          const Icon = item.icon;
          const hasBadge = item.id === 'cart' && itemCount > 0;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="relative flex flex-col items-center py-1 px-3 min-w-[60px]"
            >
              <motion.div
                whileTap={{ scale: 0.85 }}
                className={`relative ${isActive ? 'text-primary' : 'text-gray-400'}`}
              >
                {isActive && (
                  <motion.div
                    layoutId="bottomNavIndicator"
                    className="absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-1 bg-primary rounded-full"
                    transition={{ type: 'spring', bounce: 0.3, duration: 0.5 }}
                  />
                )}
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2.5 : 2}
                  className={isActive ? 'text-primary' : 'text-gray-400'}
                />
                {hasBadge && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {itemCount > 9 ? '9+' : itemCount}
                  </span>
                )}
              </motion.div>
              <span
                className={`text-[10px] mt-1 font-medium ${
                  isActive ? 'text-primary' : 'text-gray-400'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}