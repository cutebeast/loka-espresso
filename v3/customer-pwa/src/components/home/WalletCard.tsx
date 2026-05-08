'use client';

import { useRef } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { ChevronRight, Wallet, Crown, Award, Gift, Ticket } from 'lucide-react';
import { useFitText } from '@/hooks/useFitText';

interface WalletCardProps {
  isGuest: boolean;
  isAuthenticated: boolean;
  balance: number;
  points: number;
  tier: string;
  onTopUp: () => void;
  onRewards: () => void;
  onVouchers: () => void;
  onSignIn: () => void;
}

function formatRM(value: number): string {
  return value.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPoints(value: number): string {
  return value.toLocaleString('en-MY');
}

export default function WalletCard({ isGuest, isAuthenticated, balance, points, tier, onTopUp, onRewards, onVouchers, onSignIn }: WalletCardProps) {
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
          <span className="currency-symbol">RM</span>
          <span className="amount-number" ref={amountRef}>{formatRM(balance)}</span>
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
      </div>
    </div>
  );
}
