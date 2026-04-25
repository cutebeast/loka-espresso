'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, ArrowRight, Crown, Star, ChevronRight, Gift, Calendar, List, Circle, CheckCircle } from 'lucide-react';
import { useWalletStore } from '@/stores/walletStore';
import { useUIStore } from '@/stores/uiStore';
import api from '@/lib/api';
import type { Reward, PromoBanner } from '@/lib/api';
import { resolveAssetUrl } from '@/lib/tokens';

function getDaysLeft(end: string | null) {
  if (!end) return 'Ongoing';
  const diff = Math.ceil((new Date(end).getTime() - Date.now()) / 86400000);
  if (diff <= 0) return 'Ended';
  return diff === 1 ? '1 day left' : `${diff} days left`;
}

type Tab = 'rewards' | 'vouchers';

export default function RewardsPage() {
  const { points } = useWalletStore();
  const { setPage, showToast } = useUIStore();

  const [activeTab, setActiveTab] = useState<Tab>('rewards');
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [promos, setPromos] = useState<PromoBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  const [redeeming, setRedeeming] = useState<number | null>(null);
  const [redemptionCode, setRedemptionCode] = useState<string | null>(null);
  const [redemptionSuccess, setRedemptionSuccess] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [rewardsRes, promosRes] = await Promise.all([
        api.get('/rewards'),
        api.get('/promos/banners'),
      ]);
      setRewards(Array.isArray(rewardsRes.data) ? rewardsRes.data : []);
      const promoData = Array.isArray(promosRes.data) ? promosRes.data : [];
      const now = new Date();
      setPromos(promoData.filter((b: PromoBanner) => {
        if (!b.start_date || !b.end_date) return true;
        return new Date(b.start_date) <= now && new Date(b.end_date) >= now;
      }));
    } catch {
      setRewards([]);
      setPromos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRedeem = async (reward: Reward) => {
    if (points < reward.points_cost) {
      showToast('Insufficient points', 'error');
      return;
    }
    setRedeeming(reward.id);
    try {
      const res = await api.post(`/rewards/${reward.id}/redeem`);
      const code = res.data?.redemption_code || res.data?.code || '';
      if (code) {
        setRedemptionSuccess(true);
        setRedemptionCode(code);
      } else {
        setRedemptionSuccess(true);
        showToast('Reward redeemed!', 'success');
      }
    } catch {
      showToast('Failed to redeem', 'error');
    } finally {
      setRedeeming(null);
    }
  };

  /* ── Detail view for a selected reward ── */
  if (selectedReward) {
    const img = resolveAssetUrl(selectedReward.image_url);
    const canRedeem = points >= selectedReward.points_cost;
    return (
      <div className="rd-fullscreen">
        <div className="rd-hero">
          <div className="rd-hero-img" style={img ? { backgroundImage: `url(${img})` } : { background: 'linear-gradient(135deg, #F3EEE5, rgba(209,142,56,0.3))' }} />
          <div className="rd-hero-overlay" />
          <button className="rd-back-btn" onClick={() => setSelectedReward(null)} aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <span className="rd-hero-tag rd-tag-copper">
            <Crown size={14} /> {selectedReward.points_cost.toLocaleString()} PTS
          </span>
        </div>

        <div className="rd-content">
          <h1 className="rd-title">{selectedReward.name}</h1>

          <div className="rd-meta">
            <span className="rewards-calendar-meta">
              <Calendar size={16} /> Valid {selectedReward.validity_days || 30} days after redemption
            </span>
            <span className="rd-meta-pill rd-pill-copper">{selectedReward.points_cost.toLocaleString()} points</span>
          </div>

          <p className="rd-desc">
            {selectedReward.description || selectedReward.short_description || 'Enjoy this exclusive reward from Loka Espresso. Redeem with your loyalty points and treat yourself!'}
          </p>

          {selectedReward.terms && selectedReward.terms.length > 0 && (
            <>
              <div className="rd-section-title">
                <List size={16} /> Terms
              </div>
              <ul className="rd-terms-list">
                {selectedReward.terms.map((t, i) => (
                  <li key={i}>
                    <Circle size={10} fill="#D18E38" color="#D18E38" /> {t}
                  </li>
                ))}
              </ul>
            </>
          )}

          {!redemptionSuccess ? (
            <>
              <button
                className={`rd-action-btn ${!canRedeem || redeeming === selectedReward.id ? 'rewards-action-btn-disabled' : ''}`}
                onClick={() => handleRedeem(selectedReward)}
                disabled={!canRedeem || redeeming === selectedReward.id}
              >
                <span>{redeeming === selectedReward.id ? 'Redeeming…' : `Redeem for ${selectedReward.points_cost.toLocaleString()} pts`}</span>
                <ArrowRight size={20} />
              </button>
              <p className="rd-points-note">You have {points.toLocaleString()} points</p>
            </>
          ) : (
            <div className="rd-success-state">
              <CheckCircle size={48} color="#85B085" />
              <p>Reward redeemed successfully!</p>
              <p className="rd-success-sub">
                Your {selectedReward.name.toLowerCase()} has been added to My Rewards. Show it at the counter to redeem.
              </p>
              <button
                className="rd-action-btn rewards-action-btn-mt"
                onClick={() => { setSelectedReward(null); setRedemptionSuccess(false); }}
              >
                <span>Back to Rewards</span>
                <ArrowLeft size={20} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── Redemption code modal ── */
  if (redemptionCode) {
    return (
      <div className="rd-modal-code">
        <div className="rd-modal-icon-circle">
          <Gift size={32} color="#384B16" />
        </div>
        <h2 className="rd-modal-title">Reward Redeemed!</h2>
        <p className="rd-modal-desc">Show this code to the cashier</p>
        <div className="rd-modal-code-box">
          {redemptionCode}
        </div>
        <button
          className="btn btn-primary btn-pill rd-btn-full-mb"
          onClick={() => { navigator.clipboard.writeText(redemptionCode); showToast('Code copied!', 'success'); }}
        >
          Copy Code
        </button>
        <button
          className="btn btn-ghost rd-btn-full"
          onClick={() => { setRedemptionCode(null); setSelectedReward(null); setRedemptionSuccess(false); }}
        >
          Close
        </button>
      </div>
    );
  }

  /* ── Main list view ── */
  return (
    <div className="rewards-screen">
      {/* Header */}
      <div className="rewards-header">
        <div className="rewards-header-left">
          <button className="rewards-back-btn" onClick={() => setPage('home')} aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <h1 className="rewards-page-title">Rewards & Promos</h1>
        </div>
        <div className="rewards-points-badge">
          <Crown size={14} /> {points.toLocaleString()} pts
        </div>
      </div>

      {/* Tabs */}
      <div className="rewards-tab-bar">
        <button
          className={`rewards-tab ${activeTab === 'rewards' ? 'active' : ''}`}
          onClick={() => setActiveTab('rewards')}
        >
          Point Rewards
        </button>
        <button
          className={`rewards-tab ${activeTab === 'vouchers' ? 'active' : ''}`}
          onClick={() => setActiveTab('vouchers')}
        >
          Vouchers & Promos
        </button>
      </div>

      {/* Card List */}
      <div className="rewards-card-list">
        {loading ? (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton rewards-skeleton-card" />
            ))}
          </>
        ) : activeTab === 'rewards' ? (
          rewards.length === 0 ? (
            <div className="rd-empty">
              <div className="rd-empty-icon"><Gift size={40} color="#D4DCE5" /></div>
              <p className="rd-empty-title">No rewards available</p>
              <p className="rd-empty-text">Check back soon for new rewards</p>
            </div>
          ) : (
            <>
              <div className="rewards-section-label">Available Rewards</div>
              {rewards.map((reward) => {
                const img = resolveAssetUrl(reward.image_url);
                return (
                  <div key={reward.id} className="rewards-list-card" onClick={() => setSelectedReward(reward)}>
                    <div
                      className="rewards-card-thumb"
                      style={img ? { backgroundImage: `url(${img})` } : {}}
                    >
                      {!img && (
                        <span className="rewards-card-fallback-icon">
                          <Gift size={24} color="#C4CED8" strokeWidth={1.5} />
                        </span>
                      )}
                      <span className="rewards-thumb-badge rewards-badge-points">{reward.points_cost.toLocaleString()} pts</span>
                    </div>
                    <div className="rewards-card-body">
                      <div className="rewards-card-title">{reward.name}</div>
                      {reward.short_description && (
                        <div className="rewards-card-desc">{reward.short_description}</div>
                      )}
                      <div className="rewards-card-meta">
                        <Crown size={10} color="#D18E38" /> {reward.points_cost.toLocaleString()} points to redeem
                      </div>
                    </div>
                    <div className="rewards-card-arrow">
                      <ChevronRight size={16} />
                    </div>
                  </div>
                );
              })}
            </>
          )
        ) : promos.length === 0 ? (
          <div className="rd-empty">
            <div className="rd-empty-icon"><Gift size={40} color="#D4DCE5" /></div>
            <p className="rd-empty-title">No vouchers or promos</p>
            <p className="rd-empty-text">Check back soon for new offers</p>
          </div>
        ) : (
          <>
            <div className="rewards-section-label">Available Vouchers</div>
            {promos.map((promo) => {
              const img = resolveAssetUrl(promo.image_url);
              return (
                <div key={promo.id} className="rewards-list-card" onClick={() => setPage('promotions', { selectedPromoId: promo.id })}>
                  <div
                    className="rewards-card-thumb"
                    style={img ? { backgroundImage: `url(${img})` } : {}}
                  >
                    {!img && (
                      <span className="rewards-card-fallback-icon">
                        <Gift size={24} color="#C4CED8" strokeWidth={1.5} />
                      </span>
                    )}
                    <span className="rewards-thumb-badge rewards-badge-source">{promo.action_type === 'survey' ? 'Survey' : 'Promo'}</span>
                  </div>
                  <div className="rewards-card-body">
                    <div className="rewards-card-title">{promo.title}</div>
                    {promo.short_description && (
                      <div className="rewards-card-desc">{promo.short_description}</div>
                    )}
                    <div className="rewards-card-meta">
                      <Star size={10} color="#D18E38" /> {getDaysLeft(promo.end_date)}
                    </div>
                  </div>
                  <div className="rewards-card-arrow">
                    <ChevronRight size={16} />
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
