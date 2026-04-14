'use client';

import { useState, FormEvent, useRef } from 'react';
import { apiFetch, formatRM } from '@/lib/merchant-api';

interface VouchersPageProps {
  vouchers: any[];
  token: string;
  onRefresh: () => void;
}

interface VoucherForm {
  code: string;
  title: string;
  short_description: string;
  long_description: string;
  discount_type: string;
  discount_value: string;
  min_order: string;
  max_uses: string;
  max_uses_per_user: string;
  validity_days: string;
  valid_from: string;
  valid_until: string;
  promo_type: string;
  is_active: boolean;
  image_url: string;
  terms: string;
  how_to_redeem: string;
}

const emptyForm: VoucherForm = {
  code: '',
  title: '',
  short_description: '',
  long_description: '',
  discount_type: 'percent',
  discount_value: '',
  min_order: '0',
  max_uses: '',
  max_uses_per_user: '1',
  validity_days: '30',
  valid_from: '',
  valid_until: '',
  promo_type: 'generic',
  is_active: true,
  image_url: '',
  terms: '',
  how_to_redeem: '',
};

export default function VouchersPage({ vouchers, token, onRefresh }: VouchersPageProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<any | null>(null);
  const [form, setForm] = useState<VoucherForm>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  function openCreate() {
    setForm({ ...emptyForm });
    setError('');
    setEditingVoucher(null);
    setShowForm(true);
  }

  function openEdit(v: any) {
    setForm({
      code: v.code || '',
      title: v.title || '',
      short_description: v.short_description || '',
      long_description: v.long_description || '',
      discount_type: v.discount_type || 'percent',
      discount_value: v.discount_value != null ? String(v.discount_value) : '',
      min_order: v.min_order != null ? String(v.min_order) : '0',
      max_uses: v.max_uses != null ? String(v.max_uses) : '',
      max_uses_per_user: v.max_uses_per_user != null ? String(v.max_uses_per_user) : '1',
      validity_days: v.validity_days != null ? String(v.validity_days) : '30',
      valid_from: v.valid_from ? v.valid_from.slice(0, 16) : '',
      valid_until: v.valid_until ? v.valid_until.slice(0, 16) : '',
      promo_type: v.promo_type || 'generic',
      is_active: v.is_active !== false,
      image_url: v.image_url || '',
      terms: Array.isArray(v.terms) ? v.terms.join('\n') : '',
      how_to_redeem: v.how_to_redeem || '',
    });
    setError('');
    setEditingVoucher(v);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingVoucher(null);
    setError('');
    onRefresh();
  }

  function buildPayload() {
    const payload: Record<string, any> = {
      code: form.code.toUpperCase().trim(),
      title: form.title.trim(),
      short_description: form.short_description.trim(),
      long_description: form.long_description.trim(),
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value),
      min_order: Number(form.min_order) || 0,
      valid_from: form.valid_from || null,
      valid_until: form.valid_until || null,
      promo_type: form.promo_type,
      is_active: form.is_active,
      image_url: form.image_url || null,
      terms: form.terms.split('\n').map((t: string) => t.trim()).filter(Boolean),
      how_to_redeem: form.how_to_redeem.trim(),
    };
    if (form.max_uses.trim() !== '') {
      payload.max_uses = Number(form.max_uses);
    } else {
      payload.max_uses = null;
    }
    if (form.max_uses_per_user.trim() !== '') {
      payload.max_uses_per_user = Number(form.max_uses_per_user);
    } else {
      payload.max_uses_per_user = null;
    }
    if (form.validity_days.trim() !== '') {
      payload.validity_days = Number(form.validity_days);
    } else {
      payload.validity_days = 30;
    }
    return payload;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const url = editingVoucher
        ? `/admin/vouchers/${editingVoucher.id}`
        : '/admin/vouchers';
      const method = editingVoucher ? 'PUT' : 'POST';
      const res = await apiFetch(url, token, {
        method,
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || `Failed (${res.status})`);
        return;
      }
      closeForm();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      const res = await apiFetch(`/admin/vouchers/${id}`, token, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || `Delete failed (${res.status})`);
        return;
      }
      setConfirmDelete(null);
      onRefresh();
    } catch {
      setError('Network error');
    }
  }

  async function toggleActive(v: any) {
    try {
      const res = await apiFetch(`/admin/vouchers/${v.id}`, token, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !v.is_active }),
      });
      if (res.ok) onRefresh();
    } catch {}
  }

  function renderDiscount(v: any) {
    if (v.discount_type === 'percent') return `${v.discount_value}% off`;
    return `${formatRM(v.discount_value)} off`;
  }

  function renderUsage(v: any) {
    const used = v.used_count ?? v.times_used ?? 0;
    return v.max_uses != null ? `${used}/${v.max_uses}` : `${used}/∞`;
  }

  function updateField<K extends keyof VoucherForm>(key: K, value: VoucherForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0 }}>Vouchers</h3>
        <button className="btn btn-primary" onClick={openCreate}><i className="fas fa-plus"></i> New Voucher</button>
      </div>

      {error && !showForm && (
        <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          <i className="fas fa-exclamation-circle"></i> {error}
        </div>
      )}

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h4 style={{ margin: 0 }}>{editingVoucher ? 'Edit Voucher' : 'New Voucher'}</h4>
            <button className="btn btn-sm" onClick={() => { setShowForm(false); setEditingVoucher(null); setError(''); }}><i className="fas fa-times"></i></button>
          </div>

          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
                <i className="fas fa-exclamation-circle"></i> {error}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Title *</label>
                <input value={form.title} onChange={e => updateField('title', e.target.value)} placeholder="e.g. Summer Sale" required />
              </div>
              <div>
                <label style={labelStyle}>Code *</label>
                <input
                  value={form.code}
                  onChange={e => updateField('code', e.target.value.toUpperCase())}
                  placeholder="e.g. SUMMER2026"
                  style={{ textTransform: 'uppercase' }}
                  required
                />
                <div style={hintStyle}>Unique catalog code. Customers receive a per-instance code (e.g. SUMMER2026-A3F2B1)</div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Short Description</label>
                <textarea value={form.short_description} onChange={e => updateField('short_description', e.target.value)} placeholder="Brief summary shown on listing card (max ~80 chars)..." rows={2} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Detail Description</label>
                <textarea value={form.long_description} onChange={e => updateField('long_description', e.target.value)} placeholder="Full content shown when customer taps to view details..." rows={4} />
              </div>
              <div>
                <label style={labelStyle}>Discount Type *</label>
                <select value={form.discount_type} onChange={e => updateField('discount_type', e.target.value)}>
                  <option value="percent">Percentage (%)</option>
                  <option value="fixed">Fixed Amount (RM)</option>
                  <option value="free_item">Free Item</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Discount Value *</label>
                <input type="number" min="0" step="0.01" value={form.discount_value} onChange={e => updateField('discount_value', e.target.value)} placeholder="0" required />
                <div style={hintStyle}>{form.discount_type === 'percent' ? 'Percentage off (e.g. 10 = 10% off)' : form.discount_type === 'fixed' ? 'Fixed amount in RM (e.g. 5 = RM5 off)' : 'Price of the free item in RM (for display only)'}</div>
              </div>
              <div>
                <label style={labelStyle}>Min Order (RM) <span style={{ color: '#94A3B8', fontWeight: 400 }}>(0 = no minimum)</span></label>
                <input type="number" min="0" step="0.01" value={form.min_order} onChange={e => updateField('min_order', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Max Uses <span style={{ color: '#94A3B8', fontWeight: 400 }}>(blank = unlimited)</span></label>
                <input type="number" min="1" value={form.max_uses} onChange={e => updateField('max_uses', e.target.value)} placeholder="Blank = unlimited" />
                <div style={hintStyle}>Total claims across all customers. Leave blank for unlimited.</div>
              </div>
              <div>
                <label style={labelStyle}>Max Per User <span style={{ color: '#94A3B8', fontWeight: 400 }}>(blank = unlimited)</span></label>
                <input type="number" min="1" value={form.max_uses_per_user} onChange={e => updateField('max_uses_per_user', e.target.value)} placeholder="1" />
                <div style={hintStyle}>How many times each customer can claim this voucher. Default: 1</div>
              </div>
              <div>
                <label style={labelStyle}>Validity Days <span style={{ color: '#94A3B8', fontWeight: 400 }}>(after claim)</span></label>
                <input type="number" min="1" value={form.validity_days} onChange={e => updateField('validity_days', e.target.value)} placeholder="30" />
                <div style={hintStyle}>How many days the voucher instance is usable after customer claims it. Default: 30</div>
              </div>
              <div>
                <label style={labelStyle}>Valid From <span style={{ color: '#94A3B8', fontWeight: 400 }}>(blank = always)</span></label>
                <input type="datetime-local" value={form.valid_from} onChange={e => updateField('valid_from', e.target.value)} />
                <div style={hintStyle}>When this voucher becomes claimable. Leave blank for always available.</div>
              </div>
              <div>
                <label style={labelStyle}>Valid Until <span style={{ color: '#94A3B8', fontWeight: 400 }}>(blank = unlimited)</span></label>
                <input type="datetime-local" value={form.valid_until} onChange={e => updateField('valid_until', e.target.value)} />
                <div style={hintStyle}>When this voucher expires from catalog. Leave blank for no expiry.</div>
              </div>
              <div>
                <label style={labelStyle}>Promo Type</label>
                <select value={form.promo_type} onChange={e => updateField('promo_type', e.target.value)}>
                  <option value="generic">Generic</option>
                  <option value="bogo">Buy One Get One</option>
                  <option value="happy_hour">Happy Hour</option>
                  <option value="seasonal">Seasonal</option>
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Terms &amp; Conditions <span style={{ color: '#94A3B8', fontWeight: 400 }}>(optional)</span></label>
                <textarea value={form.terms} onChange={e => updateField('terms', e.target.value)} placeholder="One per line. e.g. One per customer per day" rows={3} />
                <div style={hintStyle}>One term per line. Shown on voucher detail page in customer app.</div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>How to Redeem <span style={{ color: '#94A3B8', fontWeight: 400 }}>(optional)</span></label>
                <input value={form.how_to_redeem} onChange={e => updateField('how_to_redeem', e.target.value)} placeholder="e.g. Show this screen at checkout" />
              </div>
              <VoucherImageUpload imageUrl={form.image_url} token={token} onSet={(url) => updateField('image_url', url)} />
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : editingVoucher ? 'Update' : 'Create'}
              </button>
              <button type="button" className="btn" onClick={() => { setShowForm(false); setEditingVoucher(null); setError(''); }}>
                Cancel
              </button>
              <div style={{ flex: 1 }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                <input type="checkbox" checked={form.is_active} onChange={e => updateField('is_active', e.target.checked)} style={{ width: 16, height: 16 }} />
                Active
              </label>
            </div>
          </form>
        </div>
      )}

      <div style={{ overflowX: 'auto', borderRadius: 20, background: 'white', border: '1px solid #ECF1F7' }}>
        <table>
          <thead>
            <tr>
              <th>Image</th>
              <th>Code</th>
              <th>Title</th>
              <th>Discount</th>
              <th>Used/Max</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94A3B8', padding: 40 }}>
                <i className="fas fa-ticket-alt" style={{ fontSize: 40, display: 'block', marginBottom: 12 }}></i>
                No vouchers yet. Create one to get started.
              </td></tr>
            ) : vouchers.map(v => (
              <tr key={v.id}>
                <td>
                  {v.image_url ? (
                    <img src={v.image_url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} />
                  ) : (
                    <div style={{ width: 40, height: 40, background: '#F1F5F9', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 14 }}>
                      <i className="fas fa-ticket"></i>
                    </div>
                  )}
                </td>
                <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{v.code}</td>
                <td>
                  <div style={{ fontWeight: 600 }}>{v.title || '-'}</div>
                  {v.short_description && <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{v.short_description}</div>}
                </td>
                <td>{renderDiscount(v)}</td>
                <td>{renderUsage(v)}</td>
                <td>
                  <button className="btn btn-sm" onClick={() => toggleActive(v)} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}>
                    <span className={`badge ${v.is_active ? 'badge-green' : 'badge-gray'}`}>
                      {v.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </button>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm" onClick={() => openEdit(v)} title="Edit">
                      <i className="fas fa-edit"></i>
                    </button>
                    {confirmDelete === v.id ? (
                      <>
                        <button className="btn btn-sm" style={{ background: '#EF4444', color: 'white' }} onClick={() => handleDelete(v.id)}>
                          Confirm
                        </button>
                        <button className="btn btn-sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
                      </>
                    ) : (
                      <button className="btn btn-sm" style={{ color: '#EF4444' }} onClick={() => setConfirmDelete(v.id)} title="Delete">
                        <i className="fas fa-trash"></i>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VoucherImageUpload({ imageUrl, token, onSet }: { imageUrl: string; token: string; onSet: (url: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/v1/upload/marketing-image', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.ok) {
        const data = await res.json();
        onSet(data.url);
      }
    } catch {} finally { setUploading(false); }
  }

  return (
    <div>
      <label style={labelStyle}>Image</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <input type="file" ref={fileRef} accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />
        <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading...' : 'Upload Image'}
        </button>
        {imageUrl && (
          <>
            <img src={imageUrl} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6 }} />
            <button type="button" className="btn btn-sm" onClick={() => onSet('')} style={{ color: '#EF4444' }}><i className="fas fa-times"></i></button>
          </>
        )}
      </div>
      <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
        <i className="fas fa-info-circle" style={{ marginRight: 4 }}></i>
        Recommended: <strong>720 × 405 px (16:9)</strong> · WebP/PNG · Max 200 KB
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: '#334155' };
const hintStyle: React.CSSProperties = { fontSize: 11, color: '#94A3B8', marginTop: 2 };
