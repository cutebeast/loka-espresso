'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Gift, Star, ArrowLeft } from 'lucide-react';
import { TypePill, RedemptionCodeModal } from '@/components/shared';
import { useWalletStore } from '@/stores/walletStore';
import { useUIStore } from '@/stores/uiStore';
import api from '@/lib/api';
import type { Reward } from '@/lib/api';

const LOKA = {
  primary: '#384B16',
  primaryDark: '#2A3910',
  primaryDeep: '#1F2C0B',
  copper: '#D18E38',
  copperLight: '#E5A559',
  copperSoft: 'rgba(209,142,56,0.12)',
  copperMid: 'rgba(209,142,56,0.25)',
  cream: '#F3EEE5',
  brown: '#57280D',
  textPrimary: '#1B2023',
  textSecondary: '#3A4A5A',
  textMuted: '#6A7A8A',
  border: '#D4DCE5',
  borderSubtle: '#E4EAEF',
  surface: '#F5F7FA',
  bg: '#E4EAEF',
  white: '#FFFFFF',
} as const;

const TIER_THRESHOLDS: Record<string, number> = { Bronze: 0, Silver: 500, Gold: 1000, Platinum: 1500 };

function getNextTier(tier: string): string | null {
  const tiers = ['Bronze', 'Silver', 'Gold', 'Platinum'];
  const idx = tiers.indexOf(tier);
  return idx >= 0 && idx < tiers.length - 1 ? tiers[idx + 1] : null;
}

function getTierProgress(tier: string, points: number): number {
  const current = TIER_THRESHOLDS[tier] ?? 0;
  const next = getNextTier(tier);
  if (!next) return 100;
  const target = TIER_THRESHOLDS[next] ?? current + 500;
  return Math.min(100, Math.max(0, ((points - current) / (target - current)) * 100));
}

function resolveUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith('http') ? url : `https://admin.loyaltysystem.uk${url}`;
}

