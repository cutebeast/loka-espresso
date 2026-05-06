'use client';

import { useState } from 'react';
import { apiFetch, apiUpload } from '@/lib/merchant-api';
import type { MerchantStore } from '@/lib/merchant-types';
import { Drawer } from '@/components/ui';
import { useToastStore } from '@/stores/toastStore';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_LABELS: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

interface DayHours { enabled: boolean; open: string; close: string; }
type OpeningHoursState = Record<string, DayHours>;

function parseOpeningHours(raw: Record<string, string> | null | undefined): OpeningHoursState {
  const state: OpeningHoursState = {};
  for (const key of DAY_KEYS) {
    const val = raw?.[key];
    if (val && typeof val === 'string') {
      const parts = val.split('-');
      state[key] = { enabled: true, open: parts[0] || '09:00', close: parts[1] || '22:00' };
    } else {
      state[key] = { enabled: false, open: '09:00', close: '22:00' };
    }
  }
  return state;
}

function openingHoursToJSON(state: OpeningHoursState): Record<string, string> | null {
  const result: Record<string, string> = {};
  let hasAny = false;
  for (const key of DAY_KEYS) {
    if (state[key]?.enabled) {
      result[key] = `${state[key].open}-${state[key].close}`;
      hasAny = true;
    }
  }
  return hasAny ? result : null;
}

function OpeningHoursEditor({ value, onChange }: { value: OpeningHoursState; onChange: (v: OpeningHoursState) => void }) {
  function updateDay(key: string, field: keyof DayHours, val: boolean | string) {
    onChange({ ...value, [key]: { ...value[key], [field]: val } });
  }
  return (
    <div>
      {DAY_KEYS.map(key => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 100, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={value[key]?.enabled || false} onChange={e => updateDay(key, 'enabled', e.target.checked)} style={{ width: 16, height: 16 }} />
            {DAY_LABELS[key]}
          </label>
          <input type="time" value={value[key]?.open || '09:00'} onChange={e => updateDay(key, 'open', e.target.value)} disabled={!value[key]?.enabled} style={{ opacity: value[key]?.enabled ? 1 : 0.4 }} />
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>to</span>
          <input type="time" value={value[key]?.close || '22:00'} onChange={e => updateDay(key, 'close', e.target.value)} disabled={!value[key]?.enabled} style={{ opacity: value[key]?.enabled ? 1 : 0.4 }} />
        </div>
      ))}
    </div>
  );
}

interface StoreSettingsPageProps { stores: MerchantStore[]; onRefresh: () => void; }

