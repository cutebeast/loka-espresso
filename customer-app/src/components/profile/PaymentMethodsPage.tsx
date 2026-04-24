'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Wallet, Plus, Trash2, CreditCard } from 'lucide-react';
import { useWalletStore } from '@/stores/walletStore';
import { useUIStore } from '@/stores/uiStore';
import api from '@/lib/api';

interface PaymentMethodItem {
  id: number;
  type: string;
  provider?: string;
  last4?: string;
  expiry?: string;
  is_default: boolean;
}

function formatPrice(val: number | string): string {
  const n = Number(val);
  if (!Number.isFinite(n)) return 'RM 0.00';
  return `RM ${n.toFixed(2)}`;
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

  const handleRemove = (id: number) => {
    setMethods((prev) => prev.filter((m) => m.id !== id));
    showToast('Card removed', 'success');
  };

  const handleAdd = () => {
    showToast('Card linking will be enabled with payment gateway integration', 'info');
  };

  const cardIcon = (provider?: string) => {
    const p = provider?.toLowerCase();
    if (p === 'visa') return '💳';
    if (p === 'mastercard') return '💳';
    return '💳';
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
        {/* Wallet balance card */}
        <div className="payment-wallet-card">
          <div className="payment-wallet-row">
            <span className="payment-wallet-label">
              <Wallet size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
              Loka Balance
            </span>
            <button className="payment-wallet-topup-btn" onClick={() => setPage('wallet')}>
              Top Up
            </button>
          </div>
          <div className="payment-wallet-amount">{formatPrice(balance)}</div>
        </div>

        {/* Saved cards */}
        <div className="payment-section-title">Saved Cards</div>

        {loading ? (
          <>
            <div className="skeleton" style={{ height: 72, borderRadius: 20 }} />
            <div className="skeleton" style={{ height: 72, borderRadius: 20 }} />
          </>
        ) : methods.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 20px', background: 'white', borderRadius: 20, border: '1px solid var(--loka-border-light)' }}>
            <CreditCard size={36} color="#D4DCE5" style={{ margin: '0 auto 10px' }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: '#6A7A8A' }}>No saved cards</p>
            <p style={{ fontSize: 12, color: '#3A4A5A', marginTop: 4 }}>Add a card for faster checkout</p>
          </div>
        ) : (
          methods.map((m) => (
            <div key={m.id} className="payment-card-item">
              <div className="payment-card-brand">{cardIcon(m.provider)}</div>
              <div className="payment-card-details">
                <div className="payment-card-number">{m.provider || 'Card'} ···· {m.last4 || '****'}</div>
                <div className="payment-card-expiry">Expires {m.expiry || '—'}</div>
              </div>
              <button className="payment-remove-btn" onClick={() => handleRemove(m.id)} aria-label="Remove card">
                <Trash2 size={18} />
              </button>
            </div>
          ))
        )}

        <button className="payment-add-btn" onClick={handleAdd}>
          <Plus size={18} /> Add New Card
        </button>
      </div>
    </div>
  );
}
