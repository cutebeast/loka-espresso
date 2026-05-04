'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import type { NotificationTemplate } from '@/lib/merchant-types';

const NOTIF_TYPES = [
  { value: 'broadcast', label: 'Broadcast' },
  { value: 'order', label: 'Order' },
  { value: 'reward', label: 'Reward' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'loyalty', label: 'Loyalty' },
  { value: 'promo', label: 'Promo' },
  { value: 'info', label: 'Info' },
  { value: 'event', label: 'Event' },
];

const AUDIENCES = [
  { value: 'all', label: 'All Users' },
  { value: 'new', label: 'New Users' },
  { value: 'loyal', label: 'Loyal Customers' },
  { value: 'inactive', label: 'Inactive Users' },
  { value: 'platinum', label: 'Platinum Members' },
];

function TemplateForm({ onSave, onCancel, existing }: { onSave: () => void; onCancel: () => void; existing?: NotificationTemplate }) {
  const [name, setName] = useState(existing?.name || '');
  const [title, setTitle] = useState(existing?.title || '');
  const [body, setBody] = useState(existing?.body || '');
  const [type, setType] = useState(existing?.type || 'broadcast');
  const [audience, setAudience] = useState(existing?.audience || 'all');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim() || !title.trim()) return;
    setSaving(true);
    try {
      const payload = { name: name.trim(), title: title.trim(), body, type, audience };
      if (existing) {
        await apiFetch(`/admin/notification-templates/${existing.id}`, undefined, {
          method: 'PUT', body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/admin/notification-templates', undefined, {
          method: 'POST', body: JSON.stringify(payload),
        });
      }
      onSave();
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  return (
    <div className="df-section">
      <div className="df-grid">
        <div className="df-field">
          <label className="df-label">Template Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Welcome New User" />
        </div>
        <div className="df-field">
          <label className="df-label">Type</label>
          <select value={type} onChange={e => setType(e.target.value)}>
            {NOTIF_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>
      <div className="df-field" style={{ marginBottom: 16 }}>
        <label className="df-label">Notification Title *</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g., Your Order is Ready!" />
      </div>
      <div className="df-field" style={{ marginBottom: 16 }}>
        <label className="df-label">Message Body</label>
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={3} placeholder="e.g., Come grab your order at the counter!" />
      </div>
      <div className="df-field" style={{ marginBottom: 16 }}>
        <label className="df-label">Target Audience</label>
        <select value={audience} onChange={e => setAudience(e.target.value)}>
          {AUDIENCES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </div>
      <div className="df-actions">
        <button className="btn" onClick={onCancel} disabled={saving}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !name.trim() || !title.trim()}>
          {saving ? 'Saving...' : existing ? 'Update Template' : 'Create Template'}
        </button>
      </div>
    </div>
  );
}

export default function NotificationTemplateManager() {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | undefined>();

  const fetchTemplates = () => {
    setLoading(true);
    apiFetch('/admin/notification-templates', undefined, {})
      .then(async r => { if (r.ok) setTemplates(await r.json()); })
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTemplates(); }, []);

  function openNew() { setEditingTemplate(undefined); setShowForm(true); }
  function openEdit(tmpl: NotificationTemplate) { setEditingTemplate(tmpl); setShowForm(true); }
  function closeForm() { setShowForm(false); setEditingTemplate(undefined); fetchTemplates(); }

  async function deleteTemplate(id: number) {
    await apiFetch(`/admin/notification-templates/${id}`, undefined, { method: 'DELETE' });
    fetchTemplates();
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600 }}>📋 Notification Templates</h3>
        <button className="btn btn-primary btn-sm" onClick={openNew}>
          <i className="fas fa-plus"></i> New Template
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          <TemplateForm onSave={closeForm} onCancel={() => setShowForm(false)} existing={editingTemplate} />
        </div>
      )}

      {loading ? (
        <div className="card np-25"><p>Loading templates...</p></div>
      ) : templates.length === 0 ? (
        <div className="card np-25"><p>No templates yet. Create one to speed up broadcast drafting.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {templates.map(tmpl => (
            <div key={tmpl.id} className="card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{tmpl.name}</strong>
                <span className="badge badge-outline" style={{ marginLeft: 8 }}>{tmpl.type}</span>
                <span style={{ marginLeft: 8, fontSize: 12, color: '#6A7A8A' }}>{tmpl.audience}</span>
                <div style={{ fontSize: 12, color: '#6A7A8A', marginTop: 2 }}>"{tmpl.title}"</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-sm" title="Edit" onClick={() => openEdit(tmpl)}>
                  <i className="fas fa-pen"></i>
                </button>
                <button className="btn btn-sm" title="Delete" onClick={() => deleteTemplate(tmpl.id)}>
                  <i className="fas fa-trash" style={{ color: '#C75050' }}></i>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