export default function StoreSettingsPage({ stores, onRefresh }: StoreSettingsPageProps) {
  const [drawerMode, setDrawerMode] = useState<'add' | 'edit' | null>(null);
  const [editingStore, setEditingStore] = useState<MerchantStore | null>(null);
  const [error, setError] = useState('');

  function openEdit(store: MerchantStore) { setEditingStore(store); setDrawerMode('edit'); }
  function closeDrawer() { setDrawerMode(null); setEditingStore(null); onRefresh(); }

  async function toggleStore(s: MerchantStore) {
    setError('');
    const action = s.is_active ? 'deactivate' : 'reactivate';
    if (!confirm(`Are you sure you want to ${action} "${s.name}"?`)) return;
    try {
      if (s.is_active) {
        const res = await apiFetch(`/admin/stores/${s.id}`, undefined, { method: 'DELETE' });
        if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.detail || 'Failed to deactivate'); return; }
      } else {
        const res = await apiFetch(`/admin/stores/${s.id}/toggle`, undefined, { method: 'PATCH' });
        if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.detail || 'Failed to reactivate'); return; }
      }
      onRefresh();
    } catch { console.error('Failed to toggle store'); setError('Network error'); }
  }

  return (
    <div>
      <Drawer isOpen={drawerMode === 'add'} onClose={closeDrawer} title="New Store">
        <StoreForm onClose={closeDrawer} />
      </Drawer>
      <Drawer isOpen={drawerMode === 'edit' && !!editingStore} onClose={closeDrawer} title={editingStore ? `Edit: ${editingStore.name}` : 'Edit Store'}>
        {editingStore && <StoreForm existingStore={editingStore} onClose={closeDrawer} />}
      </Drawer>

      <div className="ssp-5">
        <button className="btn btn-primary" onClick={() => setDrawerMode('add')}><i className="fas fa-plus"></i> Add Store</button>
      </div>

      {error && <div className="cdp-error"><i className="fas fa-exclamation-circle"></i> {error}</div>}

      <div className="ssp-7">
        {stores.map(s => (
          <div key={s.id} className={`card ss-store-card ${s.is_active ? 'opacity-1' : 'opacity-0-6'}`}>
            <div className="ssp-8">
              <div>
                <div className="ssp-9">{s.name} {!s.is_active && <span className="ssp-10">(Inactive)</span>}</div>
                {s.id === 0 ? (
                  <div className="ssp-11" style={{ color: '#6B7280', fontStyle: 'italic' }}>Headquarters — global settings only</div>
                ) : (
                  <>
                  <div className="ssp-11">{s.address}</div>
                  <div className="ssp-12">Slug: <code>{s.slug}</code> · Phone: {s.phone || '-'} · Pickup lead: {s.pickup_lead_minutes || '-'} min</div>
                  </>
                )}
              </div>
              <div className="ssp-14">
                <button className="btn btn-sm" onClick={() => openEdit(s)}><i className="fas fa-edit"></i> {s.id === 0 ? 'Edit Name' : 'Edit'}</button>
                {s.id === 0 ? (
                  <span className="ssp-15">Main Store</span>
                ) : (
                  <button className={`btn btn-sm ${s.is_active ? '' : 'btn-primary'}`} style={s.is_active ? { color: '#EF4444' } : {}} onClick={() => toggleStore(s)}>
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

// ── Shared Store Form ──
function StoreForm({ onClose, existingStore }: { onClose: () => void; existingStore?: MerchantStore }) {
  const isEdit = !!existingStore;
  const isHQ = existingStore?.id === 0;
  const [name, setName] = useState(existingStore?.name || '');
  const [slug, setSlug] = useState(existingStore?.slug || '');
  const [address, setAddress] = useState(existingStore?.address || '');
  const [phone, setPhone] = useState(existingStore?.phone || '');
  const [pickupLead, setPickupLead] = useState(String(existingStore?.pickup_lead_minutes ?? '15'));
  const [lat, setLat] = useState(existingStore?.lat != null ? String(existingStore.lat) : '');
  const [lng, setLng] = useState(existingStore?.lng != null ? String(existingStore.lng) : '');
  const [deliveryRadius, setDeliveryRadius] = useState(existingStore?.delivery_radius_km != null ? String(existingStore.delivery_radius_km) : '');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [openingHours, setOpeningHours] = useState<OpeningHoursState>(parseOpeningHours(existingStore?.opening_hours));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const existingImageUrl = existingStore?.image_url || '';

  async function handleSubmit() {
    setSaving(true); setError('');
    try {
      let uploadedUrl = existingImageUrl;
      if (imageFile) {
        const fd = new FormData();
        fd.append('file', imageFile);
        const uploadRes = await apiUpload('/upload/store-image', fd);
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          uploadedUrl = uploadData.url || uploadData.image_url || '';
        }
      }
      const payload: Record<string, unknown> = { name };
      if (isHQ) {
        // HQ only has name — no physical store data
      } else {
        payload.address = address;
        payload.phone = phone;
        payload.pickup_lead_minutes = parseInt(pickupLead) || 15;
        if (lat) { const latNum = parseFloat(lat); if (!isNaN(latNum)) payload.lat = latNum; }
        if (lng) { const lngNum = parseFloat(lng); if (!isNaN(lngNum)) payload.lng = lngNum; }
        if (deliveryRadius) { const radiusNum = parseFloat(deliveryRadius); if (!isNaN(radiusNum)) payload.delivery_radius_km = radiusNum; }
        if (uploadedUrl) payload.image_url = uploadedUrl;
        const ohJSON = openingHoursToJSON(openingHours);
        if (ohJSON) payload.opening_hours = ohJSON;
      }
      if (!isEdit) payload.slug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const url = isEdit ? `/admin/stores/${existingStore!.id}` : '/admin/stores';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await apiFetch(url, undefined, { method, body: JSON.stringify(payload) });
      if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.detail || `Failed (${res.status})`); return; }
      useToastStore.getState().showToast('Store saved');
      onClose();
    } catch { console.error('Failed to save store'); setError('Network error'); } finally { setSaving(false); }
  }

  return (
    <>
      {error && <div className="cdp-error"><i className="fas fa-exclamation-circle"></i> {error}</div>}

      <div className="df-section">
        <div className="df-grid-2-wide-short">
          <div className="df-field">
            <label className="df-label">Store Name *</label>
            <input value={name} onChange={e => { setName(e.target.value); if (!isEdit && !slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-')); }} required placeholder="e.g. ZUS Coffee Bangsar" />
          </div>
          <div className="df-field">
            <label className="df-label">Slug *</label>
            {isEdit ? (
              <input value={existingStore!.slug} disabled style={{ opacity: 0.6 }} />
            ) : (
              <input value={slug} onChange={e => setSlug(e.target.value)} required placeholder="auto-generated" />
            )}
            {isEdit && <div className="df-hint">Slug cannot be changed after creation</div>}
          </div>
        </div>
        {!isHQ && (
        <>
        <div className="df-field" style={{ marginBottom: 16 }}>
          <label className="df-label">Address</label>
          <textarea value={address} onChange={e => setAddress(e.target.value)} rows={2} placeholder="Full store address" />
        </div>
        <div className="df-grid">
          <div className="df-field">
            <label className="df-label">Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+60 3-XXXX XXXX" />
          </div>
          <div className="df-field">
            <label className="df-label">Pickup Lead Time (min)</label>
            <input type="number" value={pickupLead} onChange={e => setPickupLead(e.target.value)} min={0} />
            <div className="df-hint">How far in advance customers must order</div>
          </div>
        </div>
        <div className="df-grid-3">
          <div className="df-field">
            <label className="df-label">Latitude</label>
            <input type="number" step="any" value={lat} onChange={e => setLat(e.target.value)} placeholder="3.1390" />
          </div>
          <div className="df-field">
            <label className="df-label">Longitude</label>
            <input type="number" step="any" value={lng} onChange={e => setLng(e.target.value)} placeholder="101.6869" />
          </div>
          <div className="df-field">
            <label className="df-label">Delivery Radius (km)</label>
            <input type="number" step="any" value={deliveryRadius} onChange={e => setDeliveryRadius(e.target.value)} placeholder="5.0" />
          </div>
        </div>
        <div className="df-field" style={{ marginBottom: 16 }}>
          <label className="df-label">Store Image</label>
          <input type="file" accept="image/*" onChange={e => setImageFile(e.target.files?.[0] || null)} />
          {existingStore?.image_url && !imageFile && (
            <div className="df-hint"><i className="fas fa-image" style={{ marginRight: 4 }}></i> Current: {existingStore.image_url.split('/').pop()}</div>
          )}
          {!existingStore?.image_url && <div className="df-hint">Upload a store photo</div>}
        </div>
        </>
        )}
      </div>

      {!isHQ && (
      <div className="df-section">
        <h4 className="cdp-section-title"><i className="fas fa-clock" style={{ marginRight: 8 }}></i>Opening Hours</h4>
        <OpeningHoursEditor value={openingHours} onChange={setOpeningHours} />
      </div>
      )}

      <div className="df-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving...' : isEdit ? 'Update Store' : 'Create Store'}
        </button>
      </div>
    </>
  );
}
