'use client';

import { useState, useCallback } from 'react';
import { Tag, Gift, CheckCircle2 } from 'lucide-react';
import { useWalletStore } from '@/stores/walletStore';
import api from '@/lib/api';

const LOKA = {
  primary: '#384B16',
  copper: '#D18E38',
  copperSoft: 'rgba(209,142,56,0.12)',
  success: '#85B085',
  textPrimary: '#1B2023',
  textMuted: '#6A7A8A',
  borderSubtle: '#E4EAEF',
  surface: '#F5F7FA',
  white: '#FFFFFF',
};

interface VoucherRewardSelectorProps {
  subtotal: number;
  selectedType: 'none' | 'voucher' | 'reward';
  selectedCode: string;
  onChange: (type: 'none' | 'voucher' | 'reward', code?: string, discountValue?: number) => void;
}

function formatPrice(val: number | string): string {
  return `RM ${Number(val).toFixed(2)}`;
}

export default function VoucherRewardSelector({ subtotal, selectedType, selectedCode, onChange }: VoucherRewardSelectorProps) {
  const { vouchers, rewards } = useWalletStore();
  const [voucherInput, setVoucherInput] = useState('');
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [voucherError, setVoucherError] = useState('');

  const availableVouchers = vouchers.filter(v => v.status === 'available');
  const availableRewards = rewards.filter(r => r.status === 'available');

  const handleApplyVoucher = useCallback(async () => {
    if (!voucherInput.trim()) return;
    setVoucherLoading(true);
    setVoucherError('');
    try {
      const res = await api.post('/vouchers/validate', { code: voucherInput.trim(), order_total: subtotal });
      const discountVal = res.data?.discount_value || 0;
      onChange('voucher', voucherInput.trim(), discountVal);
    } catch {
      setVoucherError('Invalid voucher');
    } finally {
      setVoucherLoading(false);
    }
  }, [voucherInput, subtotal, onChange]);

  const handleSelectVoucher = (code: string, discountValue: number) => {
    if (selectedType === 'voucher' && selectedCode === code) {
      onChange('none');
    } else {
      setVoucherInput(code);
      onChange('voucher', code, discountValue);
    }
  };

  const handleSelectReward = (code: string, discountValue: number) => {
    if (selectedType === 'reward' && selectedCode === code) {
      onChange('none');
    } else {
      onChange('reward', code, discountValue);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Tag size={16} color={LOKA.copper} />
        <span style={{ fontSize: 13, fontWeight: 700, color: LOKA.textPrimary }}>Voucher or Reward</span>
      </div>

      {selectedType === 'reward' ? (
        <div style={{ padding: '12px 14px', background: LOKA.copperSoft, borderRadius: 12, marginBottom: 12 }}>
          <p style={{ fontSize: 13, color: LOKA.textPrimary }}>
            <strong>Reward selected:</strong> {selectedCode}
          </p>
          <p style={{ fontSize: 11, color: LOKA.textMuted, marginTop: 4 }}>
            Remove reward to use a voucher code
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              value={voucherInput}
              onChange={(e) => {
                setVoucherInput(e.target.value);
                if (selectedType === 'voucher') onChange('none');
                setVoucherError('');
              }}
              placeholder="Enter voucher code"
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 12,
                border: `1px solid ${voucherError ? '#C75050' : LOKA.borderSubtle}`,
                background: LOKA.white, fontSize: 14, color: LOKA.textPrimary,
                outline: 'none', fontFamily: 'inherit',
              }}
            />
            <button
              onClick={handleApplyVoucher}
              disabled={!voucherInput.trim() || voucherLoading}
              style={{
                padding: '10px 16px', borderRadius: 12,
                background: selectedType === 'voucher' ? LOKA.success : LOKA.primary,
                color: LOKA.white, fontSize: 13, fontWeight: 700,
                border: 'none', cursor: 'pointer', opacity: voucherLoading ? 0.7 : 1,
              }}
            >
              {voucherLoading ? '...' : selectedType === 'voucher' ? 'Applied' : 'Apply'}
            </button>
          </div>
          {voucherError && (
            <p style={{ fontSize: 12, color: '#C75050', marginBottom: 8 }}>{voucherError}</p>
          )}
        </>
      )}
      {voucherError && (
        <p style={{ fontSize: 12, color: '#C75050', marginBottom: 8 }}>{voucherError}</p>
      )}

      {availableVouchers.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: LOKA.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Your Vouchers
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {availableVouchers.slice(0, 3).map(v => {
              const isSelected = selectedType === 'voucher' && selectedCode === v.code;
              const discountVal = v.discount_type === 'percentage' 
                ? (subtotal * v.discount_value / 100)
                : v.discount_value;
              return (
                <button
                  key={v.id}
                  onClick={() => handleSelectVoucher(v.code, Math.min(discountVal, v.max_discount || Infinity))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    borderRadius: 12, border: isSelected ? `2px solid ${LOKA.success}` : `1px solid ${LOKA.borderSubtle}`,
                    background: isSelected ? '#F0F7EF' : LOKA.white, cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: 999,
                    border: isSelected ? 'none' : '2px solid #E4EAEF',
                    background: isSelected ? LOKA.success : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {isSelected && <CheckCircle2 size={12} color={LOKA.white} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: LOKA.textPrimary }}>{v.code}</p>
                    <p style={{ fontSize: 11, color: LOKA.textMuted }}>
                      {v.discount_type === 'percentage' ? `${v.discount_value}% off` : `${formatPrice(v.discount_value)} off`}
                      {v.min_spend ? ` · Min ${formatPrice(v.min_spend)}` : ''}
                    </p>
                  </div>
                  <Gift size={14} color={LOKA.copper} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {availableRewards.length > 0 && selectedType === 'voucher' && (
        <div style={{ padding: '12px 14px', background: LOKA.copperSoft, borderRadius: 12 }}>
          <p style={{ fontSize: 13, color: LOKA.textPrimary }}>
            <strong>Voucher selected:</strong> {selectedCode}
          </p>
          <p style={{ fontSize: 11, color: LOKA.textMuted, marginTop: 4 }}>
            Remove voucher to use a reward
          </p>
        </div>
      )}

      {availableRewards.length > 0 && selectedType !== 'voucher' && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: LOKA.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Your Rewards
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {availableRewards.slice(0, 3).map(r => {
              const isSelected = selectedType === 'reward' && selectedCode === r.redemption_code;
              return (
                <button
                  key={r.id}
                  onClick={() => {
                    let discountValue = 0;
                    if (r.reward_snapshot) {
                      try { discountValue = JSON.parse(r.reward_snapshot).discount_value || 0; } catch { discountValue = 0; }
                    }
                    handleSelectReward(r.redemption_code, discountValue);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    borderRadius: 12, border: isSelected ? `2px solid ${LOKA.success}` : `1px solid ${LOKA.borderSubtle}`,
                    background: isSelected ? '#F0F7EF' : LOKA.white, cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: 999,
                    border: isSelected ? 'none' : '2px solid #E4EAEF',
                    background: isSelected ? LOKA.success : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {isSelected && <CheckCircle2 size={12} color={LOKA.white} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: LOKA.textPrimary }}>{r.reward_name}</p>
                    <p style={{ fontSize: 11, color: LOKA.textMuted }}>{(() => { try { return r.reward_snapshot ? JSON.parse(r.reward_snapshot).description : 'Reward'; } catch { return 'Reward'; } })()}</p>
                  </div>
                  <Gift size={14} color={LOKA.copper} />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
