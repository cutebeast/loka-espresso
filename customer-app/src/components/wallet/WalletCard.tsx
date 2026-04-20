'use client';

import { motion } from 'framer-motion';
import { Wallet, Star, ChevronRight } from 'lucide-react';
import { Badge } from '../ui/Badge';

interface WalletCardProps {
  balance: number;
  points: number;
  tier: string;
  onTopUp: () => void;
}

export function WalletCard({ balance, points, tier, onTopUp }: WalletCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-gradient-to-br from-primary to-primary-light rounded-3xl p-5 text-white"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <p className="text-white/70 text-xs">Your Balance</p>
            <p className="text-xl font-bold">RM {balance.toFixed(2)}</p>
          </div>
        </div>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onTopUp}
          className="bg-white text-primary font-semibold px-4 py-2 rounded-full text-sm flex items-center gap-1 hover:bg-white/90 transition-colors"
        >
          Top Up
          <ChevronRight size={16} />
        </motion.button>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-white/20">
        <div className="flex items-center gap-2">
          <Star className="w-5 h-5 text-accent-copper fill-accent-copper" />
          <div>
            <p className="text-white/70 text-xs">Loyalty Points</p>
            <p className="text-lg font-bold">{points.toLocaleString()} pts</p>
          </div>
        </div>
        <Badge variant="warning" size="sm">
          {tier}
        </Badge>
      </div>
    </motion.div>
  );
}