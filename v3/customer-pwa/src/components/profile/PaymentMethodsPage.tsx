'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Wallet, Plus, Trash2, CreditCard } from 'lucide-react';
import { useWalletStore } from '@/stores/walletStore';
import { useUIStore } from '@/stores/uiStore';
import { Skeleton } from '@/components/ui';
import { useTranslation } from '@/hooks/useTranslation';
import api from '@/lib/api';
import { formatPrice, LOKA } from '@/lib/tokens';

interface PaymentMethodItem {
  id: number;
  type: string;
  provider?: string;
  last4?: string;
  expiry?: string;
  is_default: boolean;
}

export default function PaymentMethodsPage() {
  const { setPage, showToast } = useUIStore();
  const { balance } = useWalletStore();
  const { t } = useTranslation();
  const [methods, setMethods] = useState<PaymentMethodItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/payments/methods')
      .then((res) => setMethods(Array.isArray(res.data) ? res.data : []))
      .catch(() => setMethods([]))
      .finally(() => setLoading(false));
  }, []);

  const handleRemove = async (id: number) => {
    try {
      await api.delete(`/payments/methods/${id}`);
      setMethods((prev) => prev.filter((m) => m.id !== id));
      showToast(t('toast.cardRemoved'), 'success');
    } catch {
      showToast(t('toast.cardRemoveFailed'), 'error');
    }
  };

  const handleAdd = () => {
    showToast(t('toast.cardLinkingSoon'), 'info');
  };

  const handleSetDefault = async (id: number) => {
    try {
      await api.put(`/payments/methods/${id}/default`);
      setMethods(prev => prev.map(m => ({ ...m, is_default: m.id === id })));
      showToast(t('toast.defaultCardUpdated'), 'success');
    } catch {
      showToast(t('toast.cardUpdateFailed'), 'error');
    }
  };

  const brandClass = (provider?: string, type?: string) => {
    const p = (provider || type || '').toLowerCase();
    if (p.includes('visa')) return 'visa';
    if (p.includes('master') || p.includes('mc')) return 'mc';
    return '';
  };

  const brandLabel = (provider?: string, type?: string) => {
    const p = (provider || type || '').toLowerCase();
    if (p.includes('visa')) return 'VISA';
    if (p.includes('master') || p.includes('mc')) return 'MC';
    return type?.toUpperCase() || 'CARD';
  };

  return (
    <div className="payment-screen">
      <div className="sub-page-header">
        <div className="sub-header-left">
          <button className="sub-back-btn" onClick={() => setPage('profile')} aria-label={t('common.back')}>
            <ArrowLeft size={20} />
          </button>
          <h1 className="sub-page-title">{t('paymentMethods.title')}</h1>
        </div>
        <div className="w-9" />
      </div>

      <div className="payment-content-scroll">
        {/* Wallet Card */}
        <div className="payment-wallet-card">
          <div className="payment-wallet-row">
            <span className="payment-wallet-label">{t('paymentMethods.walletBalance')}</span>
            <span className="payment-wallet-badge">{t('paymentMethods.active')}</span>
          </div>
          <div className="payment-wallet-amount">{formatPrice(balance)}</div>
          <div className="payment-wallet-sub">{t('paymentMethods.availableForPurchases')}</div>
          <button className="payment-topup-btn" onClick={() => setPage('wallet')}>
            <Plus size={18} />
            {t('paymentMethods.topUpWallet')}
          </button>
        </div>

        {/* Saved Cards */}
        <div className="payment-section-title">{t('paymentMethods.savedCards')}</div>

        {loading ? (
          [1, 2].map(i => <Skeleton key={i} className="skeleton pm-skeleton" />)
        ) : methods.length === 0 ? (
          <div className="payment-empty">
            <div className="payment-empty-icon">
              <CreditCard size={32} color={LOKA.copper} />
            </div>
            <div className="payment-empty-title">{t('paymentMethods.noMethods')}</div>
            <div className="payment-empty-text">
              {t('paymentMethods.noMethodsDesc')}
            </div>
            <button className="payment-empty-cta" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }} title={t('toast.cardLinkingSoon')}>
              <Plus size={14} />
              {t('paymentMethods.addCardComingSoon')}
            </button>
          </div>
        ) : (
          methods.map((m) => (
            <div key={m.id} className={`payment-card-item ${m.is_default ? 'is-default' : ''}`}>
              <div className={`payment-card-brand ${brandClass(m.provider, m.type)}`}>
                {brandLabel(m.provider, m.type)}
              </div>
              <div className="payment-card-info">
                <div className="payment-card-number">
                  {t('paymentMethods.endingIn', { brand: brandLabel(m.provider, m.type), last4: m.last4 || '' })}
                </div>
                {m.expiry && <div className="payment-card-expiry">{t('paymentMethods.expires', { expiry: m.expiry })}</div>}
                <div className="payment-card-default">
                  <div className={`payment-default-toggle ${m.is_default ? '' : 'off'}`} onClick={() => !m.is_default && handleSetDefault(m.id)} />
                  <span className={`payment-default-label ${m.is_default ? '' : 'off'}`}>
                    {m.is_default ? t('paymentMethods.default') : t('paymentMethods.setAsDefault')}
                  </span>
                </div>
              </div>
              <button className="payment-remove-btn" onClick={() => handleRemove(m.id)}>{t('common.remove')}</button>
            </div>
          ))
        )}

        {methods.length > 0 && (
          <button className="payment-add-btn" onClick={handleAdd}>
            <Plus size={18} />
            {t('paymentMethods.addNewCard')}
          </button>
        )}
      </div>
    </div>
  );
}
