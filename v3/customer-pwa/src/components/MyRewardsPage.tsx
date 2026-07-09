'use client';

import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Gift, Ticket, Clock, QrCode, Shield, Copy, Check } from 'lucide-react';
import { Skeleton } from '@/components/ui';
import { useWalletStore } from '@/stores/walletStore';
import type { UserReward, UserVoucher } from '@/lib/api';
import { LOKA, formatPrice } from '@/lib/tokens';
import { useTranslation } from '@/hooks/useTranslation';
import { getLocale } from '@/stores/localeStore';
interface MyRewardsPageProps {
  onBack: () => void;
  initialTab?: 'rewards' | 'vouchers';
}
type Tab = 'rewards' | 'vouchers';
export default function MyRewardsPage({
  onBack,
  initialTab
}: MyRewardsPageProps) {
  const {
    t
  } = useTranslation();
  const {
    rewards,
    vouchers,
    refreshWallet
  } = useWalletStore();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab ?? 'rewards');
  const [selectedReward, setSelectedReward] = useState<UserReward | null>(null);
  const [selectedVoucher, setSelectedVoucher] = useState<UserVoucher | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    refreshWallet().finally(() => {
      if (mountedRef.current) setLoading(false);
    });
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    refreshWallet();
  }, [refreshWallet]);
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString(getLocale(), {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);
  const daysUntil = (dateStr: string | null | undefined): number | null => {
    if (!dateStr) return null;
    const diff = new Date(dateStr).getTime() - now;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };
  const getCountdownClass = (days: number) => days <= 3 ? 'danger' : 'warn';
  const availableRewards = rewards.filter(r => r.status === 'available' || r.status === 'active');
  const availableVouchers = vouchers.filter(v => v.status === 'available' || v.status === 'active');
  const totalOwned = rewards.length + vouchers.length;
  const usedThisMonth = rewards.filter(r => r.status === 'used').length;
  return <div className="myrv-screen">
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
      {totalOwned > 0 && <div className="myrv-progress-section">
          <div className="myrv-progress-header">
            <span className="myrv-progress-label">{t('myRewards.usedThisMonth')}</span>
            <span className="myrv-progress-value">{usedThisMonth}{t("my_rewards_page.of")}{totalOwned}</span>
          </div>
          <div className="myrv-progress-bar">
            <div className="myrv-progress-fill" style={{
          width: `${Math.min(100, usedThisMonth / Math.max(1, totalOwned) * 100)}%`
        }} />
          </div>
        </div>}

      <div className="myrv-tab-bar">
        <button className={`myrv-tab ${activeTab === 'rewards' ? 'active' : ''}`} onClick={() => setActiveTab('rewards')}>
          {t('myRewards.tabRewards')} <span className="count">{availableRewards.length}</span>
        </button>
        <button className={`myrv-tab ${activeTab === 'vouchers' ? 'active' : ''}`} onClick={() => setActiveTab('vouchers')}>
          {t('myRewards.tabVouchers')} <span className="count">{availableVouchers.length}</span>
        </button>
      </div>

      <div className="myrv-owned-list">
        {loading ? <div className="myrv-skeleton-list">
            {[1, 2, 3].map(i => <div key={i} style={{
          height: 80,
          borderRadius: 12,
          marginBottom: 12
        }}><Skeleton className="skeleton" /></div>)}
          </div> : activeTab === 'rewards' ? availableRewards.length === 0 ? <div className="myrv-empty">
              <div className="myrv-empty-icon"><Gift size={40} color={LOKA.borderLight} /></div>
              <div className="myrv-empty-title">{t('myRewards.noRewards')}</div>
              <div className="myrv-empty-desc">{t('myRewards.redeemDesc')}</div>
            </div> : availableRewards.map(reward => {
        const days = daysUntil(reward.expires_at);
        return <div key={reward.id} className="myrv-owned-card" onClick={() => setSelectedReward(reward)}>
                  <div className="myrv-item-thumb">
                    <Gift size={24} />
                  </div>
                  <div className="myrv-item-body">
                    <div className="myrv-item-title">{reward.reward_name}</div>
                    <div className="myrv-item-hint">{t('myRewards.tapToView')}</div>
                    {days != null && <span className={`myrv-countdown ${getCountdownClass(days)}`}>
                        <Clock size={12} />
                        {days <= 0 ? t('myRewards.expiresToday') : t('myRewards.expiresIn', {
                count: days,
                days
              })}
                      </span>}
                    {reward.expires_at && <div className="myrv-item-expiry">{t('myRewards.expires', {
                date: formatDate(reward.expires_at)
              })}</div>}
                  </div>
                </div>;
      }) : availableVouchers.length === 0 ? <div className="myrv-empty">
            <div className="myrv-empty-icon"><Ticket size={40} color={LOKA.borderLight} /></div>
            <div className="myrv-empty-title">{t('myRewards.noVouchers')}</div>
            <div className="myrv-empty-desc">{t('myRewards.claimDesc')}</div>
          </div> : availableVouchers.map(voucher => {
        const days = daysUntil(voucher.expires_at);
        return <div key={voucher.id} className="myrv-voucher-card" onClick={() => setSelectedVoucher(voucher)}>
                <div className="myrv-item-thumb" style={{
            background: 'var(--loka-primary)',
            color: 'white'
          }}>
                  <Ticket size={24} />
                </div>
                <div className="myrv-item-body">
                  <div className="myrv-voucher-source">{voucher.source || t('myRewards.promoVoucher')}</div>
                  <div className="myrv-voucher-discount">
                    {voucher.discount_type === 'percentage_off' ? `${voucher.discount_value}% OFF` : voucher.discount_type === 'free_item' ? t('myRewards.freeItem') : `${formatPrice(Number(voucher.discount_value))} OFF`}
                  </div>
                  {days != null && <span className={`myrv-countdown ${getCountdownClass(days)}`}>
                      <Clock size={12} />
                      {days <= 0 ? t('myRewards.expiresToday') : t('myRewards.expiresIn', {
                count: days,
                days
              })}
                    </span>}
                  {voucher.expires_at && <div className="myrv-voucher-expiry">{t('myRewards.expires', {
                date: formatDate(voucher.expires_at)
              })}</div>}
                </div>
              </div>;
      })}
      </div>

      {/* Reward detail sheet */}
      {selectedReward && <RewardDetailSheet reward={selectedReward} onClose={() => setSelectedReward(null)} t={t} formatDate={formatDate} />}

      {/* Voucher detail sheet */}
      {selectedVoucher && <VoucherDetailSheet voucher={selectedVoucher} onClose={() => setSelectedVoucher(null)} t={t} formatDate={formatDate} />}
    </div>;
}

