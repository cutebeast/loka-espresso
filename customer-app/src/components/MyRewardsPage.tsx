'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Gift, Ticket, Copy, Check } from 'lucide-react';
import { useWalletStore } from '@/stores/walletStore';
import { useUIStore } from '@/stores/uiStore';
import type { UserReward, UserVoucher } from '@/lib/api';

interface MyRewardsPageProps {
  onBack: () => void;
  initialTab?: 'rewards' | 'vouchers';
}

type Tab = 'rewards' | 'vouchers';

export default function MyRewardsPage({ onBack, initialTab }: MyRewardsPageProps) {
  const { rewards, vouchers, refreshWallet } = useWalletStore();
  const { showToast } = useUIStore();

  const [activeTab, setActiveTab] = useState<Tab>(initialTab ?? 'rewards');
  const [selectedReward, setSelectedReward] = useState<UserReward | null>(null);
  const [selectedVoucher, setSelectedVoucher] = useState<UserVoucher | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  useEffect(() => {
    refreshWallet();
  }, [refreshWallet]);

  const handleCopyCode = (code: string, id: number) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedId(id);
      showToast('Code copied!', 'success');
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-MY', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const availableRewards = rewards.filter((r) => r.status === 'available');
  const availableVouchers = vouchers.filter((v) => v.status === 'available');

  return (
    <div className="myrv-screen">
      <div className="sub-page-header">
        <div className="sub-header-left">
          <button className="sub-back-btn" onClick={onBack} aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <h1 className="sub-page-title">My Rewards & Vouchers</h1>
        </div>
        <div className="mrewards-spacer" />
      </div>

      <div className="myrv-tab-bar">
        <button
          className={`myrv-tab ${activeTab === 'rewards' ? 'active' : ''}`}
          onClick={() => setActiveTab('rewards')}
        >
          My Rewards ({availableRewards.length})
        </button>
        <button
          className={`myrv-tab ${activeTab === 'vouchers' ? 'active' : ''}`}
          onClick={() => setActiveTab('vouchers')}
        >
          My Vouchers ({availableVouchers.length})
        </button>
      </div>

      <div className="myrv-owned-list">
        {activeTab === 'rewards' ? (
          availableRewards.length === 0 ? (
            <div className="mrewards-empty">
              <span className="mrewards-empty-icon"><Gift size={40} color="#D4DCE5" /></span>
              <p className="mrewards-empty-title">No rewards yet</p>
              <p className="mrewards-empty-text">Redeem rewards to see them here</p>
            </div>
          ) : (
            availableRewards.map((reward) => (
              <div key={reward.id} className="myrv-owned-card" onClick={() => setSelectedReward(reward)}>
                <div className="myrv-item-icon myrv-icon-reward">
                  <Gift size={24} />
                </div>
                <div className="myrv-item-body">
                  <div className="myrv-item-title">{reward.reward_name}</div>
                  <div className="myrv-item-desc">Tap to view redemption code</div>
                  <div className="myrv-item-code">{reward.redemption_code}</div>
                  <div className="myrv-item-expiry">Expires {formatDate(reward.expires_at)}</div>
                </div>
              </div>
            ))
          )
        ) : availableVouchers.length === 0 ? (
          <div className="mrewards-empty">
            <span className="mrewards-empty-icon"><Ticket size={40} color="#D4DCE5" /></span>
            <p className="mrewards-empty-title">No vouchers yet</p>
            <p className="mrewards-empty-text">Claim promotions to earn vouchers</p>
          </div>
        ) : (
          availableVouchers.map((voucher) => (
            <div key={voucher.id} className="myrv-owned-card" onClick={() => setSelectedVoucher(voucher)}>
              <div className="myrv-item-icon myrv-icon-voucher">
                <Ticket size={24} />
              </div>
              <div className="myrv-item-body">
                <div className="myrv-item-title">
                  {voucher.discount_type === 'percentage'
                    ? `${voucher.discount_value}% off`
                    : `RM ${Number(voucher.discount_value).toFixed(2)} off`}
                </div>
                <div className="myrv-item-desc">{voucher.source || 'Promo voucher'}</div>
                <div className="myrv-item-code">{voucher.code}</div>
                <div className="myrv-item-expiry">Expires {formatDate(voucher.expires_at)}</div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Reward detail modal */}
      {selectedReward && (
        <div className="profile-modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) setSelectedReward(null); }}>
          <div className="profile-modal-box">
            <h3>{selectedReward.reward_name}</h3>
            <p className="mrewards-code">
              {selectedReward.redemption_code}
            </p>
            <p className="mrewards-modal-desc">Show this code at the counter</p>
            <div className="profile-modal-btns mrewards-modal-btns">
              <button
                className="profile-modal-btn profile-modal-btn-cancel"
                onClick={() => handleCopyCode(selectedReward.redemption_code, selectedReward.id)}
              >
                {copiedId === selectedReward.id ? (
                  <><span className="mrewards-copy-icon"><Check size={16} /></span> Copied</>
                ) : (
                  <><span className="mrewards-copy-icon"><Copy size={16} /></span> Copy</>
                )}
              </button>
              <button className="profile-modal-btn profile-modal-btn-confirm mrewards-close-btn" onClick={() => setSelectedReward(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Voucher detail modal */}
      {selectedVoucher && (
        <div className="profile-modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) setSelectedVoucher(null); }}>
          <div className="profile-modal-box">
            <h3>
              {selectedVoucher.discount_type === 'percentage'
                ? `${selectedVoucher.discount_value}% off`
                : `RM ${Number(selectedVoucher.discount_value).toFixed(2)} off`}
            </h3>
            <p className="mrewards-code">
              {selectedVoucher.code}
            </p>
            <p className="mrewards-modal-desc">Apply at checkout</p>
            <div className="profile-modal-btns mrewards-modal-btns">
              <button
                className="profile-modal-btn profile-modal-btn-cancel"
                onClick={() => handleCopyCode(selectedVoucher.code, selectedVoucher.id)}
              >
                {copiedId === selectedVoucher.id ? (
                  <><span className="mrewards-copy-icon"><Check size={16} /></span> Copied</>
                ) : (
                  <><span className="mrewards-copy-icon"><Copy size={16} /></span> Copy</>
                )}
              </button>
              <button className="profile-modal-btn profile-modal-btn-confirm mrewards-close-btn" onClick={() => setSelectedVoucher(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
