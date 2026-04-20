'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Gift,
  Crown,
  Star,
  Ticket,
  Sparkles,
  ArrowLeft,
  Clock,
} from 'lucide-react';
import { useWalletStore } from '@/stores/walletStore';
import { useUIStore } from '@/stores/uiStore';
import { Button, Badge, Skeleton } from '@/components/ui';
import api from '@/lib/api';
import type { Reward, UserVoucher } from '@/lib/api';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const staggerItem = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

const TIER_THRESHOLDS: Record<string, number> = {
  Bronze: 0,
  Silver: 500,
  Gold: 1000,
  Platinum: 1500,
};

function getNextTier(tier: string): string | null {
  const tiers = ['Bronze', 'Silver', 'Gold', 'Platinum'];
  const idx = tiers.indexOf(tier);
  if (idx < 0 || idx >= tiers.length - 1) return null;
  return tiers[idx + 1];
}

function getTierProgress(tier: string, points: number): number {
  const currentThreshold = TIER_THRESHOLDS[tier] ?? 0;
  const nextTier = getNextTier(tier);
  if (!nextTier) return 100;
  const nextThreshold = TIER_THRESHOLDS[nextTier] ?? currentThreshold + 500;
  const range = nextThreshold - currentThreshold;
  const progress = points - currentThreshold;
  return Math.min(100, Math.max(0, (progress / range) * 100));
}

export default function RewardsPage() {
  const { points, tier, setPoints, setTier } = useWalletStore();
  const { setPage, showToast } = useUIStore();

  const [rewards, setRewards] = useState<Reward[]>([]);
  const [vouchers, setVouchers] = useState<UserVoucher[]>([]);
  const [loadingRewards, setLoadingRewards] = useState(true);
  const [loadingVouchers, setLoadingVouchers] = useState(true);
  const [redeeming, setRedeeming] = useState<number | null>(null);

  const fetchRewards = useCallback(async () => {
    setLoadingRewards(true);
    try {
      const res = await api.get('/rewards');
      setRewards(Array.isArray(res.data) ? res.data : []);
    } catch {
      setRewards([]);
    } finally {
      setLoadingRewards(false);
    }
  }, []);

  const fetchVouchers = useCallback(async () => {
    setLoadingVouchers(true);
    try {
      const res = await api.get('/vouchers/me');
      setVouchers(Array.isArray(res.data) ? res.data : []);
    } catch {
      setVouchers([]);
    } finally {
      setLoadingVouchers(false);
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    try {
      const res = await api.get('/loyalty/balance');
      setPoints(res.data?.points_balance ?? points);
      setTier(res.data?.tier ?? tier);
    } catch {
      // keep existing values
    }
  }, [points, tier, setPoints, setTier]);

  useEffect(() => {
    fetchRewards();
    fetchVouchers();
    refreshBalance();
  }, [fetchRewards, fetchVouchers, refreshBalance]);

  const handleRedeem = async (reward: Reward) => {
    if (points < reward.points_cost) {
      showToast('Insufficient points', 'error');
      return;
    }
    setRedeeming(reward.id);
    try {
      const res = await api.post(`/rewards/${reward.id}/redeem`);
      const code = res.data?.redemption_code || res.data?.code || '';
      showToast(
        code ? `Redeemed! Code: ${code}` : 'Reward redeemed successfully!',
        'success'
      );
      await refreshBalance();
      await fetchVouchers();
    } catch {
      showToast('Failed to redeem reward', 'error');
    } finally {
      setRedeeming(null);
    }
  };

  const nextTier = getNextTier(tier);
  const progress = getTierProgress(tier, points);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="px-4 pt-4 pb-6">
      <motion.div variants={staggerItem} className="flex items-center gap-3 mb-5">
        <button
          onClick={() => setPage('home')}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"
        >
          <ArrowLeft size={18} className="text-gray-600" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Rewards</h1>
      </motion.div>

      <motion.div variants={staggerItem} className="mb-6">
        <div className="bg-gradient-to-r from-[#384B16] to-[#6b8f3a] rounded-2xl p-5 text-white shadow-lg">
          <div className="flex items-center gap-2 mb-2">
            <Crown size={20} className="opacity-90" />
            <span className="text-sm font-semibold opacity-90">{tier} Tier</span>
          </div>
          <div className="flex items-baseline gap-1 mb-3">
            <Star size={22} className="text-yellow-300" />
            <span className="text-3xl font-bold">{points}</span>
            <span className="text-sm opacity-80">points</span>
          </div>
          {nextTier && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs opacity-70">{tier}</span>
                <span className="text-xs opacity-70">{nextTier}</span>
              </div>
              <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className="h-full bg-yellow-300 rounded-full"
                />
              </div>
              <p className="text-xs opacity-70 mt-1.5 text-center">
                {Math.round(100 - progress)}% to {nextTier}
              </p>
            </div>
          )}
        </div>
      </motion.div>

      <motion.div variants={staggerItem} className="mb-6">
        <h2 className="text-base font-bold text-gray-900 mb-3">Available Rewards</h2>
        {loadingRewards ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : rewards.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Gift size={24} className="text-gray-300" />
            </div>
            <p className="text-sm text-gray-500">No rewards available right now</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rewards.map((reward) => {
              const canRedeem = points >= reward.points_cost;
              return (
                <motion.div
                  key={reward.id}
                  whileTap={{ scale: 0.98 }}
                  className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                      <Sparkles size={20} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{reward.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                        {reward.description}
                      </p>
                      <div className="flex items-center justify-between mt-3">
                        <Badge variant="info" size="sm">
                          <Star size={12} className="mr-1" />
                          {reward.points_cost} pts
                        </Badge>
                        <Button
                          variant={canRedeem ? 'primary' : 'outline'}
                          size="sm"
                          onClick={() => handleRedeem(reward)}
                          disabled={!canRedeem}
                          isLoading={redeeming === reward.id}
                        >
                          Redeem
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>

      <motion.div variants={staggerItem}>
        <h2 className="text-base font-bold text-gray-900 mb-3">My Vouchers</h2>
        {loadingVouchers ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <Skeleton className="h-4 w-1/2 mb-2" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        ) : vouchers.filter((v) => v.status === 'available').length === 0 ? (
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Ticket size={24} className="text-gray-300" />
            </div>
            <p className="text-sm text-gray-500">No vouchers yet</p>
            <p className="text-xs text-gray-400 mt-1">Redeem rewards to earn vouchers</p>
          </div>
        ) : (
          <div className="space-y-3">
            {vouchers
              .filter((v) => v.status === 'available')
              .map((voucher) => (
                <div
                  key={voucher.id}
                  className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 bg-green-50 rounded-xl flex items-center justify-center shrink-0">
                      <Ticket size={20} className="text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900">{voucher.code}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {voucher.discount_type === 'percentage'
                          ? `${voucher.discount_value}% off`
                          : `RM ${voucher.discount_value.toFixed(2)} off`}
                      </p>
                      {voucher.min_spend != null && voucher.min_spend > 0 && (
                        <p className="text-xs text-gray-400">
                          Min. spend {voucher.min_spend.toFixed(2)}
                        </p>
                      )}
                      <div className="flex items-center gap-1 mt-1.5">
                        <Clock size={12} className="text-gray-400" />
                        <p className="text-xs text-gray-400">
                          Expires{' '}
                          {new Date(voucher.expires_at).toLocaleDateString('en-MY', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                      </div>
                    </div>
                    <Badge variant="success" size="sm">
                      Active
                    </Badge>
                  </div>
                </div>
              ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
