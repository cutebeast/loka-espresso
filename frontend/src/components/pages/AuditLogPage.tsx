'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import { DateFilter, FilterSelect, type DatePreset, calcDateRange } from '@/components/ui';
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

  return (
    <div>
      {/* Filter Bar - Date and Action filter on left */}
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

      {/* Stats Bar */}
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

      {loading && entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: THEME.textMuted }}>
          <i className="fas fa-spinner fa-spin"></i> Loading...
        </div>
      ) : entries.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60, color: THEME.textMuted }}>
          <i className="fas fa-history" style={{ fontSize: 40, marginBottom: 16 }}></i>
          <p>No audit log entries</p>
        </div>
      ) : (
        <div style={{
          overflowX: 'auto',
          borderRadius: `0 0 ${THEME.radius.md} ${THEME.radius.md}`,
          background: THEME.bgCard,
          border: `1px solid ${THEME.border}`,
          borderTop: 'none',
        }}>
          <table>
            <thead>
              <tr><th>Timestamp</th><th>Who</th><th>Action</th><th>IP</th><th>Location</th><th>Status</th></tr>
            </thead>
            <tbody>
              {entries.map(entry => {
                const storeName = entry.store_id
                  ? (stores.find(s => s.id === entry.store_id)?.name || `Store ${entry.store_id}`)
                  : 'All Stores';
                return (
                  <tr key={entry.id}>
                    <td style={{ fontSize: 13, whiteSpace: 'nowrap', color: THEME.textPrimary }}>
                      {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '-'}
                    </td>
                    <td style={{ fontWeight: 500, color: THEME.textPrimary }}>{entry.user_email || 'System'}</td>
                    <td>
                      <span className="badge badge-blue" style={{ textTransform: 'none', fontFamily: 'monospace', fontSize: 11 }}>
                        {entry.action}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: THEME.textMuted, fontFamily: 'monospace' }}>
                      {entry.ip_address && entry.ip_address !== '-' ? entry.ip_address : <span style={{ color: THEME.borderLight }}>—</span>}
                    </td>
                    <td style={{ fontSize: 13, color: THEME.textMuted }}>{storeName}</td>
                    <td>
                      <span className={`badge ${
                        entry.status === 'success' ? 'badge-green' :
                        entry.status === 'failed' ? 'badge-red' : 'badge-yellow'
                      }`}>
                        {entry.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 12,
          marginTop: 20,
          padding: '12px',
          background: THEME.bgCard,
          borderRadius: THEME.radius.md,
          border: `1px solid ${THEME.border}`,
        }}>
          <button
            className="btn btn-sm"
            disabled={page <= 1 || loading}
            onClick={() => fetchPage(page - 1)}
            style={{
              padding: '8px 16px',
              borderRadius: THEME.radius.md,
              border: `1px solid ${THEME.border}`,
              background: page <= 1 ? THEME.bgMuted : THEME.bgCard,
              color: page <= 1 ? THEME.textMuted : THEME.textPrimary,
              cursor: page <= 1 ? 'not-allowed' : 'pointer',
              opacity: page <= 1 ? 0.6 : 1,
            }}
          >
            <i className="fas fa-chevron-left"></i> Previous
          </button>

          <div style={{ display: 'flex', gap: 4 }}>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              // Show pages around current page
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }

              return (
                <button
                  key={pageNum}
                  onClick={() => fetchPage(pageNum)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: THEME.radius.md,
                    border: `1px solid ${page === pageNum ? THEME.primary : THEME.border}`,
                    background: page === pageNum ? THEME.primary : THEME.bgCard,
                    color: page === pageNum ? THEME.textLight : THEME.textPrimary,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <button
            className="btn btn-sm"
            disabled={page >= totalPages || loading}
            onClick={() => fetchPage(page + 1)}
            style={{
              padding: '8px 16px',
              borderRadius: THEME.radius.md,
              border: `1px solid ${THEME.border}`,
              background: page >= totalPages ? THEME.bgMuted : THEME.bgCard,
              color: page >= totalPages ? THEME.textMuted : THEME.textPrimary,
              cursor: page >= totalPages ? 'not-allowed' : 'pointer',
              opacity: page >= totalPages ? 0.6 : 1,
            }}
          >
            Next <i className="fas fa-chevron-right"></i>
          </button>
        </div>
      )}

      {loading && entries.length > 0 && (
        <div style={{ textAlign: 'center', padding: 8, color: THEME.textMuted, fontSize: 12 }}>
          <i className="fas fa-spinner fa-spin"></i> Loading...
        </div>
      )}
    </div>
  );
}
