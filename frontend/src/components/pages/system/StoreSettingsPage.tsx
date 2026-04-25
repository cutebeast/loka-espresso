'use client';

import { useState, FormEvent } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import type { MerchantStore } from '@/lib/merchant-types';
import { THEME } from '@/lib/theme';

// Opening hours day config
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_LABELS: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

interface DayHours {
  enabled: boolean;
  open: string;
  close: string;
}

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
    onChange({
      ...value,
      [key]: { ...value[key], [field]: val },
    });
  }


  return (
    <div className="ohe-0">
      {DAY_KEYS.map(key => (
        <div key={key} className="ohe-1">
          <label className="ohe-2">
            <input
              type="checkbox"
              checked={value[key]?.enabled || false}
              onChange={e => updateDay(key, 'enabled', e.target.checked)}
              className="ohe-3"
            />
            {DAY_LABELS[key]}
          </label>
          <input
            type="time"
            value={value[key]?.open || '09:00'}
            onChange={e => updateDay(key, 'open', e.target.value)}
            disabled={!value[key]?.enabled}
            className={`ss-input ${value[key]?.enabled ? 'opacity-1' : 'opacity-0-4'}`}
          />
          <span className="ohe-4">to</span>
          <input
            type="time"
            value={value[key]?.close || '22:00'}
            onChange={e => updateDay(key, 'close', e.target.value)}
            disabled={!value[key]?.enabled}
            className={`ss-input ${value[key]?.enabled ? 'opacity-1' : 'opacity-0-4'}`}
          />
        </div>
      ))}
    </div>
  );
}

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
        const res = await apiFetch(`/admin/stores/${s.id}`, undefined, { method: 'DELETE' });
        if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.detail || 'Failed to deactivate'); return; }
      } else {
        const res = await apiFetch(`/admin/stores/${s.id}/toggle`, undefined, { method: 'PATCH' });
        if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.detail || 'Failed to reactivate'); return; }
      }
      onRefresh();
    } catch { setError('Network error'); }
  }

  return (
    <div>
      <div className="ssp-5">
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}><i className="fas fa-plus"></i> Add Store</button>
      </div>

      {error && (
        <div className="ssp-6">
          <i className="fas fa-exclamation-circle"></i> {error}
        </div>
      )}

      <div className="ssp-7">
        {stores.map(s => (
          <div key={s.id} className={`card ss-store-card ${s.is_active ? 'opacity-1' : 'opacity-0-6'}`}>
            <div className="ssp-8">
              <div>
                <div className="ssp-9">{s.name} {!s.is_active && <span className="ssp-10">(Inactive)</span>}</div>
                <div className="ssp-11">{s.address}</div>
                <div className="ssp-12">
                  Slug: <code>{s.slug}</code> · Phone: {s.phone || '-'} · Pickup lead: {s.pickup_lead_minutes || '-'} min
                </div>
                <div className="ssp-13">
                  <span className={`ss-badge ${s.pos_integration_enabled ? 'ss-badge-green' : 'ss-badge-yellow'}`}>
                  
                    POS: {s.pos_integration_enabled ? 'API' : 'Manual'}
                  </span>
                  <span className={`ss-badge ${s.delivery_integration_enabled ? 'ss-badge-green' : 'ss-badge-yellow'}`}>
                  
                    Delivery: {s.delivery_integration_enabled ? 'API' : 'Manual'}
                  </span>
                </div>
              </div>
              <div className="ssp-14">
                <button className="btn btn-sm" onClick={() => setEditingStore(s)}><i className="fas fa-edit"></i> Edit</button>
                {s.id === 0 ? (
                  <span className="ssp-15">Main Store — Cannot deactivate</span>
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

function AddStoreForm({ token: _token, onClose }: { token: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [pickupLead, setPickupLead] = useState('15');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [deliveryRadius, setDeliveryRadius] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [posIntegration, setPosIntegration] = useState(false);
  const [deliveryIntegration, setDeliveryIntegration] = useState(false);
  const [openingHours, setOpeningHours] = useState<OpeningHoursState>(parseOpeningHours(null));
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
      payload.pos_integration_enabled = posIntegration;
      payload.delivery_integration_enabled = deliveryIntegration;
      const ohJSON = openingHoursToJSON(openingHours);
      if (ohJSON) payload.opening_hours = ohJSON;
      await apiFetch('/admin/stores', undefined, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      onClose();
    } catch {} finally { setSaving(false); }
  }

  return (
    <div>
      <div className="asf-16">
        <button className="btn btn-sm" onClick={onClose}><i className="fas fa-arrow-left"></i> Back</button>
      </div>
      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="asf-17">
            <label className="asf-18">Store Name *</label>
            <input value={name} onChange={e => { setName(e.target.value); if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-')); }} required placeholder="e.g. ZUS Coffee Bangsar" />
          </div>
          <div className="asf-19">
            <label className="asf-20">Slug *</label>
            <input value={slug} onChange={e => setSlug(e.target.value)} required placeholder="e.g. zus-bangsar" />
          </div>
          <div className="asf-21">
            <label className="asf-22">Address</label>
            <textarea value={address} onChange={e => setAddress(e.target.value)} rows={2} className="asf-23" />
          </div>
          <div className="asf-24">
            <div>
              <label className="asf-25">Phone</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+60 3-XXXX XXXX" />
            </div>
            <div>
              <label className="asf-26">Pickup Lead Time (min)</label>
              <input type="number" value={pickupLead} onChange={e => setPickupLead(e.target.value)} min={0} />
            </div>
          </div>
          <div className="asf-27">
            <div>
              <label className="asf-28">Latitude</label>
              <input type="number" step="any" value={lat} onChange={e => setLat(e.target.value)} placeholder="e.g. 3.1390" />
            </div>
            <div>
              <label className="asf-29">Longitude</label>
              <input type="number" step="any" value={lng} onChange={e => setLng(e.target.value)} placeholder="e.g. 101.6869" />
            </div>
            <div>
              <label className="asf-30">Delivery Radius (km)</label>
              <input type="number" step="any" value={deliveryRadius} onChange={e => setDeliveryRadius(e.target.value)} placeholder="e.g. 5.0" />
            </div>
          </div>
          <div className="asf-31">
            <label className="asf-32">Image URL</label>
            <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div className="asf-33">
            <label className="asf-34">Integrations</label>
            <div className="asf-35">
              <label className="asf-36">
                <input type="checkbox" checked={posIntegration} onChange={e => setPosIntegration(e.target.checked)} className="asf-37" />
                <span>POS API Integration</span>
                <span className="asf-38">— Auto-sync orders to POS/KDS</span>
              </label>
              <label className="asf-39">
                <input type="checkbox" checked={deliveryIntegration} onChange={e => setDeliveryIntegration(e.target.checked)} className="asf-40" />
                <span>Delivery API Integration</span>
                <span className="asf-41">— Auto-dispatch to Grab/Lalamove/etc</span>
              </label>
              <div className="asf-42">
                <i className="fas fa-info-circle"></i> When disabled, staff must manually sync orders. Default is Manual (recommended for launch).
              </div>
            </div>
          </div>
          <div className="asf-43">
            <label className="asf-44">Opening Hours</label>
            <OpeningHoursEditor value={openingHours} onChange={setOpeningHours} />
          </div>
          <div className="asf-45">
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Creating...' : 'Create Store'}</button>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Edit Store Form ---
function EditStoreForm({ store, token: _token, onClose }: { store: MerchantStore; token: string; onClose: () => void }) {
  const [name, setName] = useState(store.name);
  const [address, setAddress] = useState(store.address || '');
  const [phone, setPhone] = useState(store.phone || '');
  const [pickupLead, setPickupLead] = useState(String(store.pickup_lead_minutes || 15));
  const [lat, setLat] = useState(store.lat != null ? String(store.lat) : '');
  const [lng, setLng] = useState(store.lng != null ? String(store.lng) : '');
  const [deliveryRadius, setDeliveryRadius] = useState(store.delivery_radius_km != null ? String(store.delivery_radius_km) : '');
  const [imageUrl, setImageUrl] = useState(store.image_url || '');
  const [posIntegration, setPosIntegration] = useState(store.pos_integration_enabled || false);
  const [deliveryIntegration, setDeliveryIntegration] = useState(store.delivery_integration_enabled || false);
  const [openingHours, setOpeningHours] = useState<OpeningHoursState>(parseOpeningHours(store.opening_hours));
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
      payload.pos_integration_enabled = posIntegration;
      payload.delivery_integration_enabled = deliveryIntegration;
      const ohJSON = openingHoursToJSON(openingHours);
      if (ohJSON) payload.opening_hours = ohJSON;
      const res = await apiFetch(`/admin/stores/${store.id}`, undefined, {
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
      <div className="esf-46">
        <h3>Edit: {store.name}</h3>
        <button className="btn btn-sm" onClick={onClose}><i className="fas fa-arrow-left"></i> Back</button>
      </div>
      <div className="card">
        {error && (
          <div className="esf-47">
            <i className="fas fa-exclamation-circle"></i> {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="esf-48">
            <label style={labelStyle}>Store Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="esf-49">
            <label style={labelStyle}>Slug</label>
            <input value={store.slug} disabled className="esf-50" />
            <div style={hintStyle}>Slug cannot be changed after creation</div>
          </div>
          <div className="esf-51">
            <label style={labelStyle}>Address</label>
            <textarea value={address} onChange={e => setAddress(e.target.value)} rows={2} className="esf-52" />
          </div>
          <div className="esf-53">
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
          <div className="esf-54">
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
          <div className="esf-55">
            <label style={labelStyle}>Image URL</label>
            <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div className="esf-56">
            <label style={labelStyle}>Integrations</label>
            <div className="esf-57">
              <label className="esf-58">
                <input type="checkbox" checked={posIntegration} onChange={e => setPosIntegration(e.target.checked)} className="esf-59" />
                <span>POS API Integration</span>
                <span className="esf-60">— Auto-sync orders to POS/KDS</span>
              </label>
              <label className="esf-61">
                <input type="checkbox" checked={deliveryIntegration} onChange={e => setDeliveryIntegration(e.target.checked)} className="esf-62" />
                <span>Delivery API Integration</span>
                <span className="esf-63">— Auto-dispatch to Grab/Lalamove/etc</span>
              </label>
              <div className="esf-64">
                <i className="fas fa-info-circle"></i> When disabled, staff must manually sync orders. Default is Manual (recommended for launch).
              </div>
            </div>
          </div>
          <div className="esf-65">
            <label style={labelStyle}>Opening Hours</label>
            <OpeningHoursEditor value={openingHours} onChange={setOpeningHours} />
          </div>
          <div className="esf-66">
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
