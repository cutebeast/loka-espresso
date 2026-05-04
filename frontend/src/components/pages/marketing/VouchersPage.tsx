'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch, formatRM } from '@/lib/merchant-api';

import { Select, Drawer, DataTable, type ColumnDef } from '@/components/ui';

interface VoucherItem {
  id: number;
  code: string;
  title: string;
  short_description: string | null;
  long_description: string | null;
  discount_type: string;
  discount_value: number;
  min_spend: number | null;
  max_uses: number | null;
  max_uses_per_user: number | null;
  validity_days: number | null;
  valid_from: string | null;
  valid_until: string | null;
  promo_type: string;
  is_active: boolean;
  terms: string[] | null;
  how_to_redeem: string | null;
  used_count?: number;
  times_used?: number;
  created_at?: string;
  updated_at?: string;
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
  terms: string;
  how_to_redeem: string;
}

const emptyForm: VoucherForm = {
  code: '', title: '', short_description: '', long_description: '',
  discount_type: 'percent', discount_value: '', min_spend: '0',
  max_uses: '', max_uses_per_user: '1', validity_days: '30',
  valid_from: '', valid_until: '', promo_type: 'generic',
  is_active: true, terms: '', how_to_redeem: '',
};

const PAGE_SIZE = 20;

export default function VouchersPage() {
  const [vouchers, setVouchers] = useState<VoucherItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [error, setError] = useState('');

  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  const [editingVoucher, setEditingVoucher] = useState<VoucherItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchVouchers = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), page_size: String(PAGE_SIZE) });
      const res = await apiFetch(`/admin/vouchers?${params}`);
      if (res.ok) {
        const data = await res.json();
        setVouchers(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
        setPage(p);
      }
    } catch { setError('Failed to load vouchers'); setVouchers([]); setTotal(0); setTotalPages(1); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchVouchers(1); }, [fetchVouchers]);

  function openCreate() {
    setEditingVoucher(null);
    setViewMode('form');
    setDrawerOpen(true);
  }

  function openEdit(v: VoucherItem) {
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

  async function toggleActive(v: VoucherItem) {
    try {
      await apiFetch(`/admin/vouchers/${v.id}`, undefined, { method: 'PUT', body: JSON.stringify({ is_active: !v.is_active }) });
      fetchVouchers(page);
    } catch { setError('Failed to toggle voucher status'); }
  }

  async function handleDelete(id: number) {
    try {
      await apiFetch(`/admin/vouchers/${id}`, undefined, { method: 'DELETE' });
      setConfirmDelete(null);
      fetchVouchers(page);
    } catch { setError('Failed to delete voucher'); setConfirmDelete(null); }
  }

  function renderDiscount(v: VoucherItem) {
    if (v.discount_type === 'percent') return `${v.discount_value}% off`;
    if (v.discount_type === 'free_item') return `Free item (up to ${formatRM(v.discount_value)})`;
    return `${formatRM(v.discount_value)} off`;
  }

  function renderUsage(v: any) {
    const used = v.used_count ?? v.times_used ?? 0;
    return v.max_uses != null ? `${used}/${v.max_uses}` : `${used}/∞`;
  }

  const columns: ColumnDef<VoucherItem>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (row) => (
        <div className="vp-12">
          <div className="vp-13">
            <i className="fas fa-ticket"></i>
          </div>
          <span>{row.code}</span>
        </div>
      ),
    },
    {
      key: 'discount',
      header: 'Discount',
      render: (row) => <>{renderDiscount(row)}</>,
    },
    {
      key: 'usage_limit',
      header: 'Usage Limit',
      render: (row) => <>{renderUsage(row)}</>,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="vp-17">
          <button className="btn btn-sm" onClick={() => toggleActive(row)} title={row.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}>
            <i className={`fas ${row.is_active ? 'fa-toggle-on' : 'fa-toggle-off'}`} style={{ fontSize: 20, color: row.is_active ? '#16A34A' : '#9CA3AF' }}></i>
          </button>
          <button className="btn btn-sm" onClick={() => openEdit(row)} title="Edit"><i className="fas fa-edit"></i></button>
          {confirmDelete === row.id ? (
            <>
              <button className="btn btn-sm vp-18" onClick={() => handleDelete(row.id)}>Confirm</button>
              <button className="btn btn-sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
            </>
          ) : (
            <button className="btn btn-sm vp-19" onClick={() => setConfirmDelete(row.id)} title="Delete"><i className="fas fa-trash"></i></button>
          )}
        </div>
      ),
    },
  ];

  const drawerTitle = editingVoucher ? 'Edit Voucher' : 'New Voucher';

  return (
    <div>
      <Drawer isOpen={drawerOpen} onClose={closeForm} title={drawerTitle} >
        {viewMode === 'form' && (
          <VoucherFormPage existingVoucher={editingVoucher} onBack={closeForm} />
        )}
      </Drawer>
      <div className="vp-0">
        <button className="btn btn-primary" onClick={openCreate}><i className="fas fa-plus"></i> New Voucher</button>
      </div>

      {error && (
        <div className="vp-1">
          <i className="fas fa-exclamation-circle"></i> {error}
        </div>
      )}

      <div className="vp-2">
        <div className="vp-3">
          <span className="vp-4"><i className="fas fa-ticket-alt"></i></span>
          Showing <strong className="vp-5">{vouchers.length}</strong> of <strong className="vp-6">{total}</strong> vouchers
        </div>
        <div className="vp-7">
          Page {page} of {totalPages}
        </div>
      </div>

      <DataTable
        data={vouchers}
        columns={columns}
        loading={loading}
        emptyMessage="No vouchers yet"
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: fetchVouchers }}
      />
    </div>
  );
}

