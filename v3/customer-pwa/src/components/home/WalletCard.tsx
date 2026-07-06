'use client';

import { useRef } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { ChevronRight, Wallet, Crown, Award, Gift, Ticket, CalendarCheck } from 'lucide-react';
import { useFitText } from '@/hooks/useFitText';
import { getLocale } from '@/stores/localeStore';
import { getCurrencySymbol } from '@/lib/tokens';

interface WalletCardProps {
  isGuest: boolean;
  isAuthenticated: boolean;
  balance: number;
  points: number;
  tier: string;
  onTopUp: () => void;
  onRewards: () => void;
  onVouchers: () => void;
  onCheckin: () => void;
  onSignIn: () => void;
}

function formatAmount(value: number): string {
  return value.toLocaleString(getLocale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPoints(value: number): string {
  return value.toLocaleString(getLocale());
}

export default function WalletCard({ isGuest: _isGuest, isAuthenticated, balance, points, tier, onTopUp, onRewards, onVouchers, onCheckin, onSignIn }: WalletCardProps) {
  const { t } = useTranslation();
  const amountRef = useRef<HTMLSpanElement>(null);

  useFitText(amountRef, [balance], 14, 0.5);

  if (!isAuthenticated) {
    return (
      <div className="wallet-card wallet-card-guest" onClick={onSignIn}>
        <div className="wallet-row">
          <span className="balance-label"><Wallet size={16} color="#C9A84C" /> {t('home.wallet.lokaWallet')}</span>
        </div>
        <div className="wallet-row wallet-row-mt">
          <span className="guest-wallet-text">{t('home.wallet.signInPrompt')}</span>
        </div>
        <div className="wallet-chip-row">
          <span className="wallet-chip wallet-chip-signin">{t('home.wallet.signIn')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="wallet-card">
      <div className="wallet-row">
        <span className="balance-label"><Wallet size={16} color="#C9A84C" /> {t('home.wallet.lokaBalance')}</span>
        <button
          className="homepage-topup-btn"
          onClick={(e) => { e.stopPropagation(); onTopUp(); }}
        >
          {t('home.wallet.topUp')} <ChevronRight size={12} />
        </button>
      </div>
      <div className="wallet-row wallet-row-mt">
        <span className="amount-row">
          <span className="currency-symbol">{getCurrencySymbol()}</span>
          <span className="amount-number" ref={amountRef}>{formatAmount(balance)}</span>
        </span>
        <span className="homepage-points-badge">
          <span className="homepage-points-icon"><Crown size={16} color="#C9A84C" /></span>
          <span className="homepage-points-value">{formatPoints(points)} {t('home.wallet.pts')}</span>
        </span>
      </div>
      <div className="wallet-tier-row">
        <div className="wallet-tier-badge">
          <Award size={14} color="#C4893A" /> {t('home.wallet.tierMember', { tier })}
        </div>
      </div>
      <div className="wallet-chip-row">
        <span className="wallet-chip" onClick={(e) => { e.stopPropagation(); onRewards(); }}>
          <Gift size={14} color="#3B4A1A" /> {t('home.wallet.rewards')}
        </span>
        <span className="wallet-chip" onClick={(e) => { e.stopPropagation(); onVouchers(); }}>
          <Ticket size={14} color="#C4893A" /> {t('home.wallet.vouchers')}
        </span>
        <span className="wallet-chip" onClick={(e) => { e.stopPropagation(); onCheckin(); }}>
          <CalendarCheck size={14} color="#3B4A1A" /> {t('home.wallet.checkin')}
        </span>
      </div>
    </div>
  );
}