export default function RewardsPage() {
  const { points, tier } = useWalletStore();
  const { setPage, showToast } = useUIStore();

  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loadingRewards, setLoadingRewards] = useState(true);
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  const [redeeming, setRedeeming] = useState<number | null>(null);
  const [redemptionCode, setRedemptionCode] = useState<string | null>(null);

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

  useEffect(() => { fetchRewards(); }, [fetchRewards]);

  const handleRedeem = async (reward: Reward) => {
    if (points < reward.points_cost) { showToast('Insufficient points', 'error'); return; }
    setRedeeming(reward.id);
    try {
      const res = await api.post(`/rewards/${reward.id}/redeem`);
      const code = res.data?.redemption_code || res.data?.code || '';
      if (code) setRedemptionCode(code);
      else showToast('Reward redeemed!', 'success');
      await fetchRewards();
    } catch { showToast('Failed to redeem', 'error'); }
    finally { setRedeeming(null); }
  };

  const nextTier = getNextTier(tier);
  const progress = getTierProgress(tier, points);

  if (selectedReward) {
    const img = resolveUrl(selectedReward.image_url);
    const canRedeem = points >= selectedReward.points_cost;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: LOKA.white }}>
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ position: 'absolute', inset: 0, background: img ? `url(${img}) center/cover` : `linear-gradient(135deg, ${LOKA.cream}, rgba(209,142,56,0.3))` }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(0,0,0,0.25) 0%, transparent 50%)' }} />
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setSelectedReward(null)}
            style={{ position: 'absolute', top: 16, left: 16, width: 40, height: 40, borderRadius: 999, background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(4px)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 6px 12px rgba(0,0,0,0.06)', zIndex: 5 }}
          >
            <ArrowLeft size={20} color={LOKA.primary} />
          </motion.button>
          <div style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 2 }}>
            <TypePill variant="limited">{selectedReward.reward_type || 'Reward'}</TypePill>
          </div>
        </div>

        <div className="scroll-container" style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '20px 18px 32px' }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: LOKA.textPrimary, marginBottom: 10, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              {selectedReward.name}
            </h1>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 14, fontWeight: 700, color: LOKA.copper, background: LOKA.copperSoft, padding: '5px 14px', borderRadius: 30 }}>
                <Star size={14} fill={LOKA.copper} /> {selectedReward.points_cost} pts
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 13, color: canRedeem ? '#2A7D3F' : LOKA.textMuted, fontWeight: 600 }}>
                {canRedeem ? '✓ You can redeem' : `Need ${selectedReward.points_cost - points} more pts`}
              </span>
            </div>

            <div style={{ width: 40, height: 3, borderRadius: 2, background: LOKA.borderSubtle, marginBottom: 20 }} />

            {selectedReward.short_description && (
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: LOKA.textPrimary, marginBottom: 8 }}>About this reward</h4>
                <p style={{ fontSize: 15, color: LOKA.textSecondary, lineHeight: 1.7 }}>
                  {selectedReward.short_description}
                </p>
              </div>
            )}

            {selectedReward.description && !selectedReward.short_description && (
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: LOKA.textPrimary, marginBottom: 8 }}>About this reward</h4>
                <p style={{ fontSize: 15, color: LOKA.textSecondary, lineHeight: 1.7 }}>
                  {selectedReward.description}
                </p>
              </div>
            )}

            {selectedReward.validity_days && (
              <div style={{ marginBottom: 24, display: 'flex', gap: 10 }}>
                <div style={{ flex: 1, background: LOKA.cream, borderRadius: 16, padding: '14px 16px', textAlign: 'center' }}>
                  <p style={{ fontSize: 22, fontWeight: 800, color: LOKA.primary }}>{selectedReward.validity_days}</p>
                  <p style={{ fontSize: 12, color: LOKA.textMuted, marginTop: 2 }}>Days valid</p>
                </div>
                <div style={{ flex: 1, background: LOKA.cream, borderRadius: 16, padding: '14px 16px', textAlign: 'center' }}>
                  <p style={{ fontSize: 22, fontWeight: 800, color: LOKA.copper }}>{selectedReward.points_cost}</p>
                  <p style={{ fontSize: 12, color: LOKA.textMuted, marginTop: 2 }}>Points needed</p>
                </div>
              </div>
            )}

            {selectedReward.how_to_redeem && (
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: LOKA.textPrimary, marginBottom: 10 }}>
                  <Star size={14} style={{ color: LOKA.copper, marginRight: 4 }} /> How to redeem
                </h4>
                <div style={{ background: LOKA.cream, borderRadius: 18, padding: 16 }}>
                  <p style={{ fontSize: 14, color: LOKA.textSecondary, lineHeight: 1.6 }}>{selectedReward.how_to_redeem}</p>
                </div>
              </div>
            )}

            {selectedReward.terms && selectedReward.terms.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: LOKA.textPrimary, marginBottom: 10 }}>Terms & Conditions</h4>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {selectedReward.terms.map((t, i) => (
                    <li key={i} style={{ padding: '10px 0', borderBottom: `1px solid ${LOKA.borderSubtle}`, fontSize: 14, color: LOKA.textSecondary, display: 'flex', gap: 10 }}>
                      <span style={{ color: LOKA.copper, flexShrink: 0, fontWeight: 700 }}>•</span> {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => handleRedeem(selectedReward)}
              disabled={!canRedeem || redeeming === selectedReward.id}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 20px', borderRadius: 60, border: 'none',
                cursor: canRedeem && redeeming !== selectedReward.id ? 'pointer' : 'not-allowed',
                background: canRedeem ? LOKA.primary : LOKA.surface,
                color: canRedeem ? LOKA.white : LOKA.textMuted,
                fontSize: 16, fontWeight: 700, opacity: canRedeem ? 1 : 0.7,
                boxShadow: canRedeem ? '0 8px 16px rgba(56,75,22,0.15)' : 'none',
              }}
            >
              <span>{redeeming === selectedReward.id ? 'Redeeming...' : canRedeem ? `Redeem · ${selectedReward.points_cost} pts` : `Need ${selectedReward.points_cost - points} more pts`}</span>
              <span>→</span>
            </motion.button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: LOKA.bg }}>
      <div style={{ padding: '20px 18px 12px', background: LOKA.white, borderBottom: `1px solid ${LOKA.borderSubtle}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => setPage('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, display: 'flex', color: LOKA.primary }}>
            <ArrowLeft size={22} />
          </motion.button>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: LOKA.textPrimary, letterSpacing: '-0.02em' }}>Rewards</h1>
        </div>
      </div>

      <div className="scroll-container" style={{ flex: 1 }}>
        <div style={{ padding: 16 }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              position: 'relative',
              borderRadius: 28,
              padding: 20,
              color: LOKA.white,
              background: `linear-gradient(135deg, ${LOKA.primaryDark} 0%, ${LOKA.primary} 55%, ${LOKA.primaryDeep} 100%)`,
              boxShadow: '0 18px 36px -14px rgba(31,44,11,0.55)',
              overflow: 'hidden',
            }}
          >
            <div aria-hidden style={{ position: 'absolute', top: -60, right: -40, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(209,142,56,0.22) 0%, rgba(209,142,56,0) 65%)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Star size={18} color={LOKA.copperLight} fill={LOKA.copperLight} />
                <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.9 }}>{tier} Member</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 40, fontWeight: 800 }}>{points.toLocaleString()}</span>
                <span style={{ fontSize: 13, opacity: 0.8 }}>points</span>
              </div>
              {nextTier && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, opacity: 0.7 }}>
                    <span>{tier}</span><span>{nextTier}</span>
                  </div>
                  <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.2)', borderRadius: 999, overflow: 'hidden' }}>
                    <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} style={{ height: '100%', background: LOKA.copper, borderRadius: 999 }} />
                  </div>
                  <p style={{ fontSize: 12, opacity: 0.7, marginTop: 8, textAlign: 'center' }}>{Math.round(100 - progress)}% to {nextTier}</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>

        <div style={{ padding: '0 16px 24px' }}>
          {loadingRewards ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1, 2, 3].map((i) => (<div key={i} className="skeleton" style={{ height: 88, borderRadius: 18 }} />))}
            </div>
          ) : rewards.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', background: LOKA.white, borderRadius: 20, border: `1px solid ${LOKA.borderSubtle}` }}>
              <Gift size={40} color={LOKA.borderSubtle} style={{ marginBottom: 12 }} />
              <p style={{ fontSize: 16, fontWeight: 700, color: LOKA.textPrimary, marginBottom: 6 }}>No rewards available</p>
              <p style={{ fontSize: 13, color: LOKA.textMuted }}>Check back soon for new rewards</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rewards.map((reward) => {
                const img = resolveUrl(reward.image_url);
                return (
                  <motion.button
                    key={reward.id}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedReward(reward)}
                    style={{
                      display: 'flex', background: LOKA.white, borderRadius: 18,
                      border: `1px solid ${LOKA.borderSubtle}`, overflow: 'hidden',
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    }}
                  >
                    <div
                      style={{
                        width: 88, height: 88, flexShrink: 0,
                        background: img ? `url(${img}) center/cover` : `linear-gradient(135deg, ${LOKA.cream}, rgba(209,142,56,0.2))`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {!img && <Gift size={24} color={LOKA.brown} strokeWidth={1.5} />}
                    </div>
                    <div style={{ flex: 1, padding: '10px 14px', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <TypePill variant="limited">{reward.reward_type || 'Reward'}</TypePill>
                      </div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: LOKA.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {reward.name}
                      </p>
                      {reward.short_description && (
                        <p style={{ fontSize: 12, color: LOKA.textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {reward.short_description}
                        </p>
                      )}
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 12, fontWeight: 700, color: LOKA.copper }}>
                        <Star size={11} fill={LOKA.copper} /> {reward.points_cost} pts
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <RedemptionCodeModal
        code={redemptionCode ?? ''} title="Reward Redeemed!" isOpen={!!redemptionCode}
        onClose={() => { setRedemptionCode(null); setPage('my-rewards'); }}
        onCopy={(code) => { navigator.clipboard.writeText(code); showToast('Code copied!', 'success'); }}
      />
    </div>
  );
}
