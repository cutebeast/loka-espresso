'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Wallet, Plus, Trash2, CreditCard } from 'lucide-react';
import { useWalletStore } from '@/stores/walletStore';
import { useUIStore } from '@/stores/uiStore';
import { Skeleton } from '@/components/ui';
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
      showToast('Card removed', 'success');
    } catch {
      showToast('Failed to remove card', 'error');
    }
  };

  const handleAdd = () => {
    showToast('Card linking will be available with payment gateway integration', 'info');
  };

  const handleSetDefault = async (id: number) => {
    try {
      await api.put(`/payments/methods/${id}/default`);
      setMethods(prev => prev.map(m => ({ ...m, is_default: m.id === id })));
      showToast('Default card updated', 'success');
    } catch {
      showToast('Failed to update', 'error');
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
          <button className="sub-back-btn" onClick={() => setPage('profile')} aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <h1 className="sub-page-title">Payment Methods</h1>
        </div>
        <div style={{ width: 36 }} />
      </div>

      <div className="payment-content-scroll">
        {/* Wallet Card */}
        <div className="payment-wallet-card">
          <div className="payment-wallet-row">
            <span className="payment-wallet-label">Wallet Balance</span>
            <span className="payment-wallet-badge">Active</span>
          </div>
          <div className="payment-wallet-amount">{formatPrice(balance)}</div>
          <div className="payment-wallet-sub">Available for purchases</div>
          <button className="payment-topup-btn" onClick={() => setPage('wallet')}>
            <Plus size={18} />
            Top Up Wallet
          </button>
        </div>

        {/* Saved Cards */}
        <div className="payment-section-title">Saved Cards</div>

        {loading ? (
          [1, 2].map(i => <Skeleton key={i} className="skeleton pm-skeleton" />)
        ) : methods.length === 0 ? (
          <div className="payment-empty">
            <div className="payment-empty-icon">
              <CreditCard size={32} color={LOKA.copper} />
            </div>
            <div className="payment-empty-title">No payment methods yet</div>
            <div className="payment-empty-text">
              Add a card to enjoy seamless, one-tap checkout on all your orders.
            </div>
            <button className="payment-empty-cta" onClick={handleAdd}>
              <Plus size={14} />
              Add Your First Card
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
                  {brandLabel(m.provider, m.type)} {m.last4 ? `ending in ${m.last4}` : ''}
                </div>
                {m.expiry && <div className="payment-card-expiry">Expires {m.expiry}</div>}
                <div className="payment-card-default">
                  <div className={`payment-default-toggle ${m.is_default ? '' : 'off'}`} onClick={() => !m.is_default && handleSetDefault(m.id)} />
                  <span className={`payment-default-label ${m.is_default ? '' : 'off'}`}>
                    {m.is_default ? 'Default' : 'Set as default'}
                  </span>
                </div>
              </div>
              <button className="payment-remove-btn" onClick={() => handleRemove(m.id)}>Remove</button>
            </div>
          ))
        )}

        {methods.length > 0 && (
          <button className="payment-add-btn" onClick={handleAdd}>
            <Plus size={18} />
            Add New Card
          </button>
        )}
      </div>
    </div>
  );
}
