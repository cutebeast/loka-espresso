'use client';

import { useState, FormEvent } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import type { MerchantStore } from '@/lib/merchant-types';

interface StoreSettingsPageProps {
  stores: MerchantStore[];
  token: string;
  onRefresh: () => void;
}

export default function StoreSettingsPage({ stores, token, onRefresh }: StoreSettingsPageProps) {
  const [editingStore, setEditingStore] = useState<MerchantStore | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  if (editingStore) {
    return <EditStoreForm store={editingStore} token={token} onClose={() => { setEditingStore(null); onRefresh(); }} />;
  }

  if (showAdd) {
    return <AddStoreForm token={token} onClose={() => { setShowAdd(false); onRefresh(); }} />;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3>Store Management</h3>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}><i className="fas fa-plus"></i> Add Store</button>
      </div>
      <div style={{ display: 'grid', gap: 16 }}>
        {stores.map(s => (
          <div key={s.id} className="card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{s.name}</div>
                <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>{s.address}</div>
                <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>
                  Slug: <code>{s.slug}</code> · Phone: {s.phone || '-'} · {s.is_active ? '🟢 Active' : '🔴 Inactive'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-sm" onClick={() => setEditingStore(s)}><i className="fas fa-edit"></i> Edit</button>
                {s.is_active && (
                  <button className="btn btn-sm" style={{ color: '#EF4444' }} onClick={async () => {
                    if (confirm(`Deactivate store "${s.name}"? This will hide it from the app.`)) {
                      await apiFetch(`/admin/stores/${s.id}`, token, { method: 'DELETE' });
                      onRefresh();
                    }
                  }}><i className="fas fa-trash"></i> Deactivate</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Add Store Form ---
function AddStoreForm({ token, onClose }: { token: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/admin/stores', token, {
        method: 'POST',
        body: JSON.stringify({
          name,
          slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          address,
          phone,
          is_active: true,
          pickup_lead_minutes: 15,
        }),
      });
      onClose();
    } catch {} finally { setSaving(false); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3>Add New Store</h3>
        <button className="btn btn-sm" onClick={onClose}><i className="fas fa-arrow-left"></i> Back</button>
      </div>
      <div className="card">
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Store Name *</label>
            <input value={name} onChange={e => { setName(e.target.value); if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-')); }} required placeholder="e.g. ZUS Coffee Bangsar" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Slug *</label>
            <input value={slug} onChange={e => setSlug(e.target.value)} required placeholder="e.g. zus-bangsar" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Address</label>
            <textarea value={address} onChange={e => setAddress(e.target.value)} rows={2} style={{ outline: 'none', border: '1px solid #DDE3E9', borderRadius: 12, padding: '8px 14px', fontSize: 14, width: '100%' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+60 3-XXXX XXXX" />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Creating...' : 'Create Store'}</button>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Edit Store Form ---
function EditStoreForm({ store, token, onClose }: { store: MerchantStore; token: string; onClose: () => void }) {
  const [name, setName] = useState(store.name);
  const [address, setAddress] = useState(store.address || '');
  const [phone, setPhone] = useState(store.phone || '');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch(`/admin/stores/${store.id}`, token, {
        method: 'PUT',
        body: JSON.stringify({ name, address, phone }),
      });
      onClose();
    } catch {} finally { setSaving(false); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3>Edit: {store.name}</h3>
        <button className="btn btn-sm" onClick={onClose}><i className="fas fa-arrow-left"></i> Back</button>
      </div>
      <div className="card">
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Store Name</label>
            <input value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Slug</label>
            <input value={store.slug} disabled style={{ background: '#F1F5F9' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Address</label>
            <textarea value={address} onChange={e => setAddress(e.target.value)} rows={2} style={{ outline: 'none', border: '1px solid #DDE3E9', borderRadius: 12, padding: '8px 14px', fontSize: 14, width: '100%' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
