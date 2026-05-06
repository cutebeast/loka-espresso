'use client';

import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Share2, Copy, Users, Check, Lock, Gift } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useConfigStore } from '@/stores/configStore';
import { useTranslation } from '@/hooks/useTranslation';
import api from '@/lib/api';
import { LOKA, resolveAppUrl } from '@/lib/tokens';

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

interface Milestone {
  count: number;
  key: string;
  bonus: number;
}

const MILESTONE_TEMPLATES: Array<{ count: number; key: string; multiplier: number }> = [
  { count: 5, key: 'bronze', multiplier: 10 },
  { count: 10, key: 'silver', multiplier: 24 },
  { count: 15, key: 'gold', multiplier: 40 },
  { count: 25, key: 'platinum', multiplier: 100 },
];

export default function ReferralPage() {
  const { setPage, showToast } = useUIStore();
  const { user } = useAuthStore();
  const config = useConfigStore((s) => s.config);
  const { t } = useTranslation();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const milestones = useMemo<Milestone[]>(() => {
    const baseReward = config.referral_reward_points || 50;
    return MILESTONE_TEMPLATES.map(m => ({
      count: m.count,
      key: m.key,
      bonus: m.multiplier * baseReward,
    }));
  }, [config.referral_reward_points]);

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
    ? `${resolveAppUrl('/')}?ref=${stats.code}`
    : '';

  const partnerYear = user?.created_at
    ? new Date(user.created_at).getFullYear()
    : undefined;

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
                  <div className="referral-stats-sub">
                    {partnerYear ? t('referral.partnerSince', { year: partnerYear }) : t('referral.unknown')}
                  </div>
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
            {milestones.map((m) => {
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
            {stats.invited_users?.length > 0 && (
              <>
                <div className="referral-section-title">{t('referral.invitedUsers', { count: stats.invited_users.length })}</div>
                {stats.invited_users.map((inv, i) => (
                  <div key={i} className="referral-invitee-row">
                    <div className="referral-invitee-avatar">{inv.name?.charAt(0)?.toUpperCase() || '?'}</div>
                    <div className="referral-invitee-info">
                      <div className="referral-invitee-name">{inv.name || t('referral.unknown')}</div>
                      <div className="referral-invitee-meta">
                        {t('referral.joined')} · {inv.order_count} {t('orders.title')}
                      </div>
                    </div>
                    {inv.reward_paid ? (
                      <span className="referral-invitee-badge">{t('referral.rewarded')}</span>
                    ) : (
                      <span className="referral-invitee-badge pending">{t('referral.pending')}</span>
                    )}
                  </div>
                ))}
              </>
            )}
          </>
        ) : (
          <div className="referral-empty">
            <Gift size={48} color={LOKA.border} />
            <p>{t('common.error')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
