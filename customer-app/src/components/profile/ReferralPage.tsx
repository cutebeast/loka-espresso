'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Share2, Copy, Users, Gift, Check } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';

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
      } catch { console.error('Failed to load referral data'); }
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

  return (
    <div className="referral-screen">
      <div className="sub-page-header">
        <div className="sub-header-left">
          <button className="sub-back-btn" onClick={() => setPage('profile')} aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <h1 className="sub-page-title">Referral</h1>
        </div>
        <div className="st-spacer" />
      </div>

      <div className="profile-scroll">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>
        ) : stats ? (
          <>
            <div className="profile-user-card" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="profile-avatar" style={{ background: 'var(--color-copper)' }}>
                  <Users size={22} color="#fff" />
                </div>
                <div>
                  <div className="profile-user-name">{stats.referrals} referrals</div>
                  <div className="profile-points-row">
                    <Gift size={14} /> {stats.points_earned.toLocaleString()} points earned
                  </div>
                </div>
              </div>

              <div style={{ width: '100%', background: 'var(--color-bg-muted)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>Your referral code</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <code style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>{stats.code}</code>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={copyLink}>
                      {copied ? <Check size={16} color="var(--color-success)" /> : <Copy size={16} />}
                    </button>
                    {typeof navigator?.share === 'function' && (
                      <button className="btn btn-ghost btn-sm" onClick={shareLink}>
                        <Share2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {stats.invited_users.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div className="profile-section-title">Invited users</div>
                {stats.invited_users.map((u, i) => (
                  <div key={i} className="profile-preview-card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{u.name || 'Unknown'}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                        Joined {u.joined_at ? new Date(u.joined_at).toLocaleDateString() : '—'} · {u.order_count} order{u.order_count !== 1 ? 's' : ''}
                      </div>
                    </div>
                    {u.reward_paid && (
                      <span className="badge badge-green">Rewarded</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>Unable to load referral data</div>
        )}
      </div>
    </div>
  );
}
