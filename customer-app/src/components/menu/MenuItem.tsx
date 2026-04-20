'use client';

import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';

interface MenuItemProps {
  id: number;
  name: string;
  description: string;
  price: number;
  imageUrl?: string | null;
  isAvailable: boolean;
  onClick: () => void;
  onAddToCart: (e: React.MouseEvent) => void;
}

export function MenuItem({
  name,
  description,
  price,
  imageUrl,
  isAvailable,
  onClick,
  onAddToCart,
}: MenuItemProps) {
  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={`bg-white rounded-2xl p-3 shadow-sm border border-gray-100 cursor-pointer transition-opacity ${
        !isAvailable ? 'opacity-60' : ''
      }`}
    >
      <div className="h-28 bg-primary/5 rounded-xl mb-3 flex items-center justify-center overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-12 h-12 text-primary/30" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.5 3H6c-1.1 0-2 .9-2 2v5.71c0 3.83 2.95 7.18 6.78 7.29 3.96.12 7.22-3.06 7.22-7v-1h.5c1.93 0 3.5-1.57 3.5-3.5S20.43 3 18.5 3zM16 5v3H8V5h8zm2 5H6V7h12v3zM18.5 8H18V5h.5c.83 0 1.5.67 1.5 1.5S19.33 8 18.5 8zM4 19h16v2H4v-2z"/>
            </svg>
          </div>
        )}
      </div>

      <h3 className="font-bold text-gray-900 text-[15px] mb-1 line-clamp-1">{name}</h3>
      <p className="text-gray-400 text-xs mb-3 line-clamp-2 h-8">{description}</p>

      <div className="flex items-center justify-between">
        <span className="font-bold text-primary">RM {price.toFixed(2)}</span>
        {isAvailable && (
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={onAddToCart}
            className="w-8 h-8 bg-primary rounded-full flex items-center justify-center hover:bg-primary-dark transition-colors"
          >
            <Plus size={18} className="text-white" />
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}