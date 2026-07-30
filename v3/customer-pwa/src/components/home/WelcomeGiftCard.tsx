'use client';

import { useState } from 'react';
import { Gift, X } from 'lucide-react';
import { useWalletStore } from '@/stores/walletStore';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useTranslation } from '@/hooks/useTranslation';
import { formatPrice } from '@/lib/tokens';

const DISMISS_KEY = 'loka-welcome-gift-dismissed';

/** Day-one discovery card — shown to new members while their welcome voucher
 * is still unused and the card hasn't been dismissed. */
export default function WelcomeGiftCard() {
  const { t } = useTranslation();
  const { setPage } = useUIStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const vouchers = useWalletStore((s) => s.vouchers);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (!isAuthenticated || dismissed) return null;
  const gift = vouchers.find((v) => v.source === 'welcome_reward' && (v.status === 'available' || v.status === 'active'));
  if (!gift) return null;

  const valueText = gift.discount_type === 'percentage_off'
    ? `${gift.discount_value}%`
    : formatPrice(Number(gift.discount_value));

  const dismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch { /* storage unavailable */ }
  };

  return (
    <div className="home-extra-card home-welcome-gift" onClick={() => setPage('my-rewards', { initialTab: 'vouchers' })} role="button">
      <button className="home-welcome-dismiss" onClick={dismiss} aria-label={t('common.close')}>
        <X size={14} />
      </button>
      <div className="home-extra-title">
        <Gift size={14} color="var(--color-gold)" /> {t('homeExtras.welcomeGiftTitle')}
      </div>
      <div className="home-extra-sub">{t('homeExtras.welcomeGiftBody', { value: valueText })}</div>
      <div className="home-extra-cta">{t('homeExtras.welcomeGiftCta')}</div>
    </div>
  );
}
