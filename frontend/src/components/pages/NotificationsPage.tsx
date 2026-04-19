'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import { FilterSelect, DateFilter } from '@/components/ui';
import { type DatePreset } from '@/components/ui/DateFilter';
import { THEME } from '@/lib/theme';
import type { MerchantBroadcast } from '@/lib/merchant-types';

interface NotificationsPageProps {
  token: string;
  refreshKey: number;
  onNewBroadcast: () => void;
}

function statusBadge(status: string, scheduledAt?: string | null) {
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: 'Draft', cls: 'badge-gray' },
    pending: { label: 'Pending', cls: 'badge-yellow' },
    sent: { label: 'Sent', cls: 'badge-green' },
    delivered: { label: 'Delivered', cls: 'badge-blue' },
    failed: { label: 'Failed', cls: 'badge-red' },
  };
  // If scheduled for future delivery, show as "Scheduled"
  if (scheduledAt && status === 'draft') {
    return <span className="badge badge-yellow"><i className="fas fa-clock"></i> Scheduled</span>;
  }
  const info = map[status] || map.pending;
  return <span className={`badge ${info.cls}`}>{info.label}</span>;
}

function isDraftStatus(bc: MerchantBroadcast): boolean {
  return bc.status === 'draft' || bc.status === 'pending';
}

interface EditFormProps {
  bc: MerchantBroadcast;
  token: string;
  onSave: () => void;
  onCancel: () => void;
}

