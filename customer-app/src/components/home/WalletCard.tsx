'use client';

import { Wallet, Crown, Gift, Ticket, ChevronRight, ArrowRight, Award } from 'lucide-react';
import { formatPrice } from '@/lib/tokens';

interface WalletCardProps {
  isGuest: boolean;
  balance: number;
  points: number;
  tier: string;
  onTopUp: () => void;
  onRewards: () => void;
  onVouchers: () => void;
  onSignIn: () => void;
}

export default function WalletCard({ isGuest, balance, points, tier, onTopUp, onRewards, onVouchers, onSignIn }: WalletCardProps) {
  if (isGuest) {
    return (
      <div className="wallet-card wallet-card-guest" onClick={onSignIn}>
        <div className="wallet-row">
          <span className="balance-label">
            <Wallet size={14} strokeWidth={2} /> Loka Wallet
          </span>
        </div>
        <div className="wallet-row wallet-row-mt">
          <span className="guest-wallet-text">Sign in to access wallet & rewards</span>
        </div>
        <div className="wallet-chip-row">
          <span className="wallet-chip wallet-chip-signin">
            <ArrowRight size={12} strokeWidth={2} /> Sign In
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="wallet-row">
        <span className="balance-label">
          <Wallet size={14} strokeWidth={2} /> Loka Balance
        </span>
        <button
          className="topup-btn"
          onClick={(e) => { e.stopPropagation(); onTopUp(); }}
        >
          Top Up <ChevronRight size={12} />
        </button>
      </div>
      <div className="wallet-row wallet-row-mt">
        <span className="amount">{formatPrice(balance)}</span>
        <span className="points-badge">
          <Crown size={12} strokeWidth={2} /> {points.toLocaleString()} pts
        </span>
      </div>
      <div className="wallet-tier-row">
        <div className="wallet-tier-badge">
          <Award size={12} strokeWidth={2} />
          <span>{tier} Member</span>
        </div>
      </div>
      <div className="wallet-chip-row">
        <span className="wallet-chip" onClick={(e) => { e.stopPropagation(); onRewards(); }}>
          <Gift size={12} strokeWidth={2} /> Rewards
        </span>
        <span className="wallet-chip" onClick={(e) => { e.stopPropagation(); onVouchers(); }}>
          <Ticket size={12} strokeWidth={2} /> Vouchers
        </span>
      </div>
    </>
  );
}
