'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Store,
  MapPin,
  CreditCard,
  Smartphone,
  Building,
  Shield,
} from 'lucide-react';
import { useWalletStore } from '@/stores/walletStore';
import { useAuthStore } from '@/stores/authStore';
import { GuestGate } from '@/components/auth/GuestGate';
import { useUIStore } from '@/stores/uiStore';
import { Skeleton } from '@/components/ui';
import api from '@/lib/api';
import type { LedgerEntry } from '@/lib/api';
import { formatPrice, LOKA } from '@/lib/tokens';
import { useTranslation } from '@/hooks/useTranslation';
import { useConfigStore } from '@/stores/configStore';
import { getLocale } from '@/stores/localeStore';

const TOPUP_LABELS = ['wallet.labelStarter', 'wallet.labelPopular', 'wallet.labelValue', 'wallet.labelPremium'];

export default function WalletPage() {
  const { t } = useTranslation();
  const { balance, transactions, setTransactions } = useWalletStore();
  const { setPage, showToast, pageParams } = useUIStore();
  const config = useConfigStore((s) => s.config);

  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [toppingUp, setToppingUp] = useState(false);
  const [loadingTx, setLoadingTx] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<string>('');

  const fetchBalance = useCallback(async () => {
    if (!useAuthStore.getState().isAuthenticated) return;
    try {
      await useWalletStore.getState().refreshWallet();
    } catch (err) { console.error('[WalletPage] Failed to fetch balance:', err);
      // keep existing
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    setLoadingTx(true);
    try {
      const res = await api.get('/wallet/ledger/me', { params: { per_page: 20 } });
      const data = res.data as { items?: LedgerEntry[] } | LedgerEntry[] | undefined;
      setTransactions(Array.isArray(data) ? data : (data?.items ?? []));
    } catch (err) { console.error('[WalletPage] Failed to fetch transactions:', err);
      // keep existing
    } finally {
      setLoadingTx(false);
    }
  }, [setTransactions]);

  const returnHandledRef = useRef(false);

  useEffect(() => {
    fetchBalance();
    fetchTransactions();
  }, [fetchBalance, fetchTransactions]);

  // Handle return from Stripe Checkout wallet top-up
  useEffect(() => {
    const status = pageParams?.status as string | undefined;
    const sessionId = pageParams?.topup_session as string | undefined;
    if (!status || !sessionId) {
      // Reset so the next top-up return is processed after the hash is cleared.
      returnHandledRef.current = false;
      return;
    }
    if (returnHandledRef.current) return;
    returnHandledRef.current = true;

    const handleReturn = async () => {
      if (status === 'success' || status === 'completed') {
        await fetchBalance();
        await fetchTransactions();
        showToast(t('toast.topUpSuccessReturn'), 'success');
      } else if (status === 'cancel' || status === 'canceled' || status === 'failed') {
        showToast(t('toast.topUpFailed'), 'error');
      }
      // Clean hash params so a refresh doesn't re-trigger the toast
      if (typeof window !== 'undefined' && window.location.hash.includes('topup_session')) {
        window.location.hash = 'wallet';
      }
    };
    handleReturn();
  }, [pageParams, fetchBalance, fetchTransactions, showToast, t]);

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
    const custom = parseFloat(customAmount);
    if (!isNaN(custom) && custom >= config.topup_min_amount) return custom;
    return null;
  };

  const handleTopUp = async () => {
    const amount = getTopUpAmount();
    if (!amount) {
      showToast(t('wallet.minTopUp'), 'error');
      return;
    }
    setSelectedPayment('');
    setShowPayment(true);
  };

  const executeTopUp = async () => {
    const amount = getTopUpAmount();
    if (!amount) return;
    setShowConfirm(false);
    setToppingUp(true);
    try {
      const res = await api.post('/wallet/topup/checkout', {
        amount,
        return_url: typeof window !== 'undefined' ? `${window.location.origin}/#wallet` : undefined,
      });
      if (res.data?.checkout_url) {
        window.location.href = res.data.checkout_url;
        return;
      }
      throw new Error('No checkout URL returned');
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
                        {new Date(tx.created_at).toLocaleDateString(getLocale(), {
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

      {/* Payment Method Modal */}
      {showPayment && (
        <div className="profile-modal-overlay show" onClick={() => setShowPayment(false)}>
          <div className="profile-modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <button className="profile-modal-close" onClick={() => setShowPayment(false)} style={{ position: 'absolute', right: 16, top: 16 }}>✕</button>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{t('wallet.paymentMethod')}</h3>
            <p style={{ fontSize: 13, color: 'var(--loka-text-muted)', marginBottom: 20 }}>
              {t('wallet.selectPaymentMethod')} — {formatPrice(getTopUpAmount() || 0)}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { id: 'card', icon: <CreditCard size={20} />, label: t('wallet.creditDebitCard'), desc: t('wallet.cardDesc') },
                { id: 'fpx', icon: <Building size={20} />, label: t('wallet.fpxBanking'), desc: t('wallet.fpxDesc') },
                { id: 'ewallet', icon: <Smartphone size={20} />, label: t('wallet.eWallet'), desc: t('wallet.eWalletDesc') },
              ].map(method => (
                <button
                  key={method.id}
                  onClick={() => setSelectedPayment(selectedPayment === method.id ? '' : method.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12,
                    border: selectedPayment === method.id ? '2px solid var(--loka-primary)' : '1px solid var(--loka-border-light)',
                    background: selectedPayment === method.id ? 'var(--loka-primary-light, rgba(59,74,26,0.08))' : 'var(--loka-bg-white)',
                    cursor: 'pointer', textAlign: 'left', width: '100%',
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: selectedPayment === method.id ? 'var(--loka-primary)' : 'var(--loka-bg-muted)',
                    color: selectedPayment === method.id ? 'white' : 'var(--loka-text-muted)',
                  }}>
                    {method.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{method.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--loka-text-muted)' }}>{method.desc}</div>
                  </div>
                  {selectedPayment === method.id && (
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--loka-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Shield size={12} color="white" />
                    </div>
                  )}
                </button>
              ))}

              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8,
                background: 'var(--loka-warning-light, #FDF5E6)', marginTop: 4,
              }}>
                <Shield size={14} style={{ color: 'var(--loka-warning)', flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: 'var(--loka-text-muted)' }}>
                  {t('wallet.paymentPlaceholder')}
                </span>
              </div>
            </div>

            <div className="profile-modal-btns" style={{ marginTop: 16 }}>
              <button className="profile-modal-btn profile-modal-btn-cancel" onClick={() => setShowPayment(false)}>{t('common.cancel')}</button>
              <button
                className="profile-modal-btn profile-modal-btn-confirm"
                onClick={() => { setShowPayment(false); executeTopUp(); }}
                disabled={!selectedPayment || toppingUp}
                style={{ opacity: !selectedPayment ? 0.5 : 1 }}
              >
                {toppingUp ? t('common.processing') : `${t('common.pay')} ${formatPrice(getTopUpAmount() || 0)}`}
              </button>
            </div>
          </div>
        </div>
      )}

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
