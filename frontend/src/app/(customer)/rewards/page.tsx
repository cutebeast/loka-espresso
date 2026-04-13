"use client";

import { useState, useEffect } from "react";
import * as api from "@/lib/api";
import type { LoyaltyAccount, Reward, ReferralInfo } from "@/lib/types";

export default function RewardsPage() {
  const [loyalty, setLoyalty] = useState<LoyaltyAccount | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [referral, setReferral] = useState<ReferralInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [loyaltyData, rewardsData, referralData] = await Promise.all([
          api.loyalty.getBalance().catch(() => null),
          api.rewards.listRewards().catch(() => []),
          api.referral.getCode().catch(() => null),
        ]);
        setLoyalty(loyaltyData);
        setRewards(Array.isArray(rewardsData) ? rewardsData : []);
        setReferral(referralData);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  async function handleRedeem(rewardId: string) {
    setRedeemingId(rewardId);
    try {
      await api.rewards.redeemReward(rewardId);
      const loyaltyData = await api.loyalty.getBalance();
      setLoyalty(loyaltyData);
      const rewardsData = await api.rewards.listRewards();
      setRewards(Array.isArray(rewardsData) ? rewardsData : []);
    } catch {
      // handle error
    } finally {
      setRedeemingId(null);
    }
  }

  function handleCopyCode() {
    if (referral?.code) {
      navigator.clipboard.writeText(referral.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-400">Loading rewards...</div>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[var(--color-navy)] to-[var(--color-navy-light)] text-white p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
            <i className="fa-solid fa-crown text-[var(--color-gold)] text-xl" />
          </div>
          <div>
            <div className="text-sm opacity-80">Current Tier</div>
            <div className="font-bold text-lg capitalize">
              {loyalty?.tier ?? "Bronze"}
            </div>
          </div>
        </div>
        <div className="bg-white/10 rounded-xl p-4">
          <div className="text-sm opacity-80 mb-1">Points Balance</div>
          <div className="text-3xl font-bold">
            {(loyalty?.points ?? 0).toLocaleString()}
          </div>
          {loyalty?.nextTier && loyalty.nextTierPoints && (
            <div className="mt-2">
              <div className="flex justify-between text-xs opacity-70 mb-1">
                <span>Progress to {loyalty.nextTier}</span>
                <span>
                  {loyalty.lifetimePoints} / {loyalty.nextTierPoints}
                </span>
              </div>
              <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--color-gold)] rounded-full transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      ((loyalty.lifetimePoints ?? 0) /
                        (loyalty.nextTierPoints ?? 1)) *
                        100
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {referral && (
        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-[var(--color-green)]/10 flex items-center justify-center">
              <i className="fa-solid fa-gift text-[var(--color-green)]" />
            </div>
            <div>
              <div className="font-semibold text-sm">Refer a Friend</div>
              <div className="text-xs text-gray-500">
                {referral.referredCount} referrals &middot; {referral.earnedPoints} pts earned
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 px-3 py-2 rounded-xl bg-[var(--color-bg)] text-center font-mono text-sm font-bold tracking-widest">
              {referral.code}
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleCopyCode}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-bold mb-3">Available Rewards</h2>
        {rewards.length === 0 ? (
          <div className="card text-center py-8 text-gray-400">
            No rewards available
          </div>
        ) : (
          <div className="space-y-3">
            {rewards.map((reward) => {
              const canRedeem =
                (loyalty?.points ?? 0) >= reward.pointsCost &&
                reward.isAvailable;
              return (
                <div key={reward.id} className="card flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl bg-[var(--color-bg)] flex items-center justify-center flex-shrink-0">
                    <i className="fa-solid fa-gift text-xl text-[var(--color-gold)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{reward.name}</div>
                    {reward.description && (
                      <div className="text-xs text-gray-500 truncate">
                        {reward.description}
                      </div>
                    )}
                    <div className="text-xs font-semibold text-[var(--color-navy)] mt-1">
                      {reward.pointsCost.toLocaleString()} pts
                    </div>
                  </div>
                  <button
                    className={`btn btn-sm ${
                      canRedeem ? "btn-primary" : "opacity-50 cursor-not-allowed"
                    }`}
                    onClick={() => canRedeem && handleRedeem(reward.id)}
                    disabled={!canRedeem || redeemingId === reward.id}
                  >
                    {redeemingId === reward.id
                      ? "..."
                      : canRedeem
                      ? "Redeem"
                      : "Need more"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
