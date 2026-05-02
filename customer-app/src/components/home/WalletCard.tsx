'use client';

import { useRef } from 'react';
import { ChevronRight } from 'lucide-react';
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
  const amountRef = useRef<HTMLSpanElement>(null);

  useFitText(amountRef, [balance], 14, 0.5);

  if (!isAuthenticated) {
    return (
      <div className="wallet-card wallet-card-guest" onClick={onSignIn}>
        <div className="wallet-row">
          <span className="balance-label">💰 Loka Wallet</span>
        </div>
        <div className="wallet-row wallet-row-mt">
          <span className="guest-wallet-text">Sign in to access wallet & rewards</span>
        </div>
        <div className="wallet-chip-row">
          <span className="wallet-chip wallet-chip-signin">Sign In →</span>
        </div>
      </div>
    );
  }

  return (
    <div className="wallet-card">
      <div className="wallet-row">
        <span className="balance-label">💰 Loka Balance</span>
        <button
          className="homepage-topup-btn"
          onClick={(e) => { e.stopPropagation(); onTopUp(); }}
        >
          Top Up <ChevronRight size={12} />
        </button>
      </div>
      <div className="wallet-row wallet-row-mt">
        <span className="amount-row">
          <span className="currency-symbol">RM</span>
          <span className="amount-number" ref={amountRef}>{formatRM(balance)}</span>
        </span>
        <span className="homepage-points-badge">
          <span className="homepage-points-icon">👑</span>
          <span className="homepage-points-value">{formatPoints(points)} pts</span>
        </span>
      </div>
      <div className="wallet-tier-row">
        <div className="wallet-tier-badge">
          🏆 {tier} Member
        </div>
      </div>
      <div className="wallet-chip-row">
        <span className="wallet-chip" onClick={(e) => { e.stopPropagation(); onRewards(); }}>
          🎁 Rewards
        </span>
        <span className="wallet-chip" onClick={(e) => { e.stopPropagation(); onVouchers(); }}>
          🎟️ Vouchers
        </span>
      </div>
    </div>
  );
}
