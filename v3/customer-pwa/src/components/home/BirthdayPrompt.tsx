'use client';

import { Cake } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useTranslation } from '@/hooks/useTranslation';

/** Profile-enrichment prompt (mockup: "Tell us when your birthday is to
 * unlock an annual celebratory treat — [ Complete Profile ]"). Shown only to
 * signed-in members who haven't set a birthday yet. */
export default function BirthdayPrompt() {
  const { t } = useTranslation();
  const { setPage } = useUIStore();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated || !user || user.date_of_birth) return null;

  return (
    <button className="home-extra-card home-birthday" onClick={() => setPage('account-details')}>
      <div className="home-extra-title">
        <Cake size={14} color="var(--color-gold)" /> {t('homeExtras.profileEnrichment')}
      </div>
      <div className="home-extra-sub">{t('homeExtras.birthdayPrompt')}</div>
      <div className="home-extra-cta">{t('homeExtras.completeProfile')}</div>
    </button>
  );
}
