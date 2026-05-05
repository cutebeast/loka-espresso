'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Star, Wallet, Gift, Coffee, ShoppingBag, Users, Ticket, Circle } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useWalletStore } from '@/stores/walletStore';
import { Skeleton } from '@/components/ui';
import api from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';
import { t } from '@/lib/i18n';
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
  if (diff === 0) return t('common.today');
  if (diff <= 7) return t('common.thisWeek');
  if (diff <= 30) return t('common.thisMonth');
  return t('common.earlier');
}

function categoryLabel(type: string): string {
  const key = `history.category.${type.toLowerCase()}`;
  const translated = t(key);
  return translated !== key ? translated : (type ? type.charAt(0).toUpperCase() + type.slice(1) : '');
}

export default function HistoryPage() {
  const { t } = useTranslation();
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
      showToast(t('toast.loadHistoryFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [activeTab, showToast, setWalletTransactions, t]);

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
  const groupOrder = [t('common.today'), t('common.thisWeek'), t('common.thisMonth'), t('common.earlier')];

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
          <button className="sub-back-btn" onClick={() => setPage('profile')} aria-label={t('common.back')}>
            <ArrowLeft size={20} />
          </button>
          <h1 className="sub-page-title">{t('history.title')}</h1>
        </div>
        <div className="w-9" />
      </div>

      <div className="history-tab-bar">
        <button className={`history-tab ${activeTab === 'loyalty' ? 'active' : ''}`} onClick={() => setActiveTab('loyalty')}>
          {t('history.loyaltyTab')}
        </button>
        <button className={`history-tab ${activeTab === 'wallet' ? 'active' : ''}`} onClick={() => setActiveTab('wallet')}>
          {t('history.walletTab')}
        </button>
      </div>

      {/* Monthly Summary */}
      <div className="history-summary">
        <div className="history-summary-label">{t('history.monthSummary', { month: nowMonth })}</div>
        <div className="history-summary-row">
          {activeTab === 'loyalty' ? (
            <>
              <div className="history-summary-stat">
                <div className="history-summary-value">+{loyaltyEarned.toLocaleString()}</div>
                <div className="history-summary-lbl">{t('history.earned')}</div>
              </div>
              <div className="history-summary-divider" />
              <div className="history-summary-stat">
                <div className="history-summary-value">−{loyaltyRedeemed.toLocaleString()}</div>
                <div className="history-summary-lbl">{t('history.redeemed')}</div>
              </div>
              <div className="history-summary-divider" />
            </>
          ) : (
            <>
              <div className="history-summary-stat">
                <div className="history-summary-value">+RM {walletIn.toFixed(0)}</div>
                <div className="history-summary-lbl">{t('history.topUps')}</div>
              </div>
              <div className="history-summary-divider" />
              <div className="history-summary-stat">
                <div className="history-summary-value">−RM {walletOut.toFixed(0)}</div>
                <div className="history-summary-lbl">{t('history.spent')}</div>
              </div>
              <div className="history-summary-divider" />
            </>
          )}
          <div className="history-summary-stat">
            <div className="history-summary-value">
              {activeTab === 'loyalty' ? points.toLocaleString() : `RM ${balance.toFixed(0)}`}
            </div>
            <div className="history-summary-lbl">{t('history.balance')}</div>
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
            <div className="history-empty-title">{t('history.noTransactions')}</div>
            <div className="history-empty-desc">{activeTab === 'loyalty' ? t('history.emptyDescLoyalty') : t('history.emptyDescWallet')}</div>
          </div>
        ) : (
          groupOrder.map(group => {
            const items = activeTab === 'loyalty' ? loyaltyGroups[group] : walletGroups[group];
            if (!items?.length) return null;
            return (
              <div key={group}>
                <div className="history-date-group">{t('common.' + group.toLowerCase().replace(' ', ''))}</div>
                {items.map((item, idx) => {
                  const isPositive = activeTab === 'loyalty' ? ((item as LoyaltyHistoryEntry).points || 0) > 0 : (item as Transaction).amount > 0;
                  const type = (item.type || '').toLowerCase();
                  const IconComp = CATEGORY_ICONS[type] || CATEGORY_ICONS.default;
                  const catLabel = categoryLabel(type);
                  return (
                    <div key={item.id || idx} className="history-tx-card">
                      <div className={`history-tx-icon ${isPositive ? 'credit' : 'debit'}`}>
                        <IconComp size={18} />
                      </div>
                      <div className="history-tx-info">
                        <div className="history-tx-desc-row">
                          <span className="history-tx-desc">{item.description || (isPositive ? t('history.credited') : t('history.debited'))}</span>
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
