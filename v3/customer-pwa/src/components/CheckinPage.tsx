'use client';

import { useState, useEffect, useCallback } from 'react';
import { CalendarCheck, Flame, Gift, Clock } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/stores/authStore';
import { LOKA } from '@/lib/tokens';
import api from '@/lib/api';

interface CheckinData {
  checked_in_today: boolean;
  current_streak: number;
  points_today: number;
  config: {
    daily_base_points: number;
    streak_increment: number;
    streak_7day_bonus: number;
    max_streak_days: number;
  };
}

interface CheckinResult {
  checked_in: boolean;
  streak_day: number;
  points_earned: number;
  total_points: number;
  next_bonus_day: number;
}

export default function CheckinPage() {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState<CheckinData | null>(null);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/checkin');
      setData(res.data as unknown as CheckinData);
    } catch {
      // silently fail — user may not be logged in
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) load();
    else setLoading(false);
  }, [isAuthenticated, load]);

  const handleCheckin = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await api.post('/checkin');
      setResult(res.data as unknown as CheckinResult);
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="home-empty" style={{ paddingTop: 80 }}>
        <div className="home-empty-icon"><CalendarCheck size={40} strokeWidth={1.5} /></div>
        <p className="home-empty-text">{t('auth.signInRequired')}</p>
      </div>
    );
  }

  if (loading) {
    return <div className="skeleton home-skeleton-card" style={{ height: 300, margin: 16 }} />;
  }

  const cfg = data?.config;
  const streakDays = Array.from({ length: cfg?.max_streak_days || 7 }, (_, i) => i + 1);

  return (
    <div style={{ padding: '16px 16px 120px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 24, marginTop: 12 }}>
        <div style={{
          width: 64, height: 64, borderRadius: 32,
          background: `linear-gradient(135deg, ${LOKA.copper}, #C4893A)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 12px',
          boxShadow: '0 4px 16px rgba(196,137,58,0.3)',
        }}>
          <Flame size={32} color="#fff" />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: LOKA.primary, margin: '0 0 4px' }}>
          {t('checkin.title')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--loka-text-muted)', margin: 0 }}>
          {t('checkin.subtitle')}
        </p>
      </div>

      {/* Streak Bar */}
      <div className="surface-card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--loka-text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
            {t('checkin.streak')}
          </span>
          <span style={{ fontSize: 24, fontWeight: 800, color: LOKA.copper }}>
            {data?.current_streak || 0} / {cfg?.max_streak_days || 7}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {streakDays.map((day) => {
            const filled = day <= (data?.current_streak || 0);
            return (
              <div
                key={day}
                style={{
                  flex: 1, height: 8, borderRadius: 4,
                  background: filled
                    ? `linear-gradient(90deg, ${LOKA.copper}, #C4893A)`
                    : 'var(--loka-cream)',
                  transition: 'background 0.3s',
                }}
              />
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          {streakDays.map((day) => (
            <span
              key={day}
              style={{
                flex: 1, fontSize: 10, textAlign: 'center',
                color: day <= (data?.current_streak || 0) ? LOKA.copper : 'var(--loka-text-muted)',
                fontWeight: day <= (data?.current_streak || 0) ? 700 : 400,
              }}
            >
              D{day}
            </span>
          ))}
        </div>
      </div>

      {/* Reward Tiers */}
      <div className="surface-card" style={{ padding: 20, marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: LOKA.primary, margin: '0 0 12px' }}>
          <Gift size={14} style={{ display: 'inline', marginRight: 6 }} />
          {t('checkin.rewards')}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: 'var(--loka-text-muted)' }}>{t('checkin.dailyBase')}</span>
            <span style={{ fontWeight: 700, color: LOKA.copper }}>+{cfg?.daily_base_points || 10} pts</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: 'var(--loka-text-muted)' }}>{t('checkin.streakBonus')}</span>
            <span style={{ fontWeight: 700, color: LOKA.copper }}>+{cfg?.streak_increment || 2} pts/day</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: 'var(--loka-text-muted)' }}>{t('checkin.sevenDayBonus')}</span>
            <span style={{ fontWeight: 700, color: LOKA.copper }}>+{cfg?.streak_7day_bonus || 20} pts</span>
          </div>
        </div>
      </div>

      {/* Check-in Button */}
      {data?.checked_in_today ? (
        result || data.checked_in_today ? (
          <div
            style={{
              textAlign: 'center', padding: 20, borderRadius: 16,
              background: `linear-gradient(135deg, ${LOKA.copper}, #C4893A)`,
              color: '#fff', marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>
              {t('checkin.checkedIn')}
            </div>
            <div style={{ fontSize: 14, opacity: 0.9 }}>
              {t('checkin.pointsEarned').replace('{points}', String(data.points_today || result?.points_earned || 0))}
            </div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
              <Clock size={12} style={{ display: 'inline', marginRight: 4 }} />
              {t('checkin.comeBackTomorrow')}
            </div>
          </div>
        ) : null
      ) : (
        <>
          {error && (
            <div style={{
              padding: 12, borderRadius: 12, background: '#FEE2E2', color: '#991B1B',
              fontSize: 13, textAlign: 'center', marginBottom: 12,
            }}>
              {error}
            </div>
          )}
          <button
            onClick={handleCheckin}
            disabled={submitting}
            style={{
              width: '100%', padding: '16px 24px', borderRadius: 16,
              background: `linear-gradient(135deg, ${LOKA.copper}, #7A4A2E)`,
              color: '#fff', border: 'none', fontSize: 16, fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.6 : 1,
              boxShadow: '0 4px 16px rgba(122,74,46,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              marginBottom: 16,
            }}
          >
            <CalendarCheck size={20} />
            {submitting ? t('common.loading') : t('checkin.checkInNow')}
          </button>
        </>
      )}
    </div>
  );
}
