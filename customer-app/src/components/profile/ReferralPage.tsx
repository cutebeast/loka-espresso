'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Share2, Copy, Users, Check, Lock, Gift } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
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
  { count: 5, label: 'Bronze', bonus: 500, icon: '🔓' },
  { count: 10, label: 'Silver', bonus: 1200, icon: '🔓' },
  { count: 15, label: 'Gold', bonus: 2000, icon: '🔒' },
  { count: 25, label: 'Platinum', bonus: 5000, icon: '🔒' },
];

export default function ReferralPage() {
  const { setPage, showToast } = useUIStore();
  const { user } = useAuthStore();
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
      } catch { /* ignore */ }
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
    } catch { /* ignore */ }
  };

  const shareLink = async () => {
    try {
      await navigator.share?.({
        title: 'Join Loka Espresso',
        text: `Use my referral code ${stats?.code ?? ''} to join Loka Espresso!`,
        url: referralLink,
      });
    } catch { /* cancelled */ }
  };

  const initials = user?.name?.charAt(0)?.toUpperCase() || 'U';

  return (
    <div className="referral-screen">
      <div className="sub-page-header">
        <div className="sub-header-left">
          <button className="sub-back-btn" onClick={() => setPage('profile')} aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <h1 className="sub-page-title">Referral</h1>
        </div>
        <div className="ad-spacer" />
      </div>

      <div className="referral-scroll">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: LOKA.textMuted }}>Loading...</div>
        ) : stats ? (
          <>
            {/* Stats card */}
            <div className="referral-stats-card">
              <div className="referral-stats-top">
                <div className="referral-stats-avatar">{initials}</div>
                <div>
                  <div className="referral-stats-name">{user?.name || 'Member'}</div>
                  <div className="referral-stats-sub">Referral Partner since 2024</div>
                </div>
              </div>
              <div className="referral-big-numbers">
                <div className="referral-big-stat">
                  <div className="referral-big-num">{stats.referrals}</div>
                  <div className="referral-big-label">Referrals</div>
                </div>
                <div className="referral-big-stat">
                  <div className="referral-big-num">{stats.points_earned.toLocaleString()}</div>
                  <div className="referral-big-label">Points Earned</div>
                </div>
                <div className="referral-big-stat">
                  <div className="referral-big-num">{stats.paid_rewards}</div>
                  <div className="referral-big-label">Active</div>
                </div>
              </div>
              <div className="referral-progress-section">
                <div className="referral-progress-header">
                  <span className="referral-tier-label">{stats.referrals >= 10 ? 'Silver Tier' : 'Bronze Tier'}</span>
                  <span className="referral-progress-text">{Math.max(0, 10 - stats.referrals)} more to next tier</span>
                </div>
                <div className="referral-progress-bar">
                  <div className="referral-progress-fill" style={{ width: `${Math.min(100, (stats.referrals / 10) * 100)}%` }} />
                </div>
              </div>
            </div>

            {/* Code box */}
            <div className="referral-code-box">
              <div className="referral-code-label">Your Referral Code</div>
              <div className="referral-code-display">{stats.code}</div>
              {copied && (
                <div className="referral-copy-anim">
                  <Check size={14} />
                  Copied to clipboard
                </div>
              )}
              <div className="referral-code-actions">
                <button className="referral-btn-copy" onClick={copyLink}>
                  <Copy size={14} /> Copy Link
                </button>
                <button className="referral-btn-share" onClick={shareLink}>
                  <Share2 size={14} /> Share
                </button>
              </div>
            </div>

            {/* Milestones */}
            <div className="referral-milestones-title">Referral Milestones</div>
            {MILESTONES.map((m) => {
              const achieved = stats.referrals >= m.count;
              return (
                <div key={m.count} className={`referral-milestone-row ${achieved ? 'achieved' : ''}`}>
                  <div className={`referral-milestone-icon ${achieved ? 'done' : 'locked'}`}>
                    {achieved ? <Check size={14} /> : <Lock size={12} />}
                  </div>
                  <div className="referral-milestone-info">
                    <div className="referral-milestone-name">{m.label} — {m.count} Referrals</div>
                    <div className="referral-milestone-desc">+{m.bonus.toLocaleString()} bonus points</div>
                  </div>
                  {achieved && <Check size={14} color={LOKA.success} />}
                </div>
              );
            })}

            {/* Invited users */}
            {stats.invited_users.length > 0 && (
              <>
                <div className="referral-invited-title">
                  Invited Users ({stats.total_invited})
                </div>
                {stats.invited_users.map((u, i) => (
                  <div key={i} className="referral-invited-item">
                    <div className="referral-invited-avatar">
                      {u.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="referral-invited-details">
                      <div className="referral-invited-name">{u.name || 'Unknown'}</div>
                      <div className="referral-invited-meta">
                        Joined {u.joined_at ? new Date(u.joined_at).toLocaleDateString('en-MY', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </div>
                    </div>
                    <div className="referral-invited-right">
                      <span className={`referral-status-badge ${u.reward_paid ? 'rewarded' : 'pending'}`}>
                        {u.reward_paid ? 'Rewarded' : 'Pending'}
                      </span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        ) : (
          <div style={{ padding: 40, textAlign: 'center', color: LOKA.textMuted }}>
            Unable to load referral data
          </div>
        )}
      </div>
    </div>
  );
}
