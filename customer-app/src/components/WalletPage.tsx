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
import { useUIStore } from '@/stores/uiStore';
import { Skeleton } from '@/components/ui';
import api from '@/lib/api';

function formatPrice(val: number | string): string {
  return `RM ${Number(val).toFixed(2)}`;
}

const TOPUP_AMOUNTS = [20, 50, 100, 200];

export default function WalletPage() {
  const { balance, points, setBalance, transactions, setTransactions } = useWalletStore();
  const { setPage, showToast } = useUIStore();

  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [toppingUp, setToppingUp] = useState(false);
  const [loadingTx, setLoadingTx] = useState(false);

  const fetchBalance = useCallback(async () => {
    try {
      const res = await api.get('/wallet');
      setBalance(res.data?.balance ?? balance);
    } catch {
      // keep existing
    }
  }, [balance, setBalance]);

  const fetchTransactions = useCallback(async () => {
    setLoadingTx(true);
    try {
      const res = await api.get('/wallet/transactions', { params: { page_size: 20 } });
      setTransactions(Array.isArray(res.data) ? res.data : []);
    } catch {
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
    if (!isNaN(custom) && custom >= 5) return custom;
    return null;
  };

  const handleTopUp = async () => {
    const amount = getTopUpAmount();
    if (!amount) {
      showToast('Select or enter a valid amount (min RM 5)', 'error');
      return;
    }
    setToppingUp(true);
    try {
      await api.post('/wallet/topup', { amount });
      showToast(`Successfully topped up ${formatPrice(amount)}`, 'success');
      await fetchBalance();
      await fetchTransactions();
      setSelectedAmount(null);
      setCustomAmount('');
    } catch {
      showToast('Top-up failed. Please try again.', 'error');
    } finally {
      setToppingUp(false);
    }
  };

  return (
    <div className="topup-screen">
      {/* Header */}
      <div className="topup-header">
        <button className="topup-back-btn" onClick={() => setPage('profile')} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <h1 className="topup-title">Top Up</h1>
      </div>

      {/* Scrollable Content */}
      <div className="topup-scroll">
        {/* Balance Card */}
        <div className="topup-balance-card">
          <div>
            <div className="topup-balance-label">Loka Balance</div>
            <div className="topup-balance-amount">{formatPrice(balance)}</div>
          </div>
          <Wallet size={28} style={{ opacity: 0.6 }} />
        </div>

        {/* Online Top Up */}
        <div>
          <div className="topup-section-title">Online Top Up</div>
          <div className="topup-amount-grid">
            {TOPUP_AMOUNTS.map((amount) => (
              <button
                key={amount}
                className={`topup-amount-btn ${selectedAmount === amount ? 'selected' : ''}`}
                onClick={() => handleSelectAmount(amount)}
              >
                RM {amount}
              </button>
            ))}
          </div>
          <div className="topup-custom-amount">
            <span>RM</span>
            <input
              type="number"
              className="topup-custom-input"
              placeholder="Other amount"
              min={5}
              value={customAmount}
              onChange={(e) => handleCustomChange(e.target.value)}
            />
          </div>
          <button
            className="topup-btn"
            onClick={handleTopUp}
            disabled={toppingUp || !getTopUpAmount()}
          >
            {toppingUp ? 'Processing…' : <><Plus size={18} /> Continue to Pay</>}
          </button>
        </div>

        {/* Offline Top Up */}
        <div>
          <div className="topup-section-title">Offline Top Up</div>
          <div className="topup-offline-card">
            <div className="topup-offline-icon">
              <Store size={32} />
            </div>
            <p className="topup-offline-text">
              You can also top up with cash at any Loka Espresso outlet.
              <br />
              Just scan your loyalty QR at the counter.
            </p>
            <button className="topup-store-btn" onClick={() => setPage('menu')}>
              <MapPin size={16} /> Find Nearest Store
            </button>
          </div>
        </div>

        {/* Recent Transactions */}
        <div>
          <div className="topup-section-title">Recent Transactions</div>
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
                <Wallet size={24} style={{ color: '#C4CED8' }} />
              </div>
              <p style={{ fontSize: 14, color: '#6A7A8A' }}>No transactions yet</p>
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
      </div>
    </div>
  );
}