// ── Separate Form Page ────────────────────────────────────────────────────────

function VoucherFormPage({ existingVoucher, onBack }: { existingVoucher: any | null; onBack: () => void }) {
  const isEdit = !!existingVoucher;

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
      terms: Array.isArray(v.terms) ? v.terms.join('\n') : '',
      how_to_redeem: v.how_to_redeem || '',
    };
  }

  const [form, setForm] = useState<VoucherForm>(existingVoucher ? formFromVoucher(existingVoucher) : { ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function updateField<K extends keyof VoucherForm>(key: K, value: VoucherForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    setSaving(true); setError('');
    try {
      const payload: Record<string, any> = {
        code: form.code.toUpperCase().trim(), title: form.title.trim(),
        short_description: form.short_description.trim(), long_description: form.long_description.trim(),
        discount_type: form.discount_type, discount_value: Number(form.discount_value),
        min_spend: Number(form.min_spend) || 0, valid_from: form.valid_from || null,
        valid_until: form.valid_until || null, promo_type: form.promo_type, is_active: form.is_active,
        terms: form.terms.split('\n').map((t: string) => t.trim()).filter(Boolean),
        how_to_redeem: form.how_to_redeem.trim(),
        max_uses: form.max_uses.trim() !== '' ? Number(form.max_uses) : null,
        max_uses_per_user: form.max_uses_per_user.trim() !== '' ? Number(form.max_uses_per_user) : null,
        validity_days: form.validity_days.trim() !== '' ? Number(form.validity_days) : 30,
      };
      const url = isEdit ? `/admin/vouchers/${existingVoucher!.id}` : '/admin/vouchers';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await apiFetch(url, undefined, { method, body: JSON.stringify(payload) });
      if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.detail || `Failed (${res.status})`); return; }
      onBack();
    } catch { setError('Network error'); } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="card">
        {error && (
          <div className="vfp-20">
            <i className="fas fa-exclamation-circle"></i> {error}
          </div>
        )}
        <div>
          <div className="vfp-21">
            <div><label className="form-label">Title *</label><input value={form.title} onChange={e => updateField('title', e.target.value)} placeholder="e.g. Summer Sale" required /></div>
            <div><label className="form-label">Code *</label><input value={form.code} onChange={e => updateField('code', e.target.value.toUpperCase())} placeholder="e.g. SUMMER2026" className="vfp-22" required /><div className="form-hint">Unique catalog code</div></div>
            <div className="vfp-23"><label className="form-label">Short Description</label><textarea value={form.short_description} onChange={e => updateField('short_description', e.target.value)} placeholder="Brief summary..." rows={2} className="vfp-24" /></div>
            <div className="vfp-25"><label className="form-label">Detail Description</label><textarea value={form.long_description} onChange={e => updateField('long_description', e.target.value)} placeholder="Full content..." rows={4} className="vfp-26" /></div>
            <div><label className="form-label">Discount Type *</label><Select value={form.discount_type} onChange={(val) => updateField('discount_type', val)} options={[{ value: 'percent', label: 'Percentage (%)' }, { value: 'fixed', label: 'Fixed Amount (RM)' }, { value: 'free_item', label: 'Free Item' }]} /></div>
            <div><label className="form-label">Discount Value *</label><input type="number" min="0" step="0.01" value={form.discount_value} onChange={e => updateField('discount_value', e.target.value)} placeholder="0" required /></div>
            <div><label className="form-label">Min Spend (RM)</label><input type="number" min="0" step="0.01" value={form.min_spend} onChange={e => updateField('min_spend', e.target.value)} /></div>
            <div><label className="form-label">Max Uses <span className="vfp-27">(blank = unlimited)</span></label><input type="number" min="1" value={form.max_uses} onChange={e => updateField('max_uses', e.target.value)} placeholder="Blank = unlimited" /></div>
            <div><label className="form-label">Max Per User</label><input type="number" min="1" value={form.max_uses_per_user} onChange={e => updateField('max_uses_per_user', e.target.value)} placeholder="1" /></div>
            <div><label className="form-label">Validity Days <span className="vfp-28">(after claim)</span></label><input type="number" min="1" value={form.validity_days} onChange={e => updateField('validity_days', e.target.value)} placeholder="30" /></div>
            <div><label className="form-label">Valid From</label><input type="datetime-local" value={form.valid_from} onChange={e => updateField('valid_from', e.target.value)} /></div>
            <div><label className="form-label">Valid Until</label><input type="datetime-local" value={form.valid_until} onChange={e => updateField('valid_until', e.target.value)} /></div>
            <div><label className="form-label">Promo Type</label><Select value={form.promo_type} onChange={(val) => updateField('promo_type', val)} options={[{ value: 'generic', label: 'Generic' }, { value: 'bogo', label: 'Buy One Get One' }, { value: 'happy_hour', label: 'Happy Hour' }, { value: 'seasonal', label: 'Seasonal' }]} /></div>
            <div className="vfp-29"><label className="form-label">Terms &amp; Conditions</label><textarea value={form.terms} onChange={e => updateField('terms', e.target.value)} placeholder="One per line" rows={3} className="vfp-30" /></div>
            <div className="vfp-31"><label className="form-label">How to Redeem</label><input value={form.how_to_redeem} onChange={e => updateField('how_to_redeem', e.target.value)} placeholder="e.g. Show this screen at checkout" /></div>
          </div>
          <div className="df-actions">
            <label className="vfp-34" style={{ marginRight: 'auto' }}>
              <input type="checkbox" checked={form.is_active} onChange={e => updateField('is_active', e.target.checked)} className="vfp-35" />
              Active
            </label>
            <button className="btn" onClick={onBack}>Cancel</button>
            <button onClick={handleSubmit} className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
