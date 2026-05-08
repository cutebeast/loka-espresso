'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Store,
  MapPin,
} from 'lucide-react';
import { useWalletStore } from '@/stores/walletStore';
import { useAuthStore } from '@/stores/authStore';
import { GuestGate } from '@/components/auth/GuestGate';
import { useUIStore } from '@/stores/uiStore';
import { Skeleton } from '@/components/ui';
import api from '@/lib/api';
import { formatPrice, LOKA } from '@/lib/tokens';
import { useTranslation } from '@/hooks/useTranslation';
import { useConfigStore } from '@/stores/configStore';

const TOPUP_LABELS = ['wallet.labelStarter', 'wallet.labelPopular', 'wallet.labelValue', 'wallet.labelPremium'];

export default function WalletPage() {
  const { t } = useTranslation();
  const { balance, setBalance, transactions, setTransactions } = useWalletStore();
  const { setPage, showToast } = useUIStore();
  const config = useConfigStore((s) => s.config);

  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [toppingUp, setToppingUp] = useState(false);
  const [loadingTx, setLoadingTx] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!useAuthStore.getState().isAuthenticated) return;
    try {
      const res = await api.get('/wallet');
      setBalance(res.data?.balance ?? 0);
    } catch (err) { console.error('[WalletPage] Failed to fetch balance:', err);
      // keep existing
    }
  }, [setBalance]);

  const fetchTransactions = useCallback(async () => {
    setLoadingTx(true);
    try {
      const res = await api.get('/wallet/transactions', { params: { page_size: 20 } });
      setTransactions(Array.isArray(res.data) ? res.data : []);
    } catch (err) { console.error('[WalletPage] Failed to fetch transactions:', err);
      // keep existing
    } finally {
      setLoadingTx(false);
    }
  }, [setTransactions]);

  useEffect(() => {
    fetchBalance();
    fetchTransactions();
  }, [fetchBalance, fetchTransactions]);

  const handleSelectAmount = (amount: number) => {
    setSelectedAmount(amount);
    setCustomAmount('');
  };

  const handleCustomChange = (value: string) => {
    setCustomAmount(value);
    if (value) setSelectedAmount(null);
  };

  const getTopUpAmount = (): number | null => {
    if (selectedAmount) return selectedAmount;
    const custom = parseInt(customAmount, 10);
    if (!isNaN(custom) && custom >= config.topup_min_amount) return custom;
    return null;
  };

  const handleTopUp = async () => {
    const amount = getTopUpAmount();
    if (!amount) {
      showToast(t('wallet.minTopUp'), 'error');
      return;
    }
    setShowConfirm(true);
  };

  const executeTopUp = async () => {
    const amount = getTopUpAmount();
    if (!amount) return;
    setShowConfirm(false);
    setToppingUp(true);
    try {
      await api.post('/wallet/topup', { amount });
      showToast(t('toast.topUpSuccess', { amount: formatPrice(amount) }), 'success');
      await fetchBalance();
      await fetchTransactions();
      setSelectedAmount(null);
      setCustomAmount('');
    } catch (err) { console.error('[WalletPage] Top-up failed:', err);
      showToast(t('toast.topUpFailed'), 'error');
    } finally {
      setToppingUp(false);
    }
  };

  return (
    <div className="topup-screen">
      {/* Header */}
      <div className="topup-header">
        <button className="topup-back-btn" onClick={() => setPage('profile')} aria-label={t('common.back')}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="topup-title">{t('wallet.topUpTitle')}</h1>
      </div>

      {/* Scrollable Content */}
      <div className="topup-scroll">
        <GuestGate message={t('wallet.guestMessage')}>
        {/* Balance Card */}
        <div className="topup-balance-card">
          <div>
            <div className="topup-balance-label">{t('wallet.lokaBalance')}</div>
            <div className="topup-balance-amount">{formatPrice(balance)}</div>
          </div>
          <Wallet size={28} className="co-wallet-icon" />
        </div>

        {/* Online Top Up */}
        <div>
          <div className="topup-section-title">{t('wallet.quickTopUp')}</div>
          <div className="topup-amount-grid topup-amount-grid-4col">
            {config.topup_presets.map((amount, i) => (
              <button
                key={amount}
                className={`topup-amount-btn ${selectedAmount === amount ? 'selected' : ''}`}
                onClick={() => handleSelectAmount(amount)}
              >
                <span className="topup-preset-amount">{config.currency_symbol} {amount}</span>
                <span className="topup-preset-label">{t(TOPUP_LABELS[i] || 'wallet.labelValue')}</span>
              </button>
            ))}
          </div>
          <div className="topup-custom-amount">
            <span>{config.currency_symbol}</span>
            <input
              type="number"
              className="topup-custom-input"
              placeholder={t('wallet.otherAmount')}
              value={customAmount}
              onChange={(e) => handleCustomChange(e.target.value)}
              min={config.topup_min_amount}
            />
          </div>
          <button
            className="topup-btn"
            onClick={handleTopUp}
            disabled={toppingUp || !getTopUpAmount()}
          >
            {toppingUp ? t('common.processing') : <><Plus size={18} /> {t('wallet.continueToPay')}</>}
          </button>
        </div>

        {/* Offline Top Up */}
        <div>
          <div className="topup-section-title">{t('wallet.offlineTopUp')}</div>
          <div className="topup-offline-card">
            <div className="topup-offline-icon">
              <Store size={32} />
            </div>
            <p className="topup-offline-text">
              {t('wallet.offlineTopUpDesc')}
            </p>
            <button className="topup-store-btn" onClick={() => setPage('menu')}>
              <MapPin size={16} /> {t('wallet.findNearestStore')}
            </button>
          </div>
        </div>

        {/* Recent Transactions */}
        <div>
          <div className="topup-section-title">{t('wallet.recentTransactions')}</div>
          {loadingTx ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="topup-tx-item">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-2/3 mb-1" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="topup-empty">
              <div className="topup-empty-icon">
                <Wallet size={24} color={LOKA.border} />
              </div>
              <p className="home-empty-text">{t('wallet.noTransactions')}</p>
            </div>
          ) : (
            <div className="topup-tx-list">
              {transactions.map((tx) => {
                const isPositive = tx.amount > 0;
                return (
                  <div key={tx.id} className="topup-tx-item">
                    <div className={`topup-tx-icon ${isPositive ? 'in' : 'out'}`}>
                      {isPositive ? (
                        <ArrowDownLeft size={18} />
                      ) : (
                        <ArrowUpRight size={18} />
                      )}
                    </div>
                    <div className="topup-tx-info">
                      <p className="topup-tx-desc">{tx.description}</p>
                      <p className="topup-tx-date">
                        {new Date(tx.created_at).toLocaleDateString('en-MY', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <span className={`topup-tx-amount ${isPositive ? 'in' : 'out'}`}>
                      {isPositive ? '+' : '-'}
                      {formatPrice(Math.abs(tx.amount))}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </GuestGate>
      </div>

      {/* Confirmation Dialog */}
      {showConfirm && (
        <div className="profile-modal-overlay show" onClick={() => setShowConfirm(false)}>
          <div className="profile-modal-box">
            <h3>{t('wallet.confirmTopUp')}</h3>
            <p className="mb-4">
              {t('wallet.confirmTopUpMessage', { amount: formatPrice(getTopUpAmount() || 0) })}
            </p>
            <div className="profile-modal-btns">
              <button className="profile-modal-btn profile-modal-btn-cancel" onClick={() => setShowConfirm(false)}>{t('common.cancel')}</button>
              <button className="profile-modal-btn profile-modal-btn-confirm" onClick={executeTopUp}>{t('common.confirm')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
