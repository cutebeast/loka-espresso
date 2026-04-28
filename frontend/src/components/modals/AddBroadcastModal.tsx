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
    } catch { console.error('Failed to create broadcast'); } finally { setSaving(false); }
  }

  return (
    <>
      <div className="df-section">
        <div className="df-grid">
          <div className="df-field">
            <label className="df-label">Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} required placeholder="Broadcast title" />
          </div>
          <div className="df-field">
            <label className="df-label">Target Audience</label>
            <select value={targetAudience} onChange={e => setTargetAudience(e.target.value)}>
              <option value="all">All Users</option>
              <option value="new">New Users</option>
              <option value="loyal">Loyal Customers</option>
              <option value="inactive">Inactive Users</option>
            </select>
          </div>
        </div>
        <div className="df-field" style={{ marginBottom: 16 }}>
          <label className="df-label">Message *</label>
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} required placeholder="Broadcast message..." />
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
        <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="submit" className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving...' : 'Create Broadcast'}
        </button>
      </div>
    </>
  );
}
