'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import { DateFilter, FilterSelect, DataTable, type ColumnDef, Pagination, type DatePreset, calcDateRange } from '@/components/ui';
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
  items: MerchantAuditEntry[];
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

export default function AuditLogPage({ stores, token: _token }: AuditLogPageProps) {
  const [entries, setEntries] = useState<MerchantAuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
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
      const res = await apiFetch(url);
      if (res.ok) {
        const data: AuditLogResponse = await res.json();
        setEntries(data.items || []);
        setTotal(data.total || 0);
        setPage(data.page || p);
        setTotalPages(data.total_pages || 1);
      }
    } catch (err: any) { setLoadError('Failed to load audit log. Please try again.'); } finally { setLoading(false); }
  }, [actionFilter, fromDate, toDate]);

  useEffect(() => {
    if (preset === 'CUSTOM') return;
    const range = calcDateRange(preset);
    setFromDate(range.from);
    setToDate(range.to);
  }, [preset]);

  useEffect(() => { fetchPage(1); }, [fetchPage]);

  const columns: ColumnDef<MerchantAuditEntry>[] = [
    { key: 'timestamp', header: 'Timestamp', render: (entry) => (
      <div>
        <span className="alp-0">
          {entry.created_at ? new Date(entry.created_at).toLocaleString() : '-'}
        </span>
        {entry.ip_address && entry.ip_address !== '-' && (
          <div className="alp-3" style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{entry.ip_address}</div>
        )}
      </div>
    )},
    { key: 'user_email', header: 'Who', render: (entry) => (
      <span className="alp-1">{entry.user_email || 'System'}</span>
    )},
    { key: 'store_id', header: 'Location', render: (entry) => {
      const storeName = entry.store_id
        ? (stores.find(s => s.id === entry.store_id)?.name || `Store ${entry.store_id}`)
        : 'All Stores';
      return <span className="alp-5">{storeName}</span>;
    }},
    { key: 'action', header: 'Action', render: (entry) => (
      <div>
        <span className="badge badge-blue alp-2">{entry.action}</span>
        <div style={{ marginTop: 4 }}>
          <span className={`badge ${
            entry.status === 'success' ? 'badge-green' :
            entry.status === 'failed' ? 'badge-red' : 'badge-yellow'
          }`}>{entry.status}</span>
        </div>
      </div>
    )},
  ];

  return (
    <div>
      {loadError && <div className="alp-17"><i className="fas fa-exclamation-circle"></i> {loadError}</div>}
      <div className="alp-6">
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

      <div className="alp-7">
        <div className="alp-8">
          <span className="alp-9"><i className="fas fa-history"></i></span>
          Showing <strong className="alp-10">{entries.length}</strong> of <strong className="alp-11">{total}</strong> entries
        </div>
        <div className="alp-12">
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
        <div className="alp-13">
          <i className="fas fa-spinner fa-spin"></i> Loading...
        </div>
      )}
    </div>
  );
}
