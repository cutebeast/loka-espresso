'use client';

import type { CustomerLoyaltyTransaction } from '@/lib/merchant-types';
import { DataTable, Pagination, ColumnDef } from '@/components/ui';

interface PaginatedResponse<T> {
  total: number;
  page: number;
  page_size: number;
  items: T[];
}

interface LoyaltyPanelProps {
  loyalty: PaginatedResponse<CustomerLoyaltyTransaction> | null;
  loyaltyPage: number;
  pageSize: number;
  setLoyaltyPage: (page: number) => void;
}

const loyaltyColumns: ColumnDef<CustomerLoyaltyTransaction>[] = [
  { key: 'created_at', header: 'Date', render: (t) => new Date(t.created_at).toLocaleDateString() },
  { key: 'description', header: 'Description', render: (t) => t.description || t.type },
  { key: 'type', header: 'Type', render: (t) => (
    <span className={`badge ${t.type === 'earn' ? 'badge-green' : 'badge-red'}`}>{t.type}</span>
  )},
  { key: 'points', header: 'Points', render: (t) => (
    <span className="cdp-points" style={{ color: t.type === 'earn' ? '#059669' : '#EF4444' }}>
      {t.type === 'earn' ? '+' : '-'}{Math.abs(t.points)} pts
    </span>
  )},
];

export default function LoyaltyPanel({ loyalty, loyaltyPage, pageSize, setLoyaltyPage }: LoyaltyPanelProps) {
  if (!loyalty) {
    return <div className="cdp-80"><i className="fas fa-spinner fa-spin"></i></div>;
  }

  return (
    <>
      <DataTable
        data={loyalty.items}
        columns={loyaltyColumns}
        emptyMessage="No loyalty transactions found"
      />
      <Pagination
        page={loyaltyPage}
        totalPages={Math.max(1, Math.ceil(loyalty.total / pageSize))}
        onPageChange={setLoyaltyPage}
      />
    </>
  );
}
