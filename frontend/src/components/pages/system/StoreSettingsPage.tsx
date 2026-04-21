'use client';

import { useState, FormEvent } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import type { MerchantStore } from '@/lib/merchant-types';
import { THEME } from '@/lib/theme';

interface StoreSettingsPageProps {
  stores: MerchantStore[];
  token: string;
  onRefresh: () => void;
}

export default function StoreSettingsPage({ stores, token, onRefresh }: StoreSettingsPageProps) {
  const [editingStore, setEditingStore] = useState<MerchantStore | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState('');

  if (editingStore) {
    return <EditStoreForm store={editingStore} token={token} onClose={() => { setEditingStore(null); onRefresh(); }} />;
  }

  if (showAdd) {
    return <AddStoreForm token={token} onClose={() => { setShowAdd(false); onRefresh(); }} />;
  }

  async function toggleStore(s: MerchantStore) {
    setError('');
    const action = s.is_active ? 'deactivate' : 'reactivate';
    if (!confirm(`Are you sure you want to ${action} "${s.name}"?`)) return;
    try {
      if (s.is_active) {
        const res = await apiFetch(`/admin/stores/${s.id}`, token, { method: 'DELETE' });
        if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.detail || 'Failed to deactivate'); return; }
      } else {
        const res = await apiFetch(`/admin/stores/${s.id}/toggle`, token, { method: 'PATCH' });
        if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.detail || 'Failed to reactivate'); return; }
      }
      onRefresh();
    } catch { setError('Network error'); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 20 }}>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}><i className="fas fa-plus"></i> Add Store</button>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          <i className="fas fa-exclamation-circle"></i> {error}
        </div>
      )}

      <div style={{ display: 'grid', gap: 16 }}>
        {stores.map(s => (
          <div key={s.id} className="card" style={{ padding: '20px 24px', opacity: s.is_active ? 1 : 0.6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{s.name} {!s.is_active && <span style={{ fontSize: 12, color: '#EF4444', fontWeight: 500 }}>(Inactive)</span>}</div>
                <div style={{ fontSize: 13, color: THEME.success, marginTop: 4 }}>{s.address}</div>
                <div style={{ fontSize: 12, color: THEME.success, marginTop: 4 }}>
                  Slug: <code>{s.slug}</code> · Phone: {s.phone || '-'} · Pickup lead: {s.pickup_lead_minutes || '-'} min
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn btn-sm" onClick={() => setEditingStore(s)}><i className="fas fa-edit"></i> Edit</button>
                {s.id === 0 ? (
                  <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, background: THEME.bgMuted, color: THEME.primary, fontWeight: 500 }}>Main Store — Cannot deactivate</span>
                ) : (
                  <button
                    className={`btn btn-sm ${s.is_active ? '' : 'btn-primary'}`}
                    style={s.is_active ? { color: '#EF4444' } : {}}
                    onClick={() => toggleStore(s)}
                  >
                    <i className={`fas ${s.is_active ? 'fa-toggle-off' : 'fa-toggle-on'}`}></i> {s.is_active ? 'Deactivate' : 'Reactivate'}
                  </button>
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

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: THEME.primary };
const hintStyle: React.CSSProperties = { fontSize: 11, color: THEME.success, marginTop: 2 };

function AddStoreForm({ token, onClose }: { token: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [pickupLead, setPickupLead] = useState('15');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [deliveryRadius, setDeliveryRadius] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [openingHours, setOpeningHours] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name,
        slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        address,
        phone,
        pickup_lead_minutes: parseInt(pickupLead) || 15,
      };
      if (lat) payload.lat = parseFloat(lat);
      if (lng) payload.lng = parseFloat(lng);
      if (deliveryRadius) payload.delivery_radius_km = parseFloat(deliveryRadius);
      if (imageUrl) payload.image_url = imageUrl;
      if (openingHours) {
        try { payload.opening_hours = JSON.parse(openingHours); } catch { /* ignore */ }
      }
      await apiFetch('/admin/stores', token, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      onClose();
    } catch {} finally { setSaving(false); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', marginBottom: 20 }}>
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
            <textarea value={address} onChange={e => setAddress(e.target.value)} rows={2} style={{ outline: 'none', border: `1px solid ${THEME.accentLight}`, borderRadius: 12, padding: '8px 14px', fontSize: 14, width: '100%' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Phone</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+60 3-XXXX XXXX" />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Pickup Lead Time (min)</label>
              <input type="number" value={pickupLead} onChange={e => setPickupLead(e.target.value)} min={0} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Latitude</label>
              <input type="number" step="any" value={lat} onChange={e => setLat(e.target.value)} placeholder="e.g. 3.1390" />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Longitude</label>
              <input type="number" step="any" value={lng} onChange={e => setLng(e.target.value)} placeholder="e.g. 101.6869" />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Delivery Radius (km)</label>
              <input type="number" step="any" value={deliveryRadius} onChange={e => setDeliveryRadius(e.target.value)} placeholder="e.g. 5.0" />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Image URL</label>
            <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Opening Hours (JSON)</label>
            <textarea value={openingHours} onChange={e => setOpeningHours(e.target.value)} rows={3} placeholder={'{\n  "mon": "08:00-22:00"\n}'} style={{ outline: 'none', border: `1px solid ${THEME.accentLight}`, borderRadius: 12, padding: '8px 14px', fontSize: 14, width: '100%', fontFamily: 'monospace' }} />
            <div style={hintStyle}>JSON object with day keys. Leave empty to skip.</div>
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
  const [pickupLead, setPickupLead] = useState(String(store.pickup_lead_minutes || 15));
  const [lat, setLat] = useState(store.lat != null ? String(store.lat) : '');
  const [lng, setLng] = useState(store.lng != null ? String(store.lng) : '');
  const [deliveryRadius, setDeliveryRadius] = useState(store.delivery_radius_km != null ? String(store.delivery_radius_km) : '');
  const [imageUrl, setImageUrl] = useState(store.image_url || '');
  const [openingHours, setOpeningHours] = useState<string>(store.opening_hours ? JSON.stringify(store.opening_hours, null, 2) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        name,
        address,
        phone,
        pickup_lead_minutes: parseInt(pickupLead) || 15,
      };
      if (lat) payload.lat = parseFloat(lat);
      if (lng) payload.lng = parseFloat(lng);
      if (deliveryRadius) payload.delivery_radius_km = parseFloat(deliveryRadius);
      if (imageUrl) payload.image_url = imageUrl;
      if (openingHours) {
        try { payload.opening_hours = JSON.parse(openingHours); } catch { /* ignore invalid JSON */ }
      }
      const res = await apiFetch(`/admin/stores/${store.id}`, token, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || `Failed (${res.status})`);
        return;
      }
      onClose();
    } catch { setError('Network error'); } finally { setSaving(false); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3>Edit: {store.name}</h3>
        <button className="btn btn-sm" onClick={onClose}><i className="fas fa-arrow-left"></i> Back</button>
      </div>
      <div className="card">
        {error && (
          <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
            <i className="fas fa-exclamation-circle"></i> {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Store Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Slug</label>
            <input value={store.slug} disabled style={{ background: THEME.bgMuted }} />
            <div style={hintStyle}>Slug cannot be changed after creation</div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Address</label>
            <textarea value={address} onChange={e => setAddress(e.target.value)} rows={2} style={{ outline: 'none', border: `1px solid ${THEME.accentLight}`, borderRadius: 12, padding: '8px 14px', fontSize: 14, width: '100%' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Phone</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+60 3-XXXX XXXX" />
            </div>
            <div>
              <label style={labelStyle}>Pickup Lead Time (minutes)</label>
              <input type="number" value={pickupLead} onChange={e => setPickupLead(e.target.value)} min={0} />
              <div style={hintStyle}>How far in advance customers must order for pickup</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Latitude</label>
              <input type="number" step="any" value={lat} onChange={e => setLat(e.target.value)} placeholder="e.g. 3.1390" />
            </div>
            <div>
              <label style={labelStyle}>Longitude</label>
              <input type="number" step="any" value={lng} onChange={e => setLng(e.target.value)} placeholder="e.g. 101.6869" />
            </div>
            <div>
              <label style={labelStyle}>Delivery Radius (km)</label>
              <input type="number" step="any" value={deliveryRadius} onChange={e => setDeliveryRadius(e.target.value)} placeholder="e.g. 5.0" />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Image URL</label>
            <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Opening Hours (JSON)</label>
            <textarea value={openingHours} onChange={e => setOpeningHours(e.target.value)} rows={3} placeholder={'{\n  "mon": "08:00-22:00",\n  "tue": "08:00-22:00"\n}'} style={{ outline: 'none', border: `1px solid ${THEME.accentLight}`, borderRadius: 12, padding: '8px 14px', fontSize: 14, width: '100%', fontFamily: 'monospace' }} />
            <div style={hintStyle}>JSON object with day keys, e.g. {"{"}"mon": "08:00-22:00"{"}"}. Leave empty to clear.</div>
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
