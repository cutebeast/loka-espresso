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
      <div className="abf-0">
        <label className="abf-1">Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)} required />
      </div>
      <div className="abf-2">
        <label className="abf-3">Message</label>
        <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} required className="abf-4" />
      </div>
      <div className="abf-5">
        <label className="abf-6">Target Audience</label>
        <select value={targetAudience} onChange={e => setTargetAudience(e.target.value)}>
          <option value="all">All Users</option>
          <option value="new">New Users</option>
          <option value="loyal">Loyal Customers</option>
          <option value="inactive">Inactive Users</option>
        </select>
      </div>
      <div className="abf-7">
        <label className="abf-8">
          Schedule (optional)
        </label>
        <div className="abf-9">
          <input
            type="date"
            value={scheduledDate}
            onChange={e => setScheduledDate(e.target.value)}
            min={((): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })()}
            className="abf-10"
          />
          <input
            type="time"
            value={scheduledTime}
            onChange={e => setScheduledTime(e.target.value)}
            className="abf-11"
          />
          {(scheduledDate || scheduledTime) && (
            <button type="button" className="btn btn-sm" onClick={() => { setScheduledDate(''); setScheduledTime(''); }} title="Clear schedule">
              <i className="fas fa-times"></i>
            </button>
          )}
        </div>
        <div className="abf-12">
          Leave empty to save as draft (no schedule)
        </div>
      </div>
      <button type="submit" className="btn btn-primary abf-13"  disabled={saving}>
        {saving ? 'Saving...' : 'Save Broadcast'}
      </button>
    </form>
  );
}
