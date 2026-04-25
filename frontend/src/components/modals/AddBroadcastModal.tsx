'use client';

import { useState, FormEvent } from 'react';
import { apiFetch } from '@/lib/merchant-api';

export function AddBroadcastForm({ token: _token, onClose }: { token: string; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetAudience, setTargetAudience] = useState('all');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, string> = { title, body: message, audience: targetAudience };
      if (scheduledDate && scheduledTime) {
        payload.scheduled_at = `${scheduledDate}T${scheduledTime}:00`;
      }
      await apiFetch('/admin/broadcasts', undefined, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      onClose();
    } catch {} finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)} required />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Message</label>
        <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} required style={{ outline: 'none', border: '1px solid #DDE3E9', borderRadius: 12, padding: '8px 14px', fontSize: 14, width: '100%' }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Target Audience</label>
        <select value={targetAudience} onChange={e => setTargetAudience(e.target.value)}>
          <option value="all">All Users</option>
          <option value="new">New Users</option>
          <option value="loyal">Loyal Customers</option>
          <option value="inactive">Inactive Users</option>
        </select>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
          Schedule (optional)
        </label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="date"
            value={scheduledDate}
            onChange={e => setScheduledDate(e.target.value)}
            min={((): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })()}
            style={{ width: 150, padding: '6px 10px', borderRadius: 8, border: '1px solid #DDE3E9', fontSize: 13 }}
          />
          <input
            type="time"
            value={scheduledTime}
            onChange={e => setScheduledTime(e.target.value)}
            style={{ width: 110, padding: '6px 10px', borderRadius: 8, border: '1px solid #DDE3E9', fontSize: 13 }}
          />
          {(scheduledDate || scheduledTime) && (
            <button type="button" className="btn btn-sm" onClick={() => { setScheduledDate(''); setScheduledTime(''); }} title="Clear schedule">
              <i className="fas fa-times"></i>
            </button>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
          Leave empty to save as draft (no schedule)
        </div>
      </div>
      <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>
        {saving ? 'Saving...' : 'Save Broadcast'}
      </button>
    </form>
  );
}
