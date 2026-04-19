'use client';

import { useState, useEffect, useCallback, FormEvent, useRef } from 'react';
import { apiFetch, formatRM } from '@/lib/merchant-api';
import { THEME } from '@/lib/theme';
import { Select, Pagination, Drawer } from '@/components/ui';

interface VouchersPageProps {
  token: string;
}

interface VoucherForm {
  code: string;
  title: string;
  short_description: string;
  long_description: string;
  discount_type: string;
  discount_value: string;
  min_spend: string;
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
  code: '', title: '', short_description: '', long_description: '',
  discount_type: 'percent', discount_value: '', min_spend: '0',
  max_uses: '', max_uses_per_user: '1', validity_days: '30',
  valid_from: '', valid_until: '', promo_type: 'generic',
  is_active: true, image_url: '', terms: '', how_to_redeem: '',
};

const PAGE_SIZE = 20;

export default function VouchersPage({ token }: VouchersPageProps) {
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [error, setError] = useState('');

  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  const [editingVoucher, setEditingVoucher] = useState<any | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchVouchers = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), page_size: String(PAGE_SIZE) });
      const res = await apiFetch(`/admin/vouchers?${params}`, token);
      if (res.ok) {
        const data = await res.json();
        setVouchers(data.vouchers || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
        setPage(p);
      }
    } catch {} finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchVouchers(1); }, [fetchVouchers]);

  function openCreate() {
    setEditingVoucher(null);
    setViewMode('form');
    setDrawerOpen(true);
  }

  function openEdit(v: any) {
    setEditingVoucher(v);
    setViewMode('form');
    setDrawerOpen(true);
  }

  function closeForm() {
    setDrawerOpen(false);
    setViewMode('list');
    setEditingVoucher(null);
    fetchVouchers(page);
  }

  async function toggleActive(v: any) {
    try {
      await apiFetch(`/admin/vouchers/${v.id}`, token, { method: 'PUT', body: JSON.stringify({ is_active: !v.is_active }) });
      fetchVouchers(page);
    } catch {}
  }

  async function handleDelete(id: number) {
    try {
      await apiFetch(`/admin/vouchers/${id}`, token, { method: 'DELETE' });
      setConfirmDelete(null);
      fetchVouchers(page);
    } catch {}
  }

  function renderDiscount(v: any) {
    if (v.discount_type === 'percent') return `${v.discount_value}% off`;
    if (v.discount_type === 'free_item') return `Free item (up to ${formatRM(v.discount_value)})`;
    return `${formatRM(v.discount_value)} off`;
  }

  function renderUsage(v: any) {
    const used = v.used_count ?? v.times_used ?? 0;
    return v.max_uses != null ? `${used}/${v.max_uses}` : `${used}/∞`;
  }

  const drawerTitle = editingVoucher ? 'Edit Voucher' : 'New Voucher';

  return (
    <div>
      <Drawer isOpen={drawerOpen} onClose={closeForm} title={drawerTitle} width={560}>
        {viewMode === 'form' && (
          <VoucherFormPage token={token} existingVoucher={editingVoucher} onBack={closeForm} />
        )}
      </Drawer>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 20 }}>
        <button className="btn btn-primary" onClick={openCreate}><i className="fas fa-plus"></i> New Voucher</button>
      </div>

      {error && (
        <div style={{ background: '#FEE2E2', color: '#A83232', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          <i className="fas fa-exclamation-circle"></i> {error}
        </div>
      )}

      {/* Stats Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        background: THEME.bgMuted,
        borderRadius: `${THEME.radius.md} ${THEME.radius.md} 0 0`,
        border: `1px solid ${THEME.border}`,
        borderBottom: 'none',
        marginTop: 20,
      }}>
        <div style={{ fontSize: 14, color: THEME.textSecondary }}>
          <i className="fas fa-ticket-alt" style={{ marginRight: 8, color: THEME.primary }}></i>
          Showing <strong style={{ color: THEME.textPrimary }}>{vouchers.length}</strong> of <strong style={{ color: THEME.textPrimary }}>{total}</strong> vouchers
        </div>
        <div style={{ fontSize: 13, color: THEME.textMuted }}>
          Page {page} of {totalPages}
        </div>
      </div>

      {loading && vouchers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: THEME.textMuted }}><i className="fas fa-spinner fa-spin"></i> Loading...</div>
      ) : vouchers.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60, color: THEME.textMuted }}>
          <i className="fas fa-ticket-alt" style={{ fontSize: 40, marginBottom: 16 }}></i>
          <p>No vouchers yet</p>
        </div>
      ) : (
        <div style={{
          overflowX: 'auto',
          borderRadius: `0 0 ${THEME.radius.md} ${THEME.radius.md}`,
          background: THEME.bgCard,
          border: `1px solid ${THEME.border}`,
          borderTop: 'none',
        }}>
          <table>
            <thead>
              <tr><th>Image</th><th>Code</th><th>Title</th><th>Discount</th><th>Used/Max</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {vouchers.map(v => (
                <tr key={v.id}>
                  <td>
                    {v.image_url ? (
                      <img src={v.image_url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} />
                    ) : (
                      <div style={{ width: 40, height: 40, background: THEME.bgMuted, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: THEME.success, fontSize: 14 }}>
                        <i className="fas fa-ticket"></i>
                      </div>
                    )}
                  </td>
                  <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{v.code}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{v.title || '-'}</div>
                    {v.short_description && <div style={{ fontSize: 12, color: THEME.success, marginTop: 2 }}>{v.short_description}</div>}
                  </td>
                  <td>{renderDiscount(v)}</td>
                  <td>{renderUsage(v)}</td>
                  <td>
                    <button className="btn btn-sm" onClick={() => toggleActive(v)} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}>
                      <span className={`badge ${v.is_active ? 'badge-green' : 'badge-gray'}`}>{v.is_active ? 'Active' : 'Inactive'}</span>
                    </button>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm" onClick={() => openEdit(v)} title="Edit"><i className="fas fa-edit"></i></button>
                      {confirmDelete === v.id ? (
                        <>
                          <button className="btn btn-sm" style={{ background: '#EF4444', color: 'white' }} onClick={() => handleDelete(v.id)}>Confirm</button>
                          <button className="btn btn-sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
                        </>
                      ) : (
                        <button className="btn btn-sm" style={{ color: '#EF4444' }} onClick={() => setConfirmDelete(v.id)} title="Delete"><i className="fas fa-trash"></i></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={fetchVouchers} loading={loading} />
    </div>
  );
}

// ── Separate Form Page ────────────────────────────────────────────────────────

function VoucherFormPage({ token, existingVoucher, onBack }: { token: string; existingVoucher: any | null; onBack: () => void }) {
  const isEdit = !!existingVoucher;
  const fileRef = useRef<HTMLInputElement>(null);

  function formFromVoucher(v: any): VoucherForm {
    return {
      code: v.code || '', title: v.title || '', short_description: v.short_description || '',
      long_description: v.long_description || '', discount_type: v.discount_type || 'percent',
      discount_value: v.discount_value != null ? String(v.discount_value) : '',
      min_spend: v.min_spend != null ? String(v.min_spend) : '0',
      max_uses: v.max_uses != null ? String(v.max_uses) : '',
      max_uses_per_user: v.max_uses_per_user != null ? String(v.max_uses_per_user) : '1',
      validity_days: v.validity_days != null ? String(v.validity_days) : '30',
      valid_from: v.valid_from ? v.valid_from.slice(0, 16) : '',
      valid_until: v.valid_until ? v.valid_until.slice(0, 16) : '',
      promo_type: v.promo_type || 'generic', is_active: v.is_active !== false,
      image_url: v.image_url || '',
      terms: Array.isArray(v.terms) ? v.terms.join('\n') : '',
      how_to_redeem: v.how_to_redeem || '',
    };
  }

  const [form, setForm] = useState<VoucherForm>(existingVoucher ? formFromVoucher(existingVoucher) : { ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  function updateField<K extends keyof VoucherForm>(key: K, value: VoucherForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/v1/upload/marketing-image', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (res.ok) { const data = await res.json(); updateField('image_url', data.url); }
    } catch {} finally { setUploading(false); }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const payload: Record<string, any> = {
        code: form.code.toUpperCase().trim(), title: form.title.trim(),
        short_description: form.short_description.trim(), long_description: form.long_description.trim(),
        discount_type: form.discount_type, discount_value: Number(form.discount_value),
        min_spend: Number(form.min_spend) || 0, valid_from: form.valid_from || null,
        valid_until: form.valid_until || null, promo_type: form.promo_type, is_active: form.is_active,
        image_url: form.image_url || null,
        terms: form.terms.split('\n').map((t: string) => t.trim()).filter(Boolean),
        how_to_redeem: form.how_to_redeem.trim(),
        max_uses: form.max_uses.trim() !== '' ? Number(form.max_uses) : null,
        max_uses_per_user: form.max_uses_per_user.trim() !== '' ? Number(form.max_uses_per_user) : null,
        validity_days: form.validity_days.trim() !== '' ? Number(form.validity_days) : 30,
      };
      const url = isEdit ? `/admin/vouchers/${existingVoucher!.id}` : '/admin/vouchers';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await apiFetch(url, token, { method, body: JSON.stringify(payload) });
      if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.detail || `Failed (${res.status})`); return; }
      onBack();
    } catch { setError('Network error'); } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="card">
        {error && (
          <div style={{ background: '#FEE2E2', color: '#A83232', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
            <i className="fas fa-exclamation-circle"></i> {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={labelStyle}>Title *</label><input value={form.title} onChange={e => updateField('title', e.target.value)} placeholder="e.g. Summer Sale" required /></div>
            <div><label style={labelStyle}>Code *</label><input value={form.code} onChange={e => updateField('code', e.target.value.toUpperCase())} placeholder="e.g. SUMMER2026" style={{ textTransform: 'uppercase' }} required /><div style={hintStyle}>Unique catalog code</div></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Short Description</label><textarea value={form.short_description} onChange={e => updateField('short_description', e.target.value)} placeholder="Brief summary..." rows={2} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${THEME.accentLight}`, fontSize: 14, resize: 'vertical' }} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Detail Description</label><textarea value={form.long_description} onChange={e => updateField('long_description', e.target.value)} placeholder="Full content..." rows={4} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${THEME.accentLight}`, fontSize: 14, resize: 'vertical' }} /></div>
            <div><label style={labelStyle}>Discount Type *</label><Select value={form.discount_type} onChange={(val) => updateField('discount_type', val)} options={[{ value: 'percent', label: 'Percentage (%)' }, { value: 'fixed', label: 'Fixed Amount (RM)' }, { value: 'free_item', label: 'Free Item' }]} /></div>
            <div><label style={labelStyle}>Discount Value *</label><input type="number" min="0" step="0.01" value={form.discount_value} onChange={e => updateField('discount_value', e.target.value)} placeholder="0" required /></div>
            <div><label style={labelStyle}>Min Spend (RM)</label><input type="number" min="0" step="0.01" value={form.min_spend} onChange={e => updateField('min_spend', e.target.value)} /></div>
            <div><label style={labelStyle}>Max Uses <span style={{ color: THEME.success, fontWeight: 400 }}>(blank = unlimited)</span></label><input type="number" min="1" value={form.max_uses} onChange={e => updateField('max_uses', e.target.value)} placeholder="Blank = unlimited" /></div>
            <div><label style={labelStyle}>Max Per User</label><input type="number" min="1" value={form.max_uses_per_user} onChange={e => updateField('max_uses_per_user', e.target.value)} placeholder="1" /></div>
            <div><label style={labelStyle}>Validity Days <span style={{ color: THEME.success, fontWeight: 400 }}>(after claim)</span></label><input type="number" min="1" value={form.validity_days} onChange={e => updateField('validity_days', e.target.value)} placeholder="30" /></div>
            <div><label style={labelStyle}>Valid From</label><input type="datetime-local" value={form.valid_from} onChange={e => updateField('valid_from', e.target.value)} /></div>
            <div><label style={labelStyle}>Valid Until</label><input type="datetime-local" value={form.valid_until} onChange={e => updateField('valid_until', e.target.value)} /></div>
            <div><label style={labelStyle}>Promo Type</label><Select value={form.promo_type} onChange={(val) => updateField('promo_type', val)} options={[{ value: 'generic', label: 'Generic' }, { value: 'bogo', label: 'Buy One Get One' }, { value: 'happy_hour', label: 'Happy Hour' }, { value: 'seasonal', label: 'Seasonal' }]} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Terms &amp; Conditions</label><textarea value={form.terms} onChange={e => updateField('terms', e.target.value)} placeholder="One per line" rows={3} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${THEME.accentLight}`, fontSize: 14, resize: 'vertical' }} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>How to Redeem</label><input value={form.how_to_redeem} onChange={e => updateField('how_to_redeem', e.target.value)} placeholder="e.g. Show this screen at checkout" /></div>
            <div>
              <label style={labelStyle}>Image</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input type="file" ref={fileRef} accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />
                <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? 'Uploading...' : 'Upload Image'}</button>
                {form.image_url && (<><img src={form.image_url} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6 }} /><button type="button" className="btn btn-sm" onClick={() => updateField('image_url', '')} style={{ color: '#EF4444' }}><i className="fas fa-times"></i></button></>)}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}</button>
            <button type="button" className="btn" onClick={onBack}>Cancel</button>
            <div style={{ flex: 1 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={form.is_active} onChange={e => updateField('is_active', e.target.checked)} style={{ width: 16, height: 16 }} />
              Active
            </label>
          </div>
        </form>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: THEME.primary };
const hintStyle: React.CSSProperties = { fontSize: 11, color: THEME.success, marginTop: 2 };
