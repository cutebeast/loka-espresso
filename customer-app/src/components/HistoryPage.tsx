'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Star, Wallet, Gift, Coffee, ShoppingBag, Users, Ticket, Circle } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useWalletStore } from '@/stores/walletStore';
import { Skeleton } from '@/components/ui';
import api from '@/lib/api';
import type { LoyaltyHistoryEntry, Transaction } from '@/lib/api';

type Tab = 'loyalty' | 'wallet';

const CATEGORY_ICONS: Record<string, typeof Star> = {
  purchase: ShoppingBag,
  order: ShoppingBag,
  reward: Gift,
  referral: Users,
  voucher: Ticket,
  topup: Wallet,
  refund: Circle,
  redemption: Star,
  bonus: Gift,
  default: Star,
};

function getDateGroup(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const txDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.floor((today.getTime() - txDay.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff <= 7) return 'This Week';
  if (diff <= 30) return 'This Month';
  return 'Earlier';
}

export default function HistoryPage() {
  const { setPage, showToast } = useUIStore();
  const { points, balance } = useWalletStore();
  const { setTransactions: setWalletTransactions } = useWalletStore();

  const [activeTab, setActiveTab] = useState<Tab>('loyalty');
  const [loyaltyHistory, setLoyaltyHistory] = useState<LoyaltyHistoryEntry[]>([]);
  const [walletHistory, setWalletHistory] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'loyalty') {
        const res = await api.get('/loyalty/history', { params: { page_size: 50 } });
        setLoyaltyHistory(Array.isArray(res.data) ? res.data : []);
      } else {
        const res = await api.get('/wallet/transactions', { params: { page_size: 50 } });
        const txs = Array.isArray(res.data) ? res.data : [];
        setWalletHistory(txs);
        setWalletTransactions(txs);
      }
    } catch {
      showToast('Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeTab, showToast, setWalletTransactions]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* Group by date */
  const groupByDate = <T extends { created_at?: string }>(items: T[]) => {
    const groups: Record<string, T[]> = {};
    items.forEach(item => {
      const g = getDateGroup(item.created_at || '');
      if (!groups[g]) groups[g] = [];
      groups[g].push(item);
    });
    return groups;
  };

  const loyaltyGroups = groupByDate(loyaltyHistory);
  const walletGroups = groupByDate(walletHistory);
  const groupOrder = ['Today', 'This Week', 'This Month', 'Earlier'];

  /* Summary stats */
  const loyaltyEarned = loyaltyHistory.filter(t => (t.points || 0) > 0).reduce((s, t) => s + (t.points || 0), 0);
  const loyaltyRedeemed = loyaltyHistory.filter(t => (t.points || 0) < 0).reduce((s, t) => s + Math.abs(t.points || 0), 0);
  const walletIn = walletHistory.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const walletOut = walletHistory.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const nowMonth = new Date().toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });

  return (
    <div className="history-screen">
      <div className="sub-page-header">
        <div className="sub-header-left">
          <button className="sub-back-btn" onClick={() => setPage('profile')} aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <h1 className="sub-page-title">Transaction History</h1>
        </div>
        <div className="w-9" />
      </div>

      <div className="history-tab-bar">
        <button className={`history-tab ${activeTab === 'loyalty' ? 'active' : ''}`} onClick={() => setActiveTab('loyalty')}>
          Loyalty
        </button>
        <button className={`history-tab ${activeTab === 'wallet' ? 'active' : ''}`} onClick={() => setActiveTab('wallet')}>
          Wallet
        </button>
      </div>

      {/* Monthly Summary */}
      <div className="history-summary">
        <div className="history-summary-label">{nowMonth} Summary</div>
        <div className="history-summary-row">
          {activeTab === 'loyalty' ? (
            <>
              <div className="history-summary-stat">
                <div className="history-summary-value">+{loyaltyEarned.toLocaleString()}</div>
                <div className="history-summary-lbl">Earned</div>
              </div>
              <div className="history-summary-divider" />
              <div className="history-summary-stat">
                <div className="history-summary-value">−{loyaltyRedeemed.toLocaleString()}</div>
                <div className="history-summary-lbl">Redeemed</div>
              </div>
              <div className="history-summary-divider" />
            </>
          ) : (
            <>
              <div className="history-summary-stat">
                <div className="history-summary-value">+RM {walletIn.toFixed(0)}</div>
                <div className="history-summary-lbl">Top-ups</div>
              </div>
              <div className="history-summary-divider" />
              <div className="history-summary-stat">
                <div className="history-summary-value">−RM {walletOut.toFixed(0)}</div>
                <div className="history-summary-lbl">Spent</div>
              </div>
              <div className="history-summary-divider" />
            </>
          )}
          <div className="history-summary-stat">
            <div className="history-summary-value">
              {activeTab === 'loyalty' ? points.toLocaleString() : `RM ${balance.toFixed(0)}`}
            </div>
            <div className="history-summary-lbl">Balance</div>
          </div>
        </div>
      </div>

      <div className="history-list">
        {loading ? (
          <div className="history-list">
            {[1, 2, 3].map(i => <Skeleton key={i} className="skeleton history-skeleton-row" />)}
          </div>
        ) : (activeTab === 'loyalty' ? loyaltyHistory : walletHistory).length === 0 ? (
          <div className="history-empty">
            <div className="history-empty-icon"><Star size={48} /></div>
            <div className="history-empty-title">No transactions yet</div>
            <div className="history-empty-desc">Your {activeTab === 'loyalty' ? 'loyalty' : 'wallet'} activity will appear here</div>
          </div>
        ) : (
          groupOrder.map(group => {
            const items = activeTab === 'loyalty' ? loyaltyGroups[group] : walletGroups[group];
            if (!items?.length) return null;
            return (
              <div key={group}>
                <div className="history-date-group">{group}</div>
                {items.map((item, idx) => {
                  const isPositive = activeTab === 'loyalty' ? ((item as LoyaltyHistoryEntry).points || 0) > 0 : (item as Transaction).amount > 0;
                  const type = (item.type || '').toLowerCase();
                  const IconComp = CATEGORY_ICONS[type] || CATEGORY_ICONS.default;
                  const catLabel = type ? type.charAt(0).toUpperCase() + type.slice(1) : '';
                  return (
                    <div key={item.id || idx} className="history-tx-card">
                      <div className={`history-tx-icon ${isPositive ? 'credit' : 'debit'}`}>
                        <IconComp size={18} />
                      </div>
                      <div className="history-tx-info">
                        <div className="history-tx-desc-row">
                          <span className="history-tx-desc">{item.description || (isPositive ? 'Credited' : 'Debited')}</span>
                          {catLabel && <span className="history-tx-cat">{catLabel}</span>}
                        </div>
                        <div className="history-tx-date">
                          {new Date(item.created_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <div className="history-tx-right">
                        <div className={`history-tx-amount ${isPositive ? 'credit' : 'debit'}`}>
                          {activeTab === 'loyalty'
                            ? `${isPositive ? '+' : '−'}${Math.abs((item as LoyaltyHistoryEntry).points || 0).toLocaleString()} pts`
                            : `${isPositive ? '+' : '−'}RM ${Math.abs((item as Transaction).amount || 0).toFixed(2)}`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
