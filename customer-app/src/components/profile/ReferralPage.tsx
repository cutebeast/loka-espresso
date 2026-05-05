'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Share2, Copy, Users, Check, Lock, Gift } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/hooks/useTranslation';
import api from '@/lib/api';
import { LOKA } from '@/lib/tokens';

interface ReferralStats {
  code: string;
  referrals: number;
  points_earned: number;
  reward_paid: boolean;
  total_invited: number;
  paid_rewards: number;
  invited_users: Array<{
    name: string;
    joined_at: string;
    order_count: number;
    reward_paid: boolean;
  }>;
}

const MILESTONES = [
  { count: 5, key: 'bronze', bonus: 500, icon: '🔓' },
  { count: 10, key: 'silver', bonus: 1200, icon: '🔓' },
  { count: 15, key: 'gold', bonus: 2000, icon: '🔒' },
  { count: 25, key: 'platinum', bonus: 5000, icon: '🔒' },
];

export default function ReferralPage() {
  const { setPage, showToast } = useUIStore();
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [codeRes, statsRes] = await Promise.all([
          api.get('/referral/code'),
          api.get('/referral/stats'),
        ]);
        setStats({ ...codeRes.data, ...statsRes.data });
      } catch { showToast(t('toast.referralLoadFailed'), 'error'); }
      finally { setLoading(false); }
    })();
  }, []);

  const referralLink = stats?.code
    ? `https://app.loyaltysystem.uk?ref=${stats.code}`
    : '';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { showToast(t('toast.codeCopyFailed'), 'error'); }
  };

  const shareLink = async () => {
    try {
      await navigator.share?.({
        title: t('referral.shareTitle'),
        text: t('referral.shareText', { code: stats?.code ?? '' }),
        url: referralLink,
      });
    } catch { /* cancelled */ }
  };

  const initials = user?.name?.charAt(0)?.toUpperCase() || 'U';

  return (
    <div className="referral-screen">
      <div className="sub-page-header">
        <div className="sub-header-left">
          <button className="sub-back-btn" onClick={() => setPage('profile')} aria-label={t('common.back')}>
            <ArrowLeft size={20} />
          </button>
          <h1 className="sub-page-title">{t('referral.title')}</h1>
        </div>
        <div className="ad-spacer" />
      </div>

      <div className="referral-scroll">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: LOKA.textMuted }}>{t('common.loading')}</div>
        ) : stats ? (
          <>
            {/* Stats card */}
            <div className="referral-stats-card">
              <div className="referral-stats-top">
                <div className="referral-stats-avatar">{initials}</div>
                <div>
                  <div className="referral-stats-name">{user?.name || t('referral.member')}</div>
                  <div className="referral-stats-sub">{t('referral.partnerSince', { year: 2024 })}</div>
                </div>
              </div>
              <div className="referral-big-numbers">
                <div className="referral-big-stat">
                  <div className="referral-big-num">{stats.referrals}</div>
                  <div className="referral-big-label">{t('referral.referrals')}</div>
                </div>
                <div className="referral-big-stat">
                  <div className="referral-big-num">{stats.points_earned.toLocaleString()}</div>
                  <div className="referral-big-label">{t('referral.pointsEarned')}</div>
                </div>
                <div className="referral-big-stat">
                  <div className="referral-big-num">{stats.paid_rewards}</div>
                  <div className="referral-big-label">{t('referral.active')}</div>
                </div>
              </div>
              <div className="referral-progress-section">
                <div className="referral-progress-header">
                  <span className="referral-tier-label">{stats.referrals >= 10 ? t('referral.silverTier') : t('referral.bronzeTier')}</span>
                  <span className="referral-progress-text">{t('referral.toNextTier', { count: Math.max(0, 10 - stats.referrals) })}</span>
                </div>
                <div className="referral-progress-bar">
                  <div className="referral-progress-fill" style={{ width: `${Math.min(100, (stats.referrals / 10) * 100)}%` }} />
                </div>
              </div>
            </div>

            {/* Code box */}
            <div className="referral-code-box">
              <div className="referral-code-label">{t('referral.yourCode')}</div>
              <div className="referral-code-display">{stats.code}</div>
              {copied && (
                <div className="referral-copy-anim">
                  <Check size={14} />
                  {t('referral.copied')}
                </div>
              )}
              <div className="referral-code-actions">
                <button className="referral-btn-copy" onClick={copyLink}>
                  <Copy size={14} /> {t('referral.copyLink')}
                </button>
                <button className="referral-btn-share" onClick={shareLink}>
                  <Share2 size={14} /> {t('referral.share')}
                </button>
              </div>
            </div>

            {/* Milestones */}
            <div className="referral-milestones-title">{t('referral.milestonesTitle')}</div>
            {MILESTONES.map((m) => {
              const achieved = stats.referrals >= m.count;
              return (
                <div key={m.count} className={`referral-milestone-row ${achieved ? 'achieved' : ''}`}>
                  <div className={`referral-milestone-icon ${achieved ? 'done' : 'locked'}`}>
                    {achieved ? <Check size={14} /> : <Lock size={12} />}
                  </div>
                  <div className="referral-milestone-info">
                    <div className="referral-milestone-name">{t(`referral.tiers.${m.key}`)} — {t('referral.countReferrals', { count: m.count })}</div>
                    <div className="referral-milestone-desc">{t('referral.bonusPoints', { bonus: m.bonus.toLocaleString() })}</div>
                  </div>
                  {achieved && <Check size={14} color={LOKA.success} />}
                </div>
              );
            })}

            {/* Invited users */}
            {stats.invited_users.length > 0 && (
              <>
                <div className="referral-invited-title">
                  {t('referral.invitedUsers', { count: stats.total_invited })}
                </div>
                {stats.invited_users.map((u, i) => (
                  <div key={i} className="referral-invited-item">
                    <div className="referral-invited-avatar">
                      {u.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="referral-invited-details">
                      <div className="referral-invited-name">{u.name || t('referral.unknown')}</div>
                      <div className="referral-invited-meta">
                        {t('referral.joined', { date: u.joined_at ? new Date(u.joined_at).toLocaleDateString('en-MY', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' })}
                      </div>
                    </div>
                    <div className="referral-invited-right">
                      <span className={`referral-status-badge ${u.reward_paid ? 'rewarded' : 'pending'}`}>
                        {u.reward_paid ? t('referral.rewarded') : t('referral.pending')}
                      </span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        ) : (
          <div style={{ padding: 40, textAlign: 'center', color: LOKA.textMuted }}>
            {t('referral.loadError')}
          </div>
        )}
      </div>
    </div>
  );
}
