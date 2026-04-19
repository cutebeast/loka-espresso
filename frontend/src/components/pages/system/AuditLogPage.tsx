'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import { DateFilter, FilterSelect, DataTable, type ColumnDef, Pagination, type DatePreset, calcDateRange } from '@/components/ui';
import { THEME } from '@/lib/theme';
import type { MerchantAuditEntry, MerchantStore } from '@/lib/merchant-types';

interface AuditLogPageProps {
  stores: MerchantStore[];
  token: string;
}

interface AuditLogResponse {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  entries: MerchantAuditEntry[];
}

const ACTION_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'login', label: 'Login' },
  { value: 'logout', label: 'Logout' },
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
  { value: 'export', label: 'Export' },
  { value: 'import', label: 'Import' },
];

export default function AuditLogPage({ stores, token }: AuditLogPageProps) {
  const [entries, setEntries] = useState<MerchantAuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [actionFilter, setActionFilter] = useState('');
  const [preset, setPreset] = useState<DatePreset>('MTD');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const PAGE_SIZE = 20;

  const fetchPage = useCallback(async (p: number) => {
    setLoading(true);
    try {
      let url = `/admin/audit-log?page=${p}&page_size=${PAGE_SIZE}`;
      if (actionFilter) url += `&action=${encodeURIComponent(actionFilter)}`;
      if (fromDate && toDate) url += `&from_date=${fromDate}T00:00:00&to_date=${toDate}T23:59:59`;
      const res = await apiFetch(url, token);
      if (res.ok) {
        const data: AuditLogResponse = await res.json();
        setEntries(data.entries || []);
        setTotal(data.total || 0);
        setPage(data.page || p);
        setTotalPages(data.total_pages || 1);
      }
    } catch {} finally { setLoading(false); }
  }, [token, actionFilter, fromDate, toDate]);

  useEffect(() => {
    const range = calcDateRange(preset);
    setFromDate(range.from);
    setToDate(range.to);
  }, [preset]);

  useEffect(() => { fetchPage(1); }, [fetchPage]);

  useEffect(() => { setPage(1); fetchPage(1); }, [actionFilter]);

  const columns: ColumnDef<MerchantAuditEntry>[] = [
    { key: 'timestamp', header: 'Timestamp', render: (entry) => (
      <span style={{ fontSize: 13, whiteSpace: 'nowrap', color: THEME.textPrimary }}>
        {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '-'}
      </span>
    )},
    { key: 'user_email', header: 'Who', render: (entry) => (
      <span style={{ fontWeight: 500, color: THEME.textPrimary }}>{entry.user_email || 'System'}</span>
    )},
    { key: 'action', header: 'Action', render: (entry) => (
      <span className="badge badge-blue" style={{ textTransform: 'none', fontFamily: 'monospace', fontSize: 11 }}>{entry.action}</span>
    )},
    { key: 'ip_address', header: 'IP', render: (entry) => (
      <span style={{ fontSize: 12, color: THEME.textMuted, fontFamily: 'monospace' }}>
        {entry.ip_address && entry.ip_address !== '-' ? entry.ip_address : <span style={{ color: THEME.borderLight }}>—</span>}
      </span>
    )},
    { key: 'store_id', header: 'Location', render: (entry) => {
      const storeName = entry.store_id
        ? (stores.find(s => s.id === entry.store_id)?.name || `Store ${entry.store_id}`)
        : 'All Stores';
      return <span style={{ fontSize: 13, color: THEME.textMuted }}>{storeName}</span>;
    }},
    { key: 'status', header: 'Status', render: (entry) => (
      <span className={`badge ${
        entry.status === 'success' ? 'badge-green' :
        entry.status === 'failed' ? 'badge-red' : 'badge-yellow'
      }`}>{entry.status}</span>
    )},
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <DateFilter
          preset={preset}
          onChange={(p, from, to) => { setPreset(p); setFromDate(from); setToDate(to); }}
          fromDate={fromDate}
          toDate={toDate}
        />
        <FilterSelect
          value={actionFilter}
          onChange={setActionFilter}
          options={ACTION_OPTIONS}
          icon="fa-filter"
          placeholder="All Actions"
        />
        {actionFilter && (
          <button className="btn btn-sm" onClick={() => setActionFilter('')} title="Clear filter">
            <i className="fas fa-times"></i>
          </button>
        )}
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        background: THEME.bgMuted,
        borderRadius: `${THEME.radius.md} ${THEME.radius.md} 0 0`,
        border: `1px solid ${THEME.border}`,
        borderBottom: 'none',
      }}>
        <div style={{ fontSize: 14, color: THEME.textSecondary }}>
          <i className="fas fa-history" style={{ marginRight: 8, color: THEME.primary }}></i>
          Showing <strong style={{ color: THEME.textPrimary }}>{entries.length}</strong> of <strong style={{ color: THEME.textPrimary }}>{total}</strong> entries
        </div>
        <div style={{ fontSize: 13, color: THEME.textMuted }}>
          Page {page} of {totalPages}
        </div>
      </div>

      <DataTable
        data={entries}
        columns={columns}
        loading={loading && entries.length === 0}
        emptyMessage="No audit log entries"
      />

      <Pagination page={page} totalPages={totalPages} onPageChange={fetchPage} loading={loading} />

      {loading && entries.length > 0 && (
        <div style={{ textAlign: 'center', padding: 8, color: THEME.textMuted, fontSize: 12 }}>
          <i className="fas fa-spinner fa-spin"></i> Loading...
        </div>
      )}
    </div>
  );
}
