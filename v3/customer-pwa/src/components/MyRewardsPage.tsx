'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Gift, Ticket, Clock, QrCode, Shield } from 'lucide-react';
import { useWalletStore } from '@/stores/walletStore';
import type { UserReward, UserVoucher } from '@/lib/api';
import { LOKA, resolveAssetUrl } from '@/lib/tokens';
import { useTranslation } from '@/hooks/useTranslation';

interface MyRewardsPageProps {
  onBack: () => void;
  initialTab?: 'rewards' | 'vouchers';
}

type Tab = 'rewards' | 'vouchers';

export default function MyRewardsPage({ onBack, initialTab }: MyRewardsPageProps) {
  const { t } = useTranslation();
  const { rewards, vouchers, refreshWallet } = useWalletStore();

  const [activeTab, setActiveTab] = useState<Tab>(initialTab ?? 'rewards');
  const [selectedReward, setSelectedReward] = useState<UserReward | null>(null);
  const [selectedVoucher, setSelectedVoucher] = useState<UserVoucher | null>(null);

  useEffect(() => {
    refreshWallet();
  }, [refreshWallet]);

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-MY', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const [now] = useState(() => Date.now());

  const daysUntil = (dateStr: string | null | undefined): number | null => {
    if (!dateStr) return null;
    const diff = new Date(dateStr).getTime() - now;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const getCountdownClass = (days: number) => days <= 3 ? 'danger' : 'warn';

  const availableRewards = rewards.filter((r) => r.status === 'available');
  const availableVouchers = vouchers.filter((v) => v.status === 'available');
  const totalOwned = rewards.length + vouchers.length;
  const usedThisMonth = rewards.filter((r) => r.status === 'used').length;

  return (
    <div className="myrv-screen">
      <div className="sub-page-header">
        <div className="sub-header-left">
          <button className="sub-back-btn" onClick={onBack} aria-label={t('common.back')}>
            <ArrowLeft size={20} />
          </button>
          <h1 className="sub-page-title">{t('myRewards.title')}</h1>
        </div>
        <div className="w-9" />
      </div>

      {/* Progress indicator */}
      {totalOwned > 0 && (
        <div className="myrv-progress-section">
          <div className="myrv-progress-header">
            <span className="myrv-progress-label">{t('myRewards.usedThisMonth')}</span>
            <span className="myrv-progress-value">{usedThisMonth} of {totalOwned}</span>
          </div>
          <div className="myrv-progress-bar">
            <div className="myrv-progress-fill" style={{ width: `${Math.min(100, (usedThisMonth / Math.max(1, totalOwned)) * 100)}%` }} />
          </div>
        </div>
      )}

      <div className="myrv-tab-bar">
        <button className={`myrv-tab ${activeTab === 'rewards' ? 'active' : ''}`} onClick={() => setActiveTab('rewards')}>
          My Rewards <span className="count">{availableRewards.length}</span>
        </button>
        <button className={`myrv-tab ${activeTab === 'vouchers' ? 'active' : ''}`} onClick={() => setActiveTab('vouchers')}>
          My Vouchers <span className="count">{availableVouchers.length}</span>
        </button>
      </div>

      <div className="myrv-owned-list">
        {activeTab === 'rewards' ? (
          availableRewards.length === 0 ? (
            <div className="myrv-empty">
              <div className="myrv-empty-icon"><Gift size={40} color={LOKA.borderLight} /></div>
              <div className="myrv-empty-title">{t('myRewards.noRewards')}</div>
              <div className="myrv-empty-desc">{t('myRewards.redeemDesc')}</div>
            </div>
          ) : (
            availableRewards.map((reward) => {
              const days = daysUntil(reward.expires_at);
              return (
                <div key={reward.id} className="myrv-owned-card" onClick={() => setSelectedReward(reward)}>
                  <div className="myrv-item-thumb">
                    {reward.reward_image_url ? (
                      <img src={resolveAssetUrl(reward.reward_image_url) ?? undefined} alt="" loading="lazy" />
                    ) : (
                      <Gift size={24} />
                    )}
                  </div>
                  <div className="myrv-item-body">
                    <div className="myrv-item-title">{reward.reward_name}</div>
                    <div className="myrv-item-hint">{t('myRewards.tapToView')}</div>
                    {days != null && (
                      <span className={`myrv-countdown ${getCountdownClass(days)}`}>
                        <Clock size={12} />
                        {days <= 0 ? t('myRewards.expiresToday') : t('myRewards.expiresIn', { count: days, days })}
                      </span>
                    )}
                    {reward.expires_at && (
                      <div className="myrv-item-expiry">Expires {formatDate(reward.expires_at)}</div>
                    )}
                  </div>
                </div>
              );
            })
          )
        ) : availableVouchers.length === 0 ? (
          <div className="myrv-empty">
            <div className="myrv-empty-icon"><Ticket size={40} color={LOKA.borderLight} /></div>
            <div className="myrv-empty-title">{t('myRewards.noVouchers')}</div>
            <div className="myrv-empty-desc">{t('myRewards.claimDesc')}</div>
          </div>
        ) : (
          availableVouchers.map((voucher) => {
            const days = daysUntil(voucher.expires_at);
            return (
              <div key={voucher.id} className="myrv-voucher-card" onClick={() => setSelectedVoucher(voucher)}>
                <div className="myrv-item-thumb" style={{ background: 'var(--loka-primary)', color: 'white' }}>
                  <Ticket size={24} />
                </div>
                <div className="myrv-item-body">
                  <div className="myrv-voucher-source">{voucher.source || t('myRewards.promoVoucher')}</div>
                  <div className="myrv-voucher-discount">
                    {voucher.discount_type === 'percentage' || voucher.discount_type === 'percent'
                      ? `${voucher.discount_value}% OFF`
                      : voucher.discount_type === 'free_item'
                        ? t('myRewards.freeItem')
                        : `RM ${Number(voucher.discount_value).toFixed(2)} OFF`}
                  </div>
                  {days != null && (
                    <span className={`myrv-countdown ${getCountdownClass(days)}`}>
                      <Clock size={12} />
                      {days <= 0 ? t('myRewards.expiresToday') : t('myRewards.expiresIn', { count: days, days })}
                    </span>
                  )}
                  {voucher.expires_at && (
                    <div className="myrv-voucher-expiry">Expires {formatDate(voucher.expires_at)}</div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Reward detail sheet — NO CODE SHOWN */}
      {selectedReward && (
        <div className="myrv-sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSelectedReward(null); }}>
          <div className="myrv-sheet">
            <div className="myrv-sheet-handle" />
            <div className="myrv-sheet-title">{selectedReward.reward_name}</div>
            <div className="myrv-sheet-sub">{t('myRewards.showToCashier')}</div>
            <div className="myrv-sheet-info">
              <div className="myrv-sheet-info-icon">
                <QrCode size={40} color="var(--loka-primary)" />
              </div>
              <div className="myrv-sheet-info-text">
                {t('myRewards.redemptionInfo')}
              </div>
            </div>
            {selectedReward.expires_at && (
              <div className="myrv-sheet-expiry">Expires {formatDate(selectedReward.expires_at)}</div>
            )}
            <button className="myrv-sheet-close-btn" onClick={() => setSelectedReward(null)}>{t('common.done')}</button>
          </div>
        </div>
      )}

      {/* Voucher detail sheet — NO CODE SHOWN */}
      {selectedVoucher && (
        <div className="myrv-sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSelectedVoucher(null); }}>
          <div className="myrv-sheet">
            <div className="myrv-sheet-handle" />
            <div className="myrv-sheet-title">
              {selectedVoucher.discount_type === 'percentage' || selectedVoucher.discount_type === 'percent'
                ? `${selectedVoucher.discount_value}% OFF`
                : selectedVoucher.discount_type === 'free_item'
                  ? t('myRewards.freeItem')
                  : `RM ${Number(selectedVoucher.discount_value).toFixed(2)} OFF`}
            </div>
            <div className="myrv-sheet-sub">
              {selectedVoucher.source || t('myRewards.promoVoucher')} · {t('myRewards.minSpend', { amount: Number(selectedVoucher.min_spend || 0).toFixed(2) })}
            </div>
            <div className="myrv-sheet-info">
              <div className="myrv-sheet-info-icon">
                <Shield size={40} color="var(--loka-primary)" />
              </div>
              <div className="myrv-sheet-info-text">
                {t('myRewards.voucherInfo')}
              </div>
            </div>
            {selectedVoucher.expires_at && (
              <div className="myrv-sheet-expiry">Expires {formatDate(selectedVoucher.expires_at)}</div>
            )}
            <button className="myrv-sheet-close-btn" onClick={() => setSelectedVoucher(null)}>{t('common.done')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
