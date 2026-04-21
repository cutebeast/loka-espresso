'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Star, Gift, Ticket, Calendar, Copy, Check } from 'lucide-react';
import { PageHeader, RedemptionCodeModal } from '@/components/shared';
import { useWalletStore } from '@/stores/walletStore';
import { useUIStore } from '@/stores/uiStore';
import type { UserReward, UserVoucher } from '@/lib/api';

const LOKA = {
  primary: '#384B16',
  copper: '#D18E38',
  copperSoft: 'rgba(209,142,56,0.12)',
  copperLight: '#E5A559',
  cream: '#F3EEE5',
  brown: '#57280D',
  textPrimary: '#1B2023',
  textSecondary: '#3A4A5A',
  textMuted: '#6A7A8A',
  border: '#D4DCE5',
  borderSubtle: '#E4EAEF',
  surface: '#F5F7FA',
  bg: '#E4EAEF',
  white: '#FFFFFF',
} as const;

interface MyRewardsPageProps {
  onBack: () => void;
  initialTab?: 'rewards' | 'vouchers';
}

type Tab = 'rewards' | 'vouchers';

export default function MyRewardsPage({ onBack, initialTab }: MyRewardsPageProps) {
  const { rewards, vouchers, points, refreshWallet, isLoading } = useWalletStore();
  const { setPage, showToast } = useUIStore();

  const [activeTab, setActiveTab] = useState<Tab>(initialTab ?? 'rewards');
  const [selectedReward, setSelectedReward] = useState<UserReward | null>(null);
  const [selectedVoucher, setSelectedVoucher] = useState<UserVoucher | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  useEffect(() => {
    refreshWallet();
  }, [refreshWallet]);

  const handleCopyCode = useCallback(
    (code: string, id: number) => {
      navigator.clipboard.writeText(code).then(() => {
        setCopiedId(id);
        showToast('Code copied!', 'success');
        setTimeout(() => setCopiedId(null), 2000);
      });
    },
    [showToast]
  );

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-MY', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const availableRewards = rewards.filter((r) => r.status === 'available');
  const availableVouchers = vouchers.filter((v) => v.status === 'available');

  const renderRewardCard = (reward: UserReward) => (
    <motion.div
      key={reward.id}
      whileTap={{ scale: 0.98 }}
      onClick={() => setSelectedReward(reward)}
      style={{
        background: LOKA.white,
        border: `1px solid ${LOKA.borderSubtle}`,
        borderRadius: 24,
        padding: 16,
        display: 'flex',
        gap: 14,
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 16,
          background: LOKA.cream,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Gift size={32} color={LOKA.brown} strokeWidth={1.5} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: LOKA.textPrimary, letterSpacing: '-0.01em' }}>
          {reward.reward_name}
        </p>
        <p
          style={{
            fontFamily: 'ui-monospace, monospace',
            fontSize: 12,
            color: LOKA.textSecondary,
            marginTop: 4,
          }}
        >
          Code: {reward.redemption_code}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
          <Calendar size={11} color={LOKA.textMuted} />
          <span style={{ fontSize: 11, color: LOKA.textMuted }}>Expires {formatDate(reward.expires_at)}</span>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          color: LOKA.primary,
          fontSize: 13,
          fontWeight: 600,
          gap: 4,
        }}
      >
        Show code <span style={{ fontSize: 16 }}>→</span>
      </div>
    </motion.div>
  );

  const renderVoucherCard = (voucher: UserVoucher) => (
    <motion.div
      key={voucher.id}
      whileTap={{ scale: 0.98 }}
      onClick={() => setSelectedVoucher(voucher)}
      style={{
        background: LOKA.white,
        border: `1px solid ${LOKA.borderSubtle}`,
        borderRadius: 24,
        padding: 16,
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        overflow: 'hidden',
      }}
    >
      {voucher.source && (
        <div
          style={{
            display: 'inline-flex',
            padding: '3px 10px',
            borderRadius: 999,
            background: LOKA.copperSoft,
            color: LOKA.copper,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}
        >
          From {voucher.source === 'survey' ? 'Survey' : voucher.source === 'promo' ? 'Promo' : 'Gift'}
        </div>
      )}
      <p
        style={{
          fontSize: 20,
          fontWeight: 800,
          color: LOKA.primary,
          letterSpacing: '-0.01em',
        }}
      >
        {voucher.discount_type === 'percentage'
          ? `${voucher.discount_value}% off`
          : `RM ${Number(voucher.discount_value).toFixed(2)} off`}
      </p>
      <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
        {voucher.min_spend != null && (
          <span style={{ fontSize: 12, color: LOKA.textSecondary }}>Min spend RM {Number(voucher.min_spend).toFixed(2)}</span>
        )}
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: LOKA.textMuted }}>
          <Calendar size={11} /> {formatDate(voucher.expires_at)}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 14,
          paddingTop: 14,
          borderTop: `1px solid ${LOKA.borderSubtle}`,
        }}
      >
        <span
          style={{
            fontFamily: 'ui-monospace, monospace',
            fontSize: 14,
            fontWeight: 700,
            color: LOKA.textPrimary,
          }}
        >
          {voucher.code}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleCopyCode(voucher.code, voucher.id);
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 12px',
            borderRadius: 999,
            background: copiedId === voucher.id ? LOKA.primary : LOKA.surface,
            color: copiedId === voucher.id ? LOKA.white : LOKA.textPrimary,
            fontSize: 12,
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {copiedId === voucher.id ? <Check size={13} /> : <Copy size={13} />}
          {copiedId === voucher.id ? 'Copied' : 'Copy'}
        </button>
      </div>
    </motion.div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: LOKA.bg }}>
      <PageHeader title="My Rewards & Vouchers" onBack={onBack} />

      <div style={{ padding: 16 }}>
        <div
          style={{
            background: LOKA.white,
            border: `1px solid ${LOKA.borderSubtle}`,
            borderRadius: 20,
            padding: '16px 20px',
            display: 'flex',
            gap: 20,
          }}
        >
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 4 }}>
              <Star size={16} color={LOKA.copper} fill={LOKA.copper} />
            </div>
            <p style={{ fontSize: 18, fontWeight: 800, color: LOKA.textPrimary }}>{points.toLocaleString()}</p>
            <p style={{ fontSize: 11, color: LOKA.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>pts</p>
          </div>
          <div style={{ width: 1, background: LOKA.borderSubtle }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 4 }}>
              <Gift size={16} color={LOKA.copper} />
            </div>
            <p style={{ fontSize: 18, fontWeight: 800, color: LOKA.textPrimary }}>{availableRewards.length}</p>
            <p style={{ fontSize: 11, color: LOKA.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Rewards</p>
          </div>
          <div style={{ width: 1, background: LOKA.borderSubtle }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 4 }}>
              <Ticket size={16} color={LOKA.copper} />
            </div>
            <p style={{ fontSize: 18, fontWeight: 800, color: LOKA.textPrimary }}>{availableVouchers.length}</p>
            <p style={{ fontSize: 11, color: LOKA.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Vouchers</p>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 16px 12px', display: 'flex', gap: 8 }}>
        {(['rewards', 'vouchers'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 999,
              background: activeTab === tab ? LOKA.primary : LOKA.white,
              color: activeTab === tab ? LOKA.white : LOKA.textSecondary,
              fontSize: 14,
              fontWeight: 700,
              border: activeTab === tab ? 'none' : `1px solid ${LOKA.borderSubtle}`,
              cursor: 'pointer',
              boxShadow: activeTab === tab ? '0 4px 12px rgba(56,75,22,0.2)' : 'none',
            }}
          >
            {tab === 'rewards' ? `Rewards (${availableRewards.length})` : `Vouchers (${availableVouchers.length})`}
          </button>
        ))}
      </div>

      <div
        className="scroll-container"
        style={{ flex: 1, padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        {isLoading ? (
          <>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="skeleton"
                style={{ height: 104, borderRadius: 24 }}
              />
            ))}
          </>
        ) : activeTab === 'rewards' ? (
          availableRewards.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 999,
                  background: LOKA.cream,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                <Gift size={28} color={LOKA.copper} />
              </div>
              <p style={{ fontSize: 16, fontWeight: 700, color: LOKA.textPrimary, marginBottom: 8 }}>No rewards yet</p>
              <button
                onClick={() => setPage('rewards')}
                style={{
                  padding: '10px 20px',
                  borderRadius: 999,
                  background: LOKA.primary,
                  color: LOKA.white,
                  fontSize: 13,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Browse rewards
              </button>
            </div>
          ) : (
            availableRewards.map(renderRewardCard)
          )
        ) : availableVouchers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 999,
                background: LOKA.cream,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <Ticket size={28} color={LOKA.copper} />
            </div>
            <p style={{ fontSize: 16, fontWeight: 700, color: LOKA.textPrimary, marginBottom: 8 }}>No vouchers yet</p>
            <button
              onClick={() => setPage('promotions')}
              style={{
                padding: '10px 20px',
                borderRadius: 999,
                background: LOKA.primary,
                color: LOKA.white,
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              See promotions
            </button>
          </div>
        ) : (
          availableVouchers.map(renderVoucherCard)
        )}
      </div>

      <RedemptionCodeModal
        code={selectedReward?.redemption_code ?? ''}
        title={selectedReward?.reward_name ?? 'Reward'}
        isOpen={!!selectedReward}
        onClose={() => setSelectedReward(null)}
        onCopy={(code) => handleCopyCode(code, selectedReward?.id ?? 0)}
      />

      <RedemptionCodeModal
        code={selectedVoucher?.code ?? ''}
        title={
          selectedVoucher
            ? selectedVoucher.discount_type === 'percentage'
              ? `${selectedVoucher.discount_value}% off`
              : `RM ${Number(selectedVoucher.discount_value).toFixed(2)} off`
            : 'Voucher'
        }
        isOpen={!!selectedVoucher}
        onClose={() => setSelectedVoucher(null)}
        onCopy={(code) => handleCopyCode(code, selectedVoucher?.id ?? 0)}
      />
    </div>
  );
}