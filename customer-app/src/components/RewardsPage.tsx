'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, ArrowRight, Crown, Star, ChevronRight, Gift, Calendar, List, Circle, CheckCircle } from 'lucide-react';
import { useWalletStore } from '@/stores/walletStore';
import { useUIStore } from '@/stores/uiStore';
import api from '@/lib/api';
import type { Reward } from '@/lib/api';
import { resolveAssetUrl } from '@/lib/tokens';

type Tab = 'rewards' | 'vouchers';

export default function RewardsPage() {
  const { points, tier } = useWalletStore();
  const { setPage, showToast } = useUIStore();
  const [activeTab, setActiveTab] = useState<Tab>('rewards');
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  const [redeeming, setRedeeming] = useState<number | null>(null);
  const [redemptionCode, setRedemptionCode] = useState<string | null>(null);
  const [redemptionSuccess, setRedemptionSuccess] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/rewards');
      setRewards(Array.isArray(res.data) ? res.data : []);
    } catch { setRewards([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, []);

  const handleRedeem = async (reward: Reward) => {
    if (useUIStore.getState().isGuest) { useUIStore.getState().triggerSignIn(); return; }
    if (points < reward.points_cost) { showToast('Insufficient points', 'error'); return; }
    setRedeeming(reward.id);
    try {
      const res = await api.post(`/rewards/${reward.id}/redeem`);
      const code = res.data?.redemption_code || res.data?.code || '';
      if (code) { setRedemptionSuccess(true); setRedemptionCode(code); }
      else { setRedemptionSuccess(true); showToast('Reward redeemed!', 'success'); }
    } catch { showToast('Failed to redeem', 'error'); }
    finally { setRedeeming(null); }
  };

  const tierThresholds: Record<string, number> = { Bronze: 0, Silver: 1000, Gold: 3000, Platinum: 5000 };
  const tiers = Object.keys(tierThresholds);
  const currentTierIdx = tiers.indexOf(tier || 'Bronze');
  const nextTier = tiers[currentTierIdx + 1] || 'Platinum';
  const nextThreshold = tierThresholds[nextTier] || 5000;
  const progress = Math.min((points / nextThreshold) * 100, 100);

  /* ── Redemption code modal ── */
  if (redemptionCode) {
    return (
      <div className="rd-modal-code">
        <div className="rd-modal-icon-circle"><Gift size={32} color="#384B16" /></div>
        <h2 className="rd-modal-title">Reward Redeemed!</h2>
        <p className="rd-modal-desc">Show this code to the cashier</p>
        <div className="rd-modal-code-box">{redemptionCode}</div>
        <button className="btn btn-primary btn-pill rd-btn-full-mb" onClick={() => { navigator.clipboard.writeText(redemptionCode); showToast('Code copied!', 'success'); }}>Copy Code</button>
        <button className="btn btn-ghost rd-btn-full" onClick={() => { setRedemptionCode(null); setSelectedReward(null); setRedemptionSuccess(false); }}>Close</button>
      </div>
    );
  }

  /* ── Detail view ── */
  if (selectedReward) {
    const img = resolveAssetUrl(selectedReward.image_url);
    const canRedeem = points >= selectedReward.points_cost;
    return (
      <div className="rd-fullscreen">
        <div className="rd-hero">
          <div className="rd-hero-img" style={img ? { backgroundImage: `url(${img})` } : { background: 'linear-gradient(135deg, #F3EEE5, rgba(209,142,56,0.3))' }} />
          <div className="rd-hero-overlay" />
          <button className="rd-back-btn" onClick={() => setSelectedReward(null)}><ArrowLeft size={20} /></button>
          <span className="rd-hero-tag rd-tag-copper"><Crown size={14} /> {selectedReward.points_cost.toLocaleString()} PTS</span>
        </div>
        <div className="rd-content">
          <h1 className="rd-title">{selectedReward.name}</h1>
          <div className="rd-meta">
            <span className="rewards-calendar-meta"><Calendar size={16} /> Valid {selectedReward.validity_days || 30} days</span>
            <span className="rd-meta-pill rd-pill-copper">{selectedReward.points_cost.toLocaleString()} points</span>
          </div>
          <p className="rd-desc">{selectedReward.description || selectedReward.short_description || 'Enjoy this exclusive reward from Loka Espresso.'}</p>
          {selectedReward.terms && selectedReward.terms.length > 0 && (
            <>
              <div className="rd-section-title"><List size={16} /> Terms</div>
              <ul className="rd-terms-list">{selectedReward.terms.map((t, i) => <li key={i}><Circle size={10} fill="#D18E38" color="#D18E38" /> {t}</li>)}</ul>
            </>
          )}
        </div>
        <div className="sticky-redeem">
          {!redemptionSuccess ? (
            <button className="detail-redeem-btn" onClick={() => handleRedeem(selectedReward)} disabled={!canRedeem || redeeming === selectedReward.id} style={{ opacity: canRedeem ? 1 : 0.5 }}>
              {redeeming === selectedReward.id ? 'Redeeming…' : `Redeem for ${selectedReward.points_cost.toLocaleString()} pts`}
            </button>
          ) : (
            <div className="rd-success-state">
              <CheckCircle size={24} color="#85B085" />
              <p>Reward redeemed! Show at the counter.</p>
              <button className="btn btn-ghost rd-btn-full" onClick={() => { setSelectedReward(null); setRedemptionSuccess(false); }}>Back to Rewards</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── Main list view ── */
  return (
    <div className="rewards-screen">
      {/* Header */}
      <div className="rewards-header">
        <div className="rewards-header-left">
          <button className="rewards-back-btn" onClick={() => setPage('home')}><ArrowLeft size={20} /></button>
          <h1 className="rewards-page-title">Rewards & Promos</h1>
        </div>
      </div>

      {/* Points display large */}
      <div className="points-display-large">
        <span className="points-label">Your Points Balance</span>
        <span className="points-value">{points.toLocaleString()}</span>
        <span className="points-sub">Crown Points</span>
      </div>

      {/* Progress to next tier */}
      <div className="progress-section">
        <div className="progress-header">
          <span className="progress-title">Progress to {nextTier} Tier</span>
          <span className="progress-value">{points.toLocaleString()} / {nextThreshold.toLocaleString()} pts</span>
        </div>
        <div className="progress-bar-track">
          <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="progress-hint">{nextThreshold - points > 0 ? `${(nextThreshold - points).toLocaleString()} more points to unlock ${nextTier} rewards` : `You've reached ${nextTier}!`}</div>
      </div>

      {/* Tabs */}
      <div className="rewards-tab-bar">
        <button className={`rewards-tab ${activeTab === 'rewards' ? 'active' : ''}`} onClick={() => setActiveTab('rewards')}>Point Rewards</button>
        <button className={`rewards-tab ${activeTab === 'vouchers' ? 'active' : ''}`} onClick={() => setPage('promotions')}>Vouchers & Promos</button>
      </div>

      {/* Card List */}
      <div className="rewards-card-list">
        {loading ? (
          [1, 2, 3].map(i => <div key={i} className="skeleton rewards-skeleton-card" />)
        ) : rewards.length === 0 ? (
          <div className="rd-empty">
            <div className="rd-empty-icon"><Gift size={40} color="#D4DCE5" /></div>
            <p className="rd-empty-title">No rewards available</p>
            <p className="rd-empty-text">Check back soon for new rewards</p>
          </div>
        ) : (
          <>
            {rewards.map(reward => {
              const img = resolveAssetUrl(reward.image_url);
              return (
                <div key={reward.id} className="reward-card-improved" onClick={() => setSelectedReward(reward)}>
                  <div className="reward-thumb">
                    {img ? <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} /> : <Gift size={24} color="#C4CED8" />}
                  </div>
                  <div className="reward-info">
                    <div className="reward-points-tag">{reward.points_cost.toLocaleString()} pts</div>
                    <div className="reward-name">{reward.name}</div>
                    <div className="reward-desc">{reward.short_description || ''}</div>
                  </div>
                  <div className="reward-chevron"><ChevronRight size={16} /></div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