function CopyCode({ code, t }: { code: string; t: ReturnType<typeof useTranslation>['t'] }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToastStatic(t('common.codeCopyFailed'), 'error');
    }
  };
  return <div className="myrv-code-box">
    <span className="myrv-code">{code}</span>
    <button className="myrv-copy-btn" onClick={handleCopy} aria-label={t('common.copy')}>
      {copied ? <Check size={16} /> : <Copy size={16} />}
      <span>{copied ? t('common.copied') : t('common.copy')}</span>
    </button>
  </div>;
}

function RewardDetailSheet({ reward, onClose, t, formatDate }: { reward: UserReward; onClose: () => void; t: ReturnType<typeof useTranslation>['t']; formatDate: (s: string | null | undefined) => string }) {
  return <div className="myrv-sheet-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="myrv-sheet">
      <div className="myrv-sheet-handle" />
      <div className="myrv-sheet-title">{reward.reward_name}</div>
      <div className="myrv-sheet-sub">{t('myRewards.showToCashier')}</div>
      <div className="myrv-sheet-info">
        <div className="myrv-sheet-info-icon"><QrCode size={40} color="var(--loka-primary)" /></div>
        <div className="myrv-sheet-info-text">{t('common.yourCode')}</div>
        <CopyCode code={reward.redemption_code} t={t} />
      </div>
      {reward.expires_at && <div className="myrv-sheet-expiry">{t('myRewards.expires', { date: formatDate(reward.expires_at) })}</div>}
      <button className="myrv-sheet-close-btn" onClick={onClose}>{t('common.done')}</button>
    </div>
  </div>;
}

function VoucherDetailSheet({ voucher, onClose, t, formatDate }: { voucher: UserVoucher; onClose: () => void; t: ReturnType<typeof useTranslation>['t']; formatDate: (s: string | null | undefined) => string }) {
  return <div className="myrv-sheet-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="myrv-sheet">
      <div className="myrv-sheet-handle" />
      <div className="myrv-sheet-title">
        {voucher.discount_type === 'percentage_off' ? `${voucher.discount_value}% OFF` : voucher.discount_type === 'free_item' ? t('myRewards.freeItem') : `${formatPrice(Number(voucher.discount_value))} OFF`}
      </div>
      <div className="myrv-sheet-sub">
        {voucher.source || t('myRewards.promoVoucher')} · {t('myRewards.minSpend', { amount: formatPrice(Number(voucher.min_spend || 0)) })}
      </div>
      <div className="myrv-sheet-info">
        <div className="myrv-sheet-info-icon"><Shield size={40} color="var(--loka-primary)" /></div>
        <div className="myrv-sheet-info-text">{t('common.yourCode')}</div>
        <CopyCode code={voucher.code} t={t} />
      </div>
      {voucher.expires_at && <div className="myrv-sheet-expiry">{t('myRewards.expires', { date: formatDate(voucher.expires_at) })}</div>}
      <button className="myrv-sheet-close-btn" onClick={onClose}>{t('common.done')}</button>
    </div>
  </div>;
}

function showToastStatic(message: string, type: 'success' | 'error' = 'success') {
  // Lightweight fallback used outside React tree; full app should use useUIStore.
  const existing = document.querySelector('.myrv-static-toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = `myrv-static-toast ${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}