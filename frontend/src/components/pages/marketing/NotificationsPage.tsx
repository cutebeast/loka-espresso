'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import { FilterSelect, DateFilter, Pagination, Drawer } from '@/components/ui';
import { type DatePreset } from '@/components/ui/DateFilter';
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

function EditForm({ bc, token: _token, onSave, onCancel }: EditFormProps) {
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
      const res = await apiFetch(`/admin/broadcasts/${bc.id}`, undefined, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) onSave();
    } catch { console.error('Failed to save broadcast'); } finally { setSaving(false); }
  }

  return (
    <>
      <div className="df-section">
        <div className="df-grid">
          <div className="df-field">
            <label className="df-label">Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Broadcast title" />
          </div>
          <div className="df-field">
            <label className="df-label">Audience</label>
            <FilterSelect
              value={audience}
              onChange={setAudience}
              options={audienceOptions}
              placeholder="Select audience..."
            />
          </div>
        </div>
        <div className="df-field" style={{ marginBottom: 16 }}>
          <label className="df-label">Body</label>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={3} placeholder="Broadcast message..." />
        </div>
        <div className="df-grid">
          <div className="df-field">
            <label className="df-label">Schedule Date <span>(optional)</span></label>
            <input
              type="date"
              value={scheduledDate}
              onChange={e => setScheduledDate(e.target.value)}
              min={((): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })()}
            />
            <div className="df-hint">Leave empty to save as draft</div>
          </div>
          <div className="df-field">
            <label className="df-label">Schedule Time</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="time"
                value={scheduledTime}
                onChange={e => setScheduledTime(e.target.value)}
                style={{ flex: 1 }}
              />
              {(scheduledDate || scheduledTime) && (
                <button type="button" className="btn btn-sm" onClick={() => { setScheduledDate(''); setScheduledTime(''); }} title="Clear">
                  <i className="fas fa-times"></i>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="df-actions">
        <button className="btn" onClick={onCancel} disabled={saving}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !title.trim()}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </>
  );
}

export default function NotificationsPage({ token, refreshKey: _refreshKey, onNewBroadcast }: NotificationsPageProps) {
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
      const res = await apiFetch(`/admin/broadcasts?${params}`);
      if (res.ok) {
        const data = await res.json();
        setBroadcasts(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
      }
    } catch { console.error('Failed to fetch broadcasts'); } finally { setLoading(false); }
  }, [page, notifTab, fromDate, toDate]);

  useEffect(() => { fetchBroadcasts(); }, [fetchBroadcasts]);
  useEffect(() => { setPage(1); }, [notifTab, fromDate, toDate]);

  async function toggleArchive(id: number) {
    await apiFetch(`/admin/broadcasts/${id}/archive`, undefined, { method: 'PATCH' });
    fetchBroadcasts();
  }

  async function deleteBroadcast(id: number) {
    await apiFetch(`/admin/broadcasts/${id}`, undefined, { method: 'DELETE' });
    setConfirmDeleteId(null);
    fetchBroadcasts();
  }

  const audienceLabel: Record<string, string> = {
    all: 'All Users', new: 'New Users', loyal: 'Loyal Customers',
    inactive: 'Inactive Users', platinum: 'Platinum Members',
  };

  const statusFilterOptions = [
    { value: 'active', label: 'Active' },
    { value: 'archived', label: 'Archived' },
  ];

  const editingBroadcast = editingId ? broadcasts.find(bc => bc.id === editingId) : null;

  return (
    <div>
      {editingBroadcast && (
        <Drawer isOpen={true} onClose={() => setEditingId(null)} title={`Edit: ${editingBroadcast.title}`}>
          <EditForm
            bc={editingBroadcast}
            token={token}
            onSave={() => { setEditingId(null); fetchBroadcasts(); }}
            onCancel={() => setEditingId(null)}
          />
        </Drawer>
      )}
      <div className="np-13">
        <span className="np-14"><i className="fas fa-info-circle"></i></span>
        <div>
          <div className="np-15">Service Worker Push Delivery</div>
          <div className="np-16">
            Broadcasts are stored in DB. The PWA client uses a Service Worker to periodically fetch new notifications. No server-push integration (FCM/APNs) is needed.
          </div>
        </div>
      </div>

      {/* Filter Bar - Filters on left, New Broadcast button on right */}
      <div className="np-17">
        <div className="np-18">
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
      <div className="np-19">
        <div className="np-20">
          <span className="np-21"><i className="fas fa-bullhorn"></i></span>
          Showing <strong className="np-22">{broadcasts.length}</strong> of <strong className="np-23">{total}</strong> broadcasts
        </div>
        <div className="np-24">
          Page {page} of {totalPages}
        </div>
      </div>

      {broadcasts.length === 0 ? (
        <div className="card np-25" >
          <span className="np-26"><i className="fas fa-bullhorn"></i></span>
          <p>No {notifTab === 'archived' ? 'archived' : 'active'} broadcasts</p>
        </div>
      ) : (
        <div className="np-27">
          {broadcasts.map(bc => {
            const draft = isDraftStatus(bc);
            return (
              <div key={bc.id} className="card np-28" >
                <div className="np-29">
                  <div className="np-30">
                    <div className="np-31">
                      <strong className="np-32">{bc.title}</strong>
                      {statusBadge(bc.status, bc.scheduled_at)}
                    </div>
                    <div className="np-33">
                      {audienceLabel[bc.audience] || bc.audience}
                      {bc.scheduled_at && !bc.sent_at && <span> &middot; <i className="fas fa-clock"></i> Scheduled: {new Date(bc.scheduled_at).toLocaleString()}</span>}
                      {bc.sent_at && <span> &middot; Published: {new Date(bc.sent_at).toLocaleString()}</span>}
                      {!bc.scheduled_at && !bc.sent_at && <span> &middot; Draft</span>}
                    </div>
                  </div>
                  <div className="np-34">
                    {draft && (
                      <>
                        <button className="btn btn-sm" title="Edit" onClick={() => setEditingId(editingId === bc.id ? null : bc.id)}>
                          <i className="fas fa-pen"></i>
                        </button>
                        {confirmDeleteId === bc.id ? (
                          <div className="np-35">
                            <button className="btn btn-sm np-36"  onClick={() => deleteBroadcast(bc.id)}>Confirm</button>
                            <button className="btn btn-sm" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                          </div>
                        ) : (
                          <button className="btn btn-sm" title="Delete" onClick={() => setConfirmDeleteId(bc.id)}>
                            <span className="np-37"><i className="fas fa-trash"></i></span>
                          </button>
                        )}
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
              {bc.body && <p className="np-38">{bc.body}</p>}
              
              </div>
            );
          })}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} loading={loading} />
    </div>
  );
}