function EditForm({ bc, token, onSave, onCancel }: EditFormProps) {
  const [title, setTitle] = useState(bc.title);
  const [body, setBody] = useState(bc.body || '');
  const [audience, setAudience] = useState(bc.audience);
  const [scheduledDate, setScheduledDate] = useState(
    bc.scheduled_at ? bc.scheduled_at.slice(0, 10) : ''
  );
  const [scheduledTime, setScheduledTime] = useState(
    bc.scheduled_at ? bc.scheduled_at.slice(11, 16) : ''
  );
  const [saving, setSaving] = useState(false);

  const audienceOptions = [
    { value: 'all', label: 'All Users' },
    { value: 'new', label: 'New Users' },
    { value: 'loyal', label: 'Loyal Customers' },
    { value: 'inactive', label: 'Inactive Users' },
    { value: 'platinum', label: 'Platinum Members' },
  ];

  async function handleSave() {
    setSaving(true);
    try {
      const payload: Record<string, string> = { title, body, audience };
      if (scheduledDate && scheduledTime) {
        payload.scheduled_at = `${scheduledDate}T${scheduledTime}:00`;
      }
      const res = await apiFetch(`/admin/broadcasts/${bc.id}`, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) onSave();
    } catch {} finally { setSaving(false); }
  }

  return (
    <div style={{ marginTop: 12, padding: 16, background: THEME.bgMuted, borderRadius: 12, border: `1px solid ${THEME.accentLight}` }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: THEME.primary, display: 'block', marginBottom: 4 }}>Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${THEME.accentLight}`, fontSize: 14 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: THEME.primary, display: 'block', marginBottom: 4 }}>Body</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={3} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${THEME.accentLight}`, fontSize: 14, resize: 'vertical' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: THEME.primary, display: 'block', marginBottom: 4 }}>Audience</label>
          <FilterSelect
            value={audience}
            onChange={setAudience}
            options={audienceOptions}
            placeholder="Select audience..."
          />
        </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: THEME.primary, display: 'block', marginBottom: 4 }}>
              Schedule (optional)
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="date"
                value={scheduledDate}
                onChange={e => setScheduledDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                style={{ width: 150, padding: '6px 10px', borderRadius: 8, border: `1px solid ${THEME.accentLight}`, fontSize: 13 }}
              />
              <input
                type="time"
                value={scheduledTime}
                onChange={e => setScheduledTime(e.target.value)}
                style={{ width: 110, padding: '6px 10px', borderRadius: 8, border: `1px solid ${THEME.accentLight}`, fontSize: 13 }}
              />
            {(scheduledDate || scheduledTime) && (
              <button type="button" className="btn btn-sm" onClick={() => { setScheduledDate(''); setScheduledTime(''); }} title="Clear schedule">
                <i className="fas fa-times"></i>
              </button>
            )}
          </div>
          <div style={{ fontSize: 11, color: THEME.success, marginTop: 4 }}>
            Leave empty to save as draft with no schedule
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onCancel} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NotificationsPage({ token, refreshKey, onNewBroadcast }: NotificationsPageProps) {
  const [broadcasts, setBroadcasts] = useState<MerchantBroadcast[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [notifTab, setNotifTab] = useState<'active' | 'archived'>('active');
  const [preset, setPreset] = useState<DatePreset>('MTD');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);

  const fetchBroadcasts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: '20',
        is_archived: String(notifTab === 'archived'),
      });
      if (fromDate) params.set('from_date', fromDate + 'T00:00:00');
      if (toDate) params.set('to_date', toDate + 'T23:59:59');
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
  useEffect(() => { setPage(1); }, [notifTab, fromDate, toDate]);

  async function toggleArchive(id: number) {
    await apiFetch(`/admin/broadcasts/${id}/archive`, token, { method: 'PATCH' });
    fetchBroadcasts();
  }

  async function deleteBroadcast(id: number) {
    await apiFetch(`/admin/broadcasts/${id}`, token, { method: 'DELETE' });
    setConfirmDeleteId(null);
    fetchBroadcasts();
  }

  async function sendBroadcast(id: number) {
    setSendingId(id);
    try {
      const res = await apiFetch(`/admin/broadcasts/${id}/send`, token, { method: 'POST' });
      if (res.ok) fetchBroadcasts();
    } catch {} finally { setSendingId(null); }
  }

  const audienceLabel: Record<string, string> = {
    all: 'All Users', new: 'New Users', loyal: 'Loyal Customers',
    inactive: 'Inactive Users', platinum: 'Platinum Members',
  };

  const statusFilterOptions = [
    { value: 'active', label: 'Active' },
    { value: 'archived', label: 'Archived' },
  ];

  return (
    <div>
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
          <div style={{ fontWeight: 600, color: '#92400E', fontSize: 13, marginBottom: 2 }}>Delivery integration coming in Phase 3</div>
          <div style={{ fontSize: 12, color: '#78350F' }}>
            Broadcasts are stored in DB but not yet delivered. Twilio / FCM / APNs integration is planned for Phase 3.
          </div>
        </div>
      </div>

      {/* Filter Bar - Filters on left, New Broadcast button on right */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <FilterSelect
            value={notifTab}
            onChange={(val) => setNotifTab(val as 'active' | 'archived')}
            options={statusFilterOptions}
            icon="fa-filter"
            placeholder="Filter by status"
          />
          <DateFilter
            preset={preset}
            onChange={(p, from, to) => { setPreset(p); setFromDate(from); setToDate(to); }}
            fromDate={fromDate}
            toDate={toDate}
          />
        </div>
        <button className="btn btn-primary" onClick={onNewBroadcast}>
          <i className="fas fa-plus"></i> New Broadcast
        </button>
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
          <i className="fas fa-bullhorn" style={{ marginRight: 8, color: THEME.primary }}></i>
          Showing <strong style={{ color: THEME.textPrimary }}>{broadcasts.length}</strong> of <strong style={{ color: THEME.textPrimary }}>{total}</strong> broadcasts
        </div>
        <div style={{ fontSize: 13, color: THEME.textMuted }}>
          Page {page} of {totalPages}
        </div>
      </div>

      {broadcasts.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60, color: THEME.textMuted }}>
          <i className="fas fa-bullhorn" style={{ fontSize: 40, marginBottom: 16 }}></i>
          <p>No {notifTab === 'archived' ? 'archived' : 'active'} broadcasts</p>
        </div>
      ) : (
        <div style={{ 
          display: 'grid', 
          gap: 12, 
          marginBottom: 20,
          borderRadius: `0 0 ${THEME.radius.md} ${THEME.radius.md}`,
          background: THEME.bgCard,
          border: `1px solid ${THEME.border}`,
          borderTop: 'none',
          padding: '16px 20px',
        }}>
          {broadcasts.map(bc => {
            const draft = isDraftStatus(bc);
            return (
              <div key={bc.id} className="card" style={{ padding: '16px 20px', margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong style={{ fontSize: 15 }}>{bc.title}</strong>
                      {statusBadge(bc.status, bc.scheduled_at)}
                    </div>
                    <div style={{ fontSize: 12, color: THEME.success, marginTop: 4 }}>
                      {audienceLabel[bc.audience] || bc.audience}
                      {bc.scheduled_at && !bc.sent_at && <span> &middot; <i className="fas fa-clock"></i> Scheduled: {new Date(bc.scheduled_at).toLocaleString()}</span>}
                      {bc.sent_at && <span> &middot; Sent: {new Date(bc.sent_at).toLocaleString()}</span>}
                      {!bc.scheduled_at && !bc.sent_at && <span> &middot; Not sent</span>}
                      &middot; {bc.sent_count} sent / {bc.open_count} opened
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {draft && (
                      <>
                        <button className="btn btn-sm" title="Edit" onClick={() => setEditingId(editingId === bc.id ? null : bc.id)}>
                          <i className="fas fa-pen"></i>
                        </button>
                        {confirmDeleteId === bc.id ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <button className="btn btn-sm" style={{ background: '#EF4444', color: '#fff', border: 'none' }} onClick={() => deleteBroadcast(bc.id)}>Confirm</button>
                            <button className="btn btn-sm" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                          </div>
                        ) : (
                          <button className="btn btn-sm" title="Delete" onClick={() => setConfirmDeleteId(bc.id)}>
                            <i className="fas fa-trash" style={{ color: '#EF4444' }}></i>
                          </button>
                        )}
                        <button
                          className="btn btn-sm btn-primary"
                          title="Send Now"
                          disabled={sendingId === bc.id}
                          onClick={() => sendBroadcast(bc.id)}
                        >
                          {sendingId === bc.id ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-paper-plane"></i>} Send
                        </button>
                      </>
                    )}
                    <button
                      className="btn btn-sm"
                      title={notifTab === 'archived' ? 'Unarchive' : 'Archive'}
                      onClick={() => toggleArchive(bc.id)}
                    >
                      <i className={`fas ${notifTab === 'archived' ? 'fa-undo' : 'fa-archive'}`}></i>
                    </button>
                  </div>
                </div>
                {bc.body && <p style={{ marginTop: 8, color: THEME.primary, fontSize: 14 }}>{bc.body}</p>}
                {editingId === bc.id && draft && (
                  <EditForm
                    bc={bc}
                    token={token}
                    onSave={() => { setEditingId(null); fetchBroadcasts(); }}
                    onCancel={() => setEditingId(null)}
                  />
                )}
              </div>
            );
          })}
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
            onClick={() => setPage(page - 1)}
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
                  onClick={() => setPage(pageNum)}
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
            onClick={() => setPage(page + 1)}
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
    </div>
  );
}
