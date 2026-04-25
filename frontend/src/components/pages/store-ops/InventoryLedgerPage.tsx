'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import { DateFilter, type DatePreset } from '@/components/ui/DateFilter';
import { FilterSelect, DataTable, type ColumnDef, Pagination } from '@/components/ui';
import { THEME } from '@/lib/theme';
import type { MerchantStore, InventoryMovement } from '@/lib/merchant-types';

interface InventoryLedgerPageProps {
  selectedStore: string;
  storeObj: MerchantStore | undefined;
  token: string;
  stores: MerchantStore[];
  onStoreChange: (storeId: string) => void;
  fromDate: string;
  toDate: string;
  onDateChange: (from: string, to: string) => void;
}

const MOVEMENT_COLORS: Record<string, { bg: string; color: string }> = {
  received: { bg: '#ECFDF5', color: '#065F46' },
  waste: { bg: '#FEF2F2', color: '#991B1B' },
  transfer_out: { bg: '#FFFBEB', color: '#92400E' },
  transfer_in: { bg: '#EFF6FF', color: '#1E40AF' },
  cycle_count: { bg: '#F5F3FF', color: '#5B21B6' },
  adjustment: { bg: '#F9FAFB', color: '#374151' },
};

export default function InventoryLedgerPage({ selectedStore, storeObj: _storeObj, token: _token, stores: _stores, onStoreChange: _onStoreChange, fromDate, toDate, onDateChange }: InventoryLedgerPageProps) {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [preset, setPreset] = useState<DatePreset>('MTD');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const fetchLedger = useCallback(async (p: number) => {
    if (selectedStore === 'all') return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        page_size: '20',
      });
      if (filterType) params.append('movement_type', filterType);
      if (fromDate) params.append('from_date', fromDate + 'T00:00:00');
      if (toDate) params.append('to_date', toDate + 'T23:59:59');

      const url = `/stores/${selectedStore}/inventory-ledger?${params.toString()}`;
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setMovements(Array.isArray(data) ? data : (data.entries || []));
        setTotal(data.total || data.length || 0);
        setTotalPages(data.total_pages || 1);
        setPage(p);
      }
    } catch {} finally { setLoading(false); }
  }, [selectedStore, filterType, fromDate, toDate]);

  useEffect(() => { fetchLedger(1); }, [fetchLedger]);

  const columns: ColumnDef<InventoryMovement>[] = [
    { key: 'created_at', header: 'Date', render: (m) => (
      <span className="ilp-0">{m.created_at ? new Date(m.created_at).toLocaleString() : '—'}</span>
    )},
    { key: 'inventory_item_name', header: 'Ingredient', render: (m) => (
      <span className="ilp-1">{m.inventory_item_name || `#${m.inventory_item_id}`}</span>
    )},
    { key: 'movement_type', header: 'Type', render: (m) => {
      const style = MOVEMENT_COLORS[m.movement_type] || MOVEMENT_COLORS.adjustment;
      return <span className="ilp-badge" style={{ background: style.bg, color: style.color }}>{m.movement_type.replace('_', ' ')}</span>;
    }},
    { key: 'quantity', header: 'Quantity', render: (m) => {
      const isDeduction = ['waste', 'transfer_out'].includes(m.movement_type);
      return <span className="ilp-qty" style={{ color: isDeduction ? THEME.error : THEME.accent }}>{isDeduction ? '-' : '+'}{m.quantity}</span>;
    }},
    { key: 'balance_after', header: 'Balance After', render: (m) => <strong>{m.balance_after}</strong> },
    { key: 'note', header: 'Note', render: (m) => (
      <span className="ilp-2">{m.note}</span>
    )},
    { key: 'created_by_name', header: 'By', render: (m) => (
      <span className="ilp-3">{m.created_by_name || `User #${m.created_by}`}</span>
    )},
    { key: 'attachment_path', header: 'Attachment', render: (m) => m.attachment_path ? (
      <a href={m.attachment_path} target="_blank" rel="noopener noreferrer" className="ilp-4"><i className="fas fa-paperclip"></i> View</a>
    ) : <span className="ilp-5">—</span> },
  ];

  return (
    <div>
      <div className="ilp-6">
        {selectedStore !== 'all' && (
          <DateFilter
            preset={preset}
            onChange={(p, from, to) => { setPreset(p); onDateChange(from, to); }}
            fromDate={fromDate}
            toDate={toDate}
          />
        )}
        {selectedStore !== 'all' && (
          <FilterSelect
            value={filterType}
            onChange={setFilterType}
            options={[
              { value: '', label: 'All Types' },
              { value: 'received', label: 'Received' },
              { value: 'waste', label: 'Waste' },
              { value: 'transfer_out', label: 'Transfer Out' },
              { value: 'transfer_in', label: 'Transfer In' },
              { value: 'cycle_count', label: 'Cycle Count' },
              { value: 'adjustment', label: 'Adjustment' },
            ]}
            icon="fa-filter"
            placeholder="All Types"
          />
        )}
      </div>

      {selectedStore === 'all' ? (
        <div className="card ilp-7" >
          <span className="ilp-8"><i className="fas fa-clock-rotate-left"></i></span>
          <p className="ilp-9">Select a store to view its inventory ledger</p>
        </div>
      ) : (<>
        <div className="ilp-10">
          <div className="ilp-11">
            <span className="ilp-12"><i className="fas fa-clock-rotate-left"></i></span>
            Showing <strong className="ilp-13">{movements.length}</strong> of <strong className="ilp-14">{total}</strong> movements
          </div>
          <div className="ilp-15">
            Page {page} of {totalPages}
          </div>
        </div>

        <DataTable
          data={movements}
          columns={columns}
          loading={loading}
          emptyMessage="No inventory movements recorded yet."
        />

        <Pagination page={page} totalPages={totalPages} onPageChange={fetchLedger} loading={loading} />
      </>)}
    </div>
  );
}
