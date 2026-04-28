'use client';

import { formatRM } from '@/lib/merchant-api';
import type { CustomerWalletTransaction } from '@/lib/merchant-types';
import { DataTable, Pagination, ColumnDef } from '@/components/ui';

interface PaginatedResponse<T> {
  total: number;
  page: number;
  page_size: number;
  items: T[];
}

interface WalletTransactionsProps {
  wallet: PaginatedResponse<CustomerWalletTransaction> | null;
  walletPage: number;
  pageSize: number;
  setWalletPage: (page: number) => void;
}

interface WalletRewardsProps {
  customerWallet: { rewards: any[]; vouchers: any[] } | null;
  loadingWalletItems: boolean;
}

const walletColumns: ColumnDef<CustomerWalletTransaction>[] = [
  { key: 'created_at', header: 'Date', render: (t) => new Date(t.created_at).toLocaleDateString() },
  { key: 'description', header: 'Description', render: (t) => t.description || t.type },
  { key: 'type', header: 'Type', render: (t) => (
    <span className={`badge ${t.type === 'top_up' || t.type === 'refund' ? 'badge-green' : 'badge-red'}`}>{t.type}</span>
  )},
  { key: 'amount', header: 'Amount', render: (t) => (
    <span className="cdp-positive">{t.type === 'top_up' || t.type === 'refund' ? '+' : '-'}{formatRM(t.amount)}</span>
  )},
];

export function WalletTransactions({ wallet, walletPage, pageSize, setWalletPage }: WalletTransactionsProps) {
  if (!wallet) {
    return <div className="cdp-loading-spinner"><i className="fas fa-spinner fa-spin"></i></div>;
  }

  return (
    <>
      <DataTable data={wallet.items} columns={walletColumns} emptyMessage="No wallet transactions found" />
      <Pagination
        page={walletPage}
        totalPages={Math.max(1, Math.ceil(wallet.total / pageSize))}
        onPageChange={setWalletPage}
      />
    </>
  );
}

export function WalletRewards({ customerWallet, loadingWalletItems }: WalletRewardsProps) {
  if (loadingWalletItems) {
    return <div className="cdp-loading-spinner"><i className="fas fa-spinner fa-spin"></i></div>;
  }

  return (
    <div className="df-section">
      <h4 className="cdp-section-title"><i className="fas fa-gift" style={{ marginRight: 8 }}></i>Available Rewards ({customerWallet?.rewards.length || 0})</h4>
      {customerWallet && customerWallet.rewards.length > 0 ? (
        <div className="cdp-item-list">
          {customerWallet.rewards.map((r: any) => (
            <div key={r.id} className="cdp-item-card">
              <div className="cdp-item-title">{r.name}</div>
              <div className="cdp-item-meta">
                Code: <code className="cdp-code">{r.redemption_code}</code>
                {r.points_spent ? ` · ${r.points_spent} pts` : ''}
                {r.expires_at ? ` · Expires ${new Date(r.expires_at).toLocaleDateString()}` : ''}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="cdp-empty-text">No available rewards</div>
      )}

      <h4 className="cdp-section-title"><i className="fas fa-ticket" style={{ marginRight: 8 }}></i>Available Vouchers ({customerWallet?.vouchers.length || 0})</h4>
      {customerWallet && customerWallet.vouchers.length > 0 ? (
        <div className="cdp-item-list">
          {customerWallet.vouchers.map((v: any) => (
            <div key={v.id} className="cdp-item-card">
              <div className="cdp-item-title">{v.title}</div>
              <div className="cdp-item-meta">
                Code: <code className="cdp-code">{v.code}</code>
                {v.discount_type && v.discount_value ? ` · ${v.discount_type === 'percent' ? v.discount_value + '%' : 'RM ' + v.discount_value} off` : ''}
                {v.min_spend ? ` · Min spend RM ${v.min_spend}` : ''}
                {v.expires_at ? ` · Expires ${new Date(v.expires_at).toLocaleDateString()}` : ''}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="cdp-empty-text">No available vouchers</div>
      )}
    </div>
  );
}
