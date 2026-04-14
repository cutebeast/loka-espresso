'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import type { MerchantBroadcast } from '@/lib/merchant-types';

interface NotificationsPageProps {
  token: string;
  refreshKey: number;
  onNewBroadcast: () => void;
}

function getStatus(bc: MerchantBroadcast): 'sent' | 'scheduled' | 'pending' {
  if (bc.sent_at) return 'sent';
  if (bc.scheduled_at) return 'scheduled';
  return 'pending';
}

function statusBadge(status: string) {
  if (status === 'sent') return <span className="badge badge-green">Sent</span>;
  if (status === 'scheduled') return <span className="badge badge-yellow">Scheduled</span>;
  return <span className="badge badge-gray">Pending</span>;
}

export default function NotificationsPage({ token, refreshKey, onNewBroadcast }: NotificationsPageProps) {
  const [broadcasts, setBroadcasts] = useState<MerchantBroadcast[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [notifTab, setNotifTab] = useState<'active' | 'archived'>('active');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const fetchBroadcasts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: '20',
        is_archived: String(notifTab === 'archived'),
      });
      if (fromDate) params.set('from_date', fromDate);
      if (toDate) params.set('to_date', toDate);
      const res = await apiFetch(`/admin/broadcasts?${params}`, token);
      if (res.ok) {
        const data = await res.json();
        setBroadcasts(data.broadcasts || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
      }
    } catch {} finally { setLoading(false); }
  }, [token, page, notifTab, fromDate, toDate, refreshKey]);

  useEffect(() => { fetchBroadcasts(); }, [fetchBroadcasts]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [notifTab, fromDate, toDate]);

  async function toggleArchive(id: number) {
    await apiFetch(`/admin/broadcasts/${id}/archive`, token, { method: 'PATCH' });
    fetchBroadcasts();
  }

  const audienceLabel: Record<string, string> = {
    all: 'All Users', new: 'New Users', loyal: 'Loyal Customers',
    inactive: 'Inactive Users', platinum: 'Platinum Members',
  };

  return (
    <div>
      <h3 style={{ marginBottom: 20 }}>Notifications</h3>

      {/* Phase 3 banner */}
      <div style={{
        background: 'linear-gradient(135deg, #FEF3C7, #FFFBEB)',
        border: '1px solid #F59E0B',
        borderRadius: 16,
        padding: '14px 20px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}>
        <i className="fas fa-exclamation-triangle" style={{ fontSize: 20, color: '#D97706' }}></i>
        <div>
          <div style={{ fontWeight: 600, color: '#92400E', fontSize: 13, marginBottom: 2 }}>Notification Delivery — Phase 3 (Pending)</div>
          <div style={{ fontSize: 12, color: '#78350F' }}>
            Broadcasts are stored in DB but not yet delivered. Twilio / FCM / APNs integration is planned for Phase 3.
          </div>
        </div>
      </div>

      {/* Tab + Filters bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn ${notifTab === 'active' ? 'btn-primary' : ''}`} onClick={() => setNotifTab('active')}>
            <i className="fas fa-inbox"></i> Active
          </button>
          <button className={`btn ${notifTab === 'archived' ? 'btn-primary' : ''}`} onClick={() => setNotifTab('archived')}>
            <i className="fas fa-archive"></i> Archived
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ fontSize: 13 }} title="From date" />
          <span style={{ color: '#94A3B8' }}>→</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ fontSize: 13 }} title="To date" />
          {(fromDate || toDate) && (
            <button className="btn btn-sm" onClick={() => { setFromDate(''); setToDate(''); }} title="Clear dates"><i className="fas fa-times"></i></button>
          )}
          <button className="btn btn-primary" onClick={onNewBroadcast}><i className="fas fa-plus"></i> New Broadcast</button>
        </div>
      </div>

      {/* Results info */}
      <div style={{ fontSize: 13, color: '#64748B', marginBottom: 12 }}>
        {loading ? 'Loading...' : `${total} broadcast${total !== 1 ? 's' : ''} found`}
      </div>

      {/* Broadcast list */}
      {broadcasts.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60, color: '#64748B' }}>
          <i className="fas fa-bullhorn" style={{ fontSize: 40, marginBottom: 16 }}></i>
          <p>No {notifTab === 'archived' ? 'archived' : 'active'} broadcasts</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
          {broadcasts.map(bc => {
            const status = getStatus(bc);
            return (
              <div key={bc.id} className="card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong style={{ fontSize: 15 }}>{bc.title}</strong>
                      {statusBadge(status)}
                    </div>
                    <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>
                      {audienceLabel[bc.audience] || bc.audience} &middot; {bc.sent_at ? new Date(bc.sent_at).toLocaleString() : 'Pending'} &middot; {bc.sent_count} sent / {bc.open_count} opened
                    </div>
                  </div>
                  <button
                    className="btn btn-sm"
                    title={notifTab === 'archived' ? 'Unarchive' : 'Archive'}
                    onClick={() => toggleArchive(bc.id)}
                  >
                    <i className={`fas ${notifTab === 'archived' ? 'fa-undo' : 'fa-archive'}`}></i>
                  </button>
                </div>
                {bc.body && <p style={{ marginTop: 8, color: '#334155', fontSize: 14 }}>{bc.body}</p>}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <i className="fas fa-chevron-left"></i> Prev
          </button>
          <span style={{ fontSize: 13, color: '#64748B' }}>
            Page {page} of {totalPages}
          </span>
          <button className="btn btn-sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Next <i className="fas fa-chevron-right"></i>
          </button>
        </div>
      )}
    </div>
  );
}
