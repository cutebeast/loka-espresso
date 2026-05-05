'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, ArrowRight, Crown, Star, ChevronRight, Gift, Calendar, List, Circle, CheckCircle, RefreshCw } from 'lucide-react';
import { useWalletStore } from '@/stores/walletStore';
import { haptic } from '@/lib/haptics';
import { useUIStore } from '@/stores/uiStore';
import api from '@/lib/api';
import type { Reward } from '@/lib/api';
import { resolveAssetUrl, LOKA } from '@/lib/tokens';
import { useTranslation } from '@/hooks/useTranslation';

type Tab = 'rewards' | 'vouchers';

export default function RewardsPage() {
  const { t } = useTranslation();
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
    if (points < reward.points_cost) { showToast(t('rewards.insufficientPoints'), 'error'); return; }
    setRedeeming(reward.id);
    try {
      const res = await api.post(`/rewards/${reward.id}/redeem`);
      const code = res.data?.redemption_code || res.data?.code || '';
      if (code) { haptic('success'); setRedemptionSuccess(true); setRedemptionCode(code); }
      else { haptic('success'); setRedemptionSuccess(true); showToast(t('toast.rewardRedeemed'), 'success'); }
    } catch { showToast(t('rewards.failedToRedeem'), 'error'); }
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
        <div className="rd-modal-icon-circle"><Gift size={32} color={LOKA.primary} /></div>
        <h2 className="rd-modal-title">{t('rewards.redeemedTitle')}</h2>
        <p className="rd-modal-desc">{t('rewards.showCode')}</p>
        <div className="rd-modal-code-box">{redemptionCode}</div>
        <button className="btn btn-primary btn-pill rd-btn-full-mb" onClick={() => { navigator.clipboard.writeText(redemptionCode); showToast(t('toast.codeCopied'), 'success'); }}>{t('rewards.copyCode')}</button>
        <button className="btn btn-ghost rd-btn-full" onClick={() => { setRedemptionCode(null); setSelectedReward(null); setRedemptionSuccess(false); }}>{t('common.close')}</button>
      </div>
    );
  }

  /* ── Detail view ── */
  if (selectedReward) {
    const img = resolveAssetUrl(selectedReward.image_url);
    const canRedeem = points >= selectedReward.points_cost;
    return (
      <div className="rd-fullscreen" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="detail-hero">
          {img ? <img src={img} alt={selectedReward.name} loading="lazy" /> : <Gift size={48} color="white" />}
          <button className="rd-back-btn" onClick={() => setSelectedReward(null)} style={{ position: 'absolute', top: 12, left: 12 }}><ArrowLeft size={20} /></button>
        </div>
        <div className="detail-body">
          <h1 className="detail-title">{selectedReward.name}</h1>
          <div className="detail-points-row">
            <span className="detail-points-pill"><Crown size={14} /> {selectedReward.points_cost.toLocaleString()} pts</span>
            <span className="detail-stock-pill"><Circle size={8} fill={LOKA.danger} /> {t('rewards.limitedStock')}</span>
          </div>
          {selectedReward.short_description && (
            <p className="rd-desc">{selectedReward.short_description}</p>
          )}
          {selectedReward.terms && selectedReward.terms.length > 0 && (
            <>
              <div className="rd-section-title"><List size={16} /> {t('rewards.termsConditions')}</div>
              <ul className="rd-terms-list">
                {selectedReward.terms.map((t, i) => (
                  <li key={i}><Circle size={10} fill="currentColor" /> {t}</li>
                ))}
              </ul>
            </>
          )}
          {(selectedReward.long_description || selectedReward.description) && selectedReward.short_description !== (selectedReward.long_description || selectedReward.description) && (
            <div className="detail-full-desc">
              {selectedReward.long_description || selectedReward.description}
            </div>
          )}
        </div>
        <div className="sticky-redeem">
          {!redemptionSuccess ? (
            <button className="detail-redeem-btn" onClick={() => handleRedeem(selectedReward)} disabled={!canRedeem || redeeming === selectedReward.id}>
              {redeeming === selectedReward.id ? t('rewards.redeeming') : t('rewards.redeemFor', { points: selectedReward.points_cost.toLocaleString() })}
            </button>
          ) : (
            <div className="rd-success-state">
              <CheckCircle size={24} color={LOKA.success} />
              <p>{t('rewards.redeemedAtCounter')}</p>
              <button className="btn btn-ghost rd-btn-full" onClick={() => { setSelectedReward(null); setRedemptionSuccess(false); }}>{t('rewards.backToRewards')}</button>
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
          <h1 className="rewards-page-title">{t('rewards.title')}</h1>
        </div>
      </div>

      {/* Points display large */}
      <div className="rewards-hero">
      <div className="points-display-large">
        <span className="points-label">{t('rewards.pointsBalance')}</span>
        <span className="points-value">{points.toLocaleString()}</span>
        <span className="points-sub">{t('rewards.crownPoints')}</span>
      </div>

      {/* Progress to next tier */}
      <div className="progress-section">
        <div className="progress-header">
          <span className="progress-title">{t('rewards.progressToTier', { tier: nextTier })}</span>
          <span className="progress-value">{points.toLocaleString()} / {nextThreshold.toLocaleString()} pts</span>
        </div>
        <div className="progress-bar-track">
          <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="progress-hint">{nextThreshold - points > 0 ? t('rewards.pointsToUnlock', { points: (nextThreshold - points).toLocaleString(), tier: nextTier }) : t('rewards.reachedTier', { tier: nextTier })}</div>
      </div>
      </div>

      {/* Tabs */}
      <div className="rewards-tab-bar">
        <button className={`rewards-tab ${activeTab === 'rewards' ? 'active' : ''}`} onClick={() => setActiveTab('rewards')}>{t('rewards.pointRewards')}</button>
        <button className={`rewards-tab ${activeTab === 'vouchers' ? 'active' : ''}`} onClick={() => setPage('promotions')}>{t('promotions.title')}</button>
      </div>

      {/* Card List */}
      <div className="rewards-card-list">
        {loading ? (
          [1, 2, 3].map(i => <div key={i} className="skeleton rewards-skeleton-card" />)
        ) : rewards.length === 0 ? (
          <div className="rd-empty">
            <div className="rd-empty-icon"><Gift size={40} color={LOKA.borderLight} /></div>
            <p className="rd-empty-title">{t('rewards.noRewards')}</p>
            <p className="rd-empty-text">{t('rewards.checkBackSoon')}</p>
          </div>
        ) : (
          <>
            {rewards.map(reward => {
              const img = resolveAssetUrl(reward.image_url);
              return (
                <div key={reward.id} className="reward-card-improved" onClick={() => setSelectedReward(reward)}>
                  <div className="reward-thumb">
                    {img ? <img src={img} alt="" loading="lazy" className="w-full h-full object-cover rounded-xl" /> : <Gift size={24} color={LOKA.border} />}
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
