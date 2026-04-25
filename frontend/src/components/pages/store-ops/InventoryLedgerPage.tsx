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
      <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{m.created_at ? new Date(m.created_at).toLocaleString() : '—'}</span>
    )},
    { key: 'inventory_item_name', header: 'Ingredient', render: (m) => (
      <span style={{ fontWeight: 500 }}>{m.inventory_item_name || `#${m.inventory_item_id}`}</span>
    )},
    { key: 'movement_type', header: 'Type', render: (m) => {
      const style = MOVEMENT_COLORS[m.movement_type] || MOVEMENT_COLORS.adjustment;
      return <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: style.bg, color: style.color }}>{m.movement_type.replace('_', ' ')}</span>;
    }},
    { key: 'quantity', header: 'Quantity', render: (m) => {
      const isDeduction = ['waste', 'transfer_out'].includes(m.movement_type);
      return <span style={{ fontWeight: 600, color: isDeduction ? THEME.error : THEME.accent }}>{isDeduction ? '-' : '+'}{m.quantity}</span>;
    }},
    { key: 'balance_after', header: 'Balance After', render: (m) => <strong>{m.balance_after}</strong> },
    { key: 'note', header: 'Note', render: (m) => (
      <span style={{ fontSize: 13, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', color: THEME.textMuted }}>{m.note}</span>
    )},
    { key: 'created_by_name', header: 'By', render: (m) => (
      <span style={{ fontSize: 13, color: THEME.textMuted }}>{m.created_by_name || `User #${m.created_by}`}</span>
    )},
    { key: 'attachment_path', header: 'Attachment', render: (m) => m.attachment_path ? (
      <a href={m.attachment_path} target="_blank" rel="noopener noreferrer" style={{ color: '#4A607A', fontSize: 12 }}><i className="fas fa-paperclip"></i> View</a>
    ) : <span style={{ color: THEME.textMuted }}>—</span> },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
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
        <div className="card" style={{ textAlign: 'center', padding: 60, color: THEME.textMuted, marginTop: 40 }}>
          <i className="fas fa-clock-rotate-left" style={{ fontSize: 48, marginBottom: 16 }}></i>
          <p style={{ fontSize: 16 }}>Select a store to view its inventory ledger</p>
        </div>
      ) : (<>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          background: THEME.bgMuted,
          borderRadius: `${THEME.radius.md} ${THEME.radius.md} 0 0`,
          border: `1px solid ${THEME.border}`,
          borderBottom: 'none',
          marginTop: 20,
        }}>
          <div style={{ fontSize: 14, color: THEME.textSecondary }}>
            <i className="fas fa-clock-rotate-left" style={{ marginRight: 8, color: THEME.primary }}></i>
            Showing <strong style={{ color: THEME.textPrimary }}>{movements.length}</strong> of <strong style={{ color: THEME.textPrimary }}>{total}</strong> movements
          </div>
          <div style={{ fontSize: 13, color: THEME.textMuted }}>
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
