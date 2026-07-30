'use client';

import { Share2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useTranslation } from '@/hooks/useTranslation';

/** Referral entry card — invites share a code; both sides earn when the
 * friend places their first order. Links to the full referral page. */
export default function ReferralCard() {
  const { t } = useTranslation();
  const { setPage } = useUIStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) return null;

  return (
    <button className="home-extra-card home-referral" onClick={() => setPage('referral')}>
      <div className="home-extra-title">
        <Share2 size={14} color="var(--color-gold)" /> {t('homeExtras.referralTitle')}
      </div>
      <div className="home-extra-sub">{t('homeExtras.referralBody')}</div>
      <div className="home-extra-cta">{t('homeExtras.referralCta')}</div>
    </button>
  );
}
