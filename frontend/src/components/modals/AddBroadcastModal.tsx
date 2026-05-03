'use client';

import { useState, useEffect, FormEvent } from 'react';
import { apiFetch } from '@/lib/merchant-api';

const NOTIFICATION_TYPES = [
  { value: 'broadcast', label: 'General Broadcast' },
  { value: 'order', label: 'Order Update' },
  { value: 'reward', label: 'Rewards' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'loyalty', label: 'Loyalty' },
  { value: 'promo', label: 'Promo' },
  { value: 'info', label: 'Information' },
  { value: 'event', label: 'Event' },
];

const AUDIENCES = [
  { value: 'all', label: 'All Users' },
  { value: 'new', label: 'New Users' },
  { value: 'loyal', label: 'Loyal Customers' },
  { value: 'inactive', label: 'Inactive Users' },
];

interface Template {
  id: number;
  name: string;
  title: string;
  body: string | null;
  type: string;
  audience: string;
}

export function AddBroadcastForm({ token: _token, onClose }: { token: string; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [notifType, setNotifType] = useState('broadcast');
  const [imageUrl, setImageUrl] = useState('');
  const [targetAudience, setTargetAudience] = useState('all');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  useEffect(() => {
    apiFetch('/admin/notification-templates', undefined, {})
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          setTemplates(Array.isArray(data) ? data : []);
        } else {
          setTemplates([]);
        }
      })
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTemplates(false));
  }, []);

  function loadTemplate(tmpl: Template) {
    setTitle(tmpl.title);
    setMessage(tmpl.body || '');
    setNotifType(tmpl.type || 'broadcast');
    setTargetAudience(tmpl.audience || 'all');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title,
        body: message,
        type: notifType,
        audience: targetAudience,
        image_url: imageUrl || undefined,
      };
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
        {/* Template selector */}
        {!loadingTemplates && templates.length > 0 && (
          <div className="df-field">
            <label className="df-label">Load Template</label>
            <select
              value=""
              onChange={(e) => {
                const tmpl = templates.find(t => t.id === Number(e.target.value));
                if (tmpl) loadTemplate(tmpl);
              }}
            >
              <option value="" disabled>Select a template...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.type})</option>
              ))}
            </select>
            <div className="df-hint">Pre-fills the form from a saved template</div>
          </div>
        )}

        <div className="df-grid">
          <div className="df-field">
            <label className="df-label">Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} required placeholder="Broadcast title" />
          </div>
          <div className="df-field">
            <label className="df-label">Type</label>
            <select value={notifType} onChange={e => setNotifType(e.target.value)}>
              {NOTIFICATION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="df-grid">
          <div className="df-field">
            <label className="df-label">Target Audience</label>
            <select value={targetAudience} onChange={e => setTargetAudience(e.target.value)}>
              {AUDIENCES.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>
          <div className="df-field">
            <label className="df-label">Image URL <span>(optional)</span></label>
            <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." />
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
