'use client';

import { useEffect, useMemo, useState } from 'react';
import { Crown, Lock, QrCode } from 'lucide-react';
import api from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';

interface LoyaltyTier {
  id: number;
  tier_key: string;
  display_name: string;
  min_lifetime_points: number;
  points_multiplier: number;
  benefits_config?: {
    birthday_bonus?: number;
    priority_support?: boolean;
    free_delivery_threshold?: number | null;
  } | null;
  color_hex?: string | null;
  sort_order: number;
}

interface MembershipHeroProps {
  points: number;
  lifetimePoints: number;
  tier: string;
  onScan: () => void;
  onRewards: () => void;
  onVouchers: () => void;
  onCheckin: () => void;
}

/**
 * "Loka Ritual" membership hero — digital membership card (gold-bordered,
 * ornamental corners), gold-gradient Tap-to-Scan button, and a locked
 * next-tier perks preview. Data: /loyalty/me via walletStore props +
 * public /loyalty/tiers for thresholds and benefits.
 */
export default function MembershipHero({ points, lifetimePoints, tier, onScan, onRewards, onVouchers, onCheckin }: MembershipHeroProps) {
  const { t } = useTranslation();
  const [tiers, setTiers] = useState<LoyaltyTier[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.get('/loyalty/tiers')
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res.data) ? res.data : [];
        setTiers([...list].sort((a, b) => a.min_lifetime_points - b.min_lifetime_points));
      })
      .catch(() => setTiers([]));
    return () => { cancelled = true; };
  }, []);

  const { nextTier, progressPct, pointsToNext } = useMemo(() => {
    if (tiers.length === 0) return { nextTier: null as LoyaltyTier | null, progressPct: 0, pointsToNext: 0 };
    const next = tiers.find((t2) => t2.min_lifetime_points > lifetimePoints) || null;
    if (!next) return { nextTier: null, progressPct: 100, pointsToNext: 0 };
    const currentMin = Math.max(0, ...tiers.filter((t2) => t2.min_lifetime_points <= lifetimePoints).map((t2) => t2.min_lifetime_points));
    const span = Math.max(1, next.min_lifetime_points - currentMin);
    const pct = Math.min(100, Math.max(0, ((lifetimePoints - currentMin) / span) * 100));
    return { nextTier: next, progressPct: pct, pointsToNext: Math.max(0, next.min_lifetime_points - lifetimePoints) };
  }, [tiers, lifetimePoints]);

  const perksText = useMemo(() => {
    if (!nextTier) return t('home.hero.topTier');
    const parts: string[] = [];
    if (nextTier.points_multiplier && nextTier.points_multiplier > 1) {
      parts.push(t('home.hero.perkMultiplier', { mult: nextTier.points_multiplier }));
    }
    if (nextTier.benefits_config?.priority_support) parts.push(t('home.hero.perkSupport'));
    if (nextTier.benefits_config?.free_delivery_threshold != null) parts.push(t('home.hero.perkDelivery'));
    return parts.length > 0 ? parts.join(' · ') : t('home.hero.perkGeneric', { tier: nextTier.display_name });
  }, [nextTier, t]);

  return (
    <div className="hero">
      {/* Digital membership card */}
      <div className="hero-card">
        <span className="hero-corner hero-corner-tl" />
        <span className="hero-corner hero-corner-tr" />
        <span className="hero-corner hero-corner-bl" />
        <span className="hero-corner hero-corner-br" />
        <div className="hero-logo">
          LOKA <span>ESPRESSO</span>
        </div>
        <div className="hero-card-row">
          <div>
            <div className="hero-label">{t('home.hero.tierStatus')}</div>
            <div className="hero-tier">
              <Crown size={13} color="var(--color-gold)" fill="currentColor" /> {tier}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="hero-label">{t('home.hero.currentPoints')}</div>
            <div className="hero-points">{points.toLocaleString()}</div>
          </div>
        </div>
        <div className="hero-progress" role="progressbar" aria-valuenow={Math.round(progressPct)} aria-valuemin={0} aria-valuemax={100}>
          <div className="hero-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="hero-progress-text">
          {nextTier
            ? t('home.hero.pointsToNext', { count: pointsToNext, tier: nextTier.display_name })
            : t('home.hero.topTier')}
        </div>
      </div>

      {/* Gold gradient scan button */}
      <button className="hero-scan-btn" onClick={onScan} aria-label={t('home.hero.scanAria')}>
        <QrCode size={18} strokeWidth={2.2} />
        <span>{t('home.hero.scan')}</span>
      </button>

      {/* Tier status preview */}
      <div className="hero-preview">
        <div className="hero-preview-title">{t('home.hero.previewTitle')}</div>
        <div className="hero-preview-box">
          <Lock size={13} color="var(--color-gold)" />
          <span>
            <strong>{nextTier ? t('home.hero.locked') : t('home.hero.unlocked')}</strong>{' '}
            {nextTier ? t('home.hero.nextPerks', { tier: nextTier.display_name }) : ''} {perksText}
          </span>
        </div>
      </div>

      {/* Quick links */}
      <div className="hero-links">
        <button onClick={onRewards}>{t('home.wallet.rewards')}</button>
        <span aria-hidden>·</span>
        <button onClick={onVouchers}>{t('home.wallet.vouchers')}</button>
        <span aria-hidden>·</span>
        <button onClick={onCheckin}>{t('home.wallet.checkin')}</button>
      </div>
    </div>
  );
}
