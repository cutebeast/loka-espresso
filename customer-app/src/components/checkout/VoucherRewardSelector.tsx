'use client';

import { useState, useCallback } from 'react';
import { Tag, Gift, CheckCircle2 } from 'lucide-react';
import { useWalletStore } from '@/stores/walletStore';
import api from '@/lib/api';
import { LOKA, formatPrice } from '@/lib/tokens';

interface VoucherRewardSelectorProps {
  subtotal: number;
  selectedType: 'none' | 'voucher' | 'reward';
  selectedCode: string;
  onChange: (type: 'none' | 'voucher' | 'reward', code?: string, discountValue?: number) => void;
}

export default function VoucherRewardSelector({ subtotal, selectedType, selectedCode, onChange }: VoucherRewardSelectorProps) {
  const { vouchers, rewards } = useWalletStore();
  const [voucherInput, setVoucherInput] = useState('');
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [voucherError, setVoucherError] = useState('');

  const parseRewardSnapshot = useCallback((snapshot: string | null | undefined): { discount_value?: number; description?: string } => {
    if (!snapshot) return {};
    try {
      const parsed = JSON.parse(snapshot);
      if (typeof parsed === 'object' && parsed !== null) return parsed;
      return {};
    } catch {
      return {};
    }
  }, []);

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
      <div className="flex items-center gap-2 mb-3">
        <Tag size={16} color={LOKA.copper} />
        <span className="font-bold text-text-primary vrs-title">Voucher or Reward</span>
      </div>

      {selectedType === 'reward' ? (
        <div className="py-3 px-3.5 bg-copper-soft rounded-xl mb-3">
          <p className="text-text-primary vrs-reward-banner">
            <strong>Reward selected:</strong> {selectedCode}
          </p>
          <p className="text-[11px] text-text-muted mt-1">
            Remove reward to use a voucher code
          </p>
        </div>
      ) : (
        <>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={voucherInput}
              onChange={(e) => {
                setVoucherInput(e.target.value);
                if (selectedType === 'voucher') onChange('none');
                setVoucherError('');
              }}
              placeholder="Enter voucher code"
              className={`flex-1 py-2.5 px-3.5 rounded-xl bg-white text-sm text-text-primary outline-none vrs-input ${voucherError ? 'vrs-input-error' : ''}`}
            />
            <button
              onClick={handleApplyVoucher}
              disabled={!voucherInput.trim() || voucherLoading}
              className={`py-2.5 px-4 rounded-xl text-white font-bold border-none cursor-pointer vrs-apply-btn ${selectedType === 'voucher' ? 'vrs-apply-btn-active' : 'vrs-apply-btn-inactive'} ${voucherLoading ? 'vrs-apply-btn-loading' : ''}`}
            >
              {voucherLoading ? '...' : selectedType === 'voucher' ? 'Applied' : 'Apply'}
            </button>
          </div>
          {voucherError && (
            <p className="text-xs text-danger mb-2">{voucherError}</p>
          )}
        </>
      )}
      {voucherError && (
        <p className="text-xs text-danger mb-2">{voucherError}</p>
      )}

      {availableVouchers.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">
            Your Vouchers
          </p>
          <div className="flex flex-col gap-1.5">
            {availableVouchers.slice(0, 3).map(v => {
              const isSelected = selectedType === 'voucher' && selectedCode === v.code;
              const discountVal = v.discount_type === 'percentage' 
                ? (subtotal * v.discount_value / 100)
                : v.discount_value;
              return (
                <button
                  key={v.id}
                  onClick={() => handleSelectVoucher(v.code, Math.min(discountVal, v.max_discount || Infinity))}
                  className={`flex items-center gap-2.5 py-2.5 px-3 rounded-xl cursor-pointer text-left ${isSelected ? 'vrs-voucher-btn-selected' : 'vrs-voucher-btn'}`}
                >
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${isSelected ? 'vrs-check-selected' : 'vrs-check'}`}
                  >
                    {isSelected && <CheckCircle2 size={12} color={LOKA.white} />}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-text-primary vrs-code">{v.code}</p>
                    <p className="text-[11px] text-text-muted">
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
        <div className="py-3 px-3.5 bg-copper-soft rounded-xl">
          <p className="text-text-primary vrs-reward-banner">
            <strong>Voucher selected:</strong> {selectedCode}
          </p>
          <p className="text-[11px] text-text-muted mt-1">
            Remove voucher to use a reward
          </p>
        </div>
      )}

      {availableRewards.length > 0 && selectedType !== 'voucher' && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">
            Your Rewards
          </p>
          <div className="flex flex-col gap-1.5">
            {availableRewards.slice(0, 3).map(r => {
              const isSelected = selectedType === 'reward' && selectedCode === r.redemption_code;
              return (
                <button
                  key={r.id}
                  onClick={() => {
                    const snap = parseRewardSnapshot(r.reward_snapshot);
                    const discountValue = snap.discount_value || 0;
                    handleSelectReward(r.redemption_code, discountValue);
                  }}
                  className={`flex items-center gap-2.5 py-2.5 px-3 rounded-xl cursor-pointer text-left ${isSelected ? 'vrs-voucher-btn-selected' : 'vrs-voucher-btn'}`}
                >
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${isSelected ? 'vrs-check-selected' : 'vrs-check'}`}
                  >
                    {isSelected && <CheckCircle2 size={12} color={LOKA.white} />}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-text-primary vrs-code">{r.reward_name}</p>
                    <p className="text-[11px] text-text-muted">{parseRewardSnapshot(r.reward_snapshot).description || 'Reward'}</p>
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
