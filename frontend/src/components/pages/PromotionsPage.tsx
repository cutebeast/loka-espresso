'use client';

import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/merchant-api';

interface PromotionsPageProps {
  banners: any[];
  token: string;
  onRefresh: () => void;
}

interface BannerForm {
  title: string;
  short_description: string;
  long_description: string;
  image_url: string;
  action_type: string;
  survey_id: string;
  voucher_id: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  terms: string;
  how_to_redeem: string;
}

const emptyForm: BannerForm = {
  title: '',
  short_description: '',
  long_description: '',
  image_url: '',
  action_type: 'detail',
  survey_id: '',
  voucher_id: '',
  start_date: '',
  end_date: '',
  is_active: true,
  terms: '',
  how_to_redeem: '',
};

export default function PromotionsPage({ banners, token, onRefresh }: PromotionsPageProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BannerForm>(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [surveys, setSurveys] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);

  useEffect(() => {
    if (showForm) {
      apiFetch('/admin/surveys', token)
        .then(r => r.ok ? r.json() : [])
        .then(d => setSurveys(Array.isArray(d) ? d : (d.surveys ?? d.data ?? [])))
        .catch(() => {});
      apiFetch('/admin/vouchers', token)
        .then(r => r.ok ? r.json() : [])
        .then(d => setVouchers(Array.isArray(d) ? d : []))
        .catch(() => {});
    }
  }, [showForm, token]);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setShowForm(true);
  };

  const openEdit = (banner: any) => {
    setEditingId(banner.id);
    setForm({
      title: banner.title || '',
      short_description: banner.short_description || '',
      long_description: banner.long_description || '',
      image_url: banner.image_url || '',
      action_type: banner.action_type || (banner.survey_id ? 'survey' : 'detail'),
      survey_id: banner.survey_id != null ? String(banner.survey_id) : '',
      voucher_id: banner.voucher_id != null ? String(banner.voucher_id) : '',
      start_date: banner.start_date ? banner.start_date.slice(0, 16) : '',
      end_date: banner.end_date ? banner.end_date.slice(0, 16) : '',
      is_active: banner.is_active ?? true,
      terms: Array.isArray(banner.terms) ? banner.terms.join('\n') : '',
      how_to_redeem: banner.how_to_redeem || '',
    });
    setError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setError('');
    onRefresh();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const payload: any = {
      title: form.title,
      short_description: form.short_description || null,
      long_description: form.long_description || null,
      image_url: form.image_url || null,
      action_type: form.action_type,
      survey_id: form.action_type === 'survey' && form.survey_id ? Number(form.survey_id) : null,
      voucher_id: form.action_type === 'detail' && form.voucher_id ? Number(form.voucher_id) : null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      is_active: form.is_active,
      terms: form.terms.split('\n').map((t: string) => t.trim()).filter(Boolean),
      how_to_redeem: form.how_to_redeem.trim(),
    };

    try {
      setSaving(true);
      let res: Response;
      if (editingId) {
        res = await apiFetch(`/admin/banners/${editingId}`, token, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        res = await apiFetch('/admin/banners', token, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || `Failed (${res.status})`);
        return;
      }
      closeForm();
    } catch (err: any) {
      setError(err.message || 'Failed to save banner');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    setError('');
    try {
      await apiFetch(`/admin/banners/${id}`, token, { method: 'DELETE' });
      setDeletingId(null);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to delete banner');
    }
  };

  const handleToggleActive = async (banner: any) => {
    setError('');
    try {
      await apiFetch(`/admin/banners/${banner.id}`, token, {
        method: 'PUT',
        body: JSON.stringify({ ...banner, is_active: !banner.is_active }),
      });
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to toggle banner');
    }
  };

  const setField = (field: keyof BannerForm, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0 }}>Promotions</h3>
        <button className="btn btn-primary" onClick={openNew}>
          <i className="fas fa-plus"></i> New Banner
        </button>
      </div>

      {error && !showForm && (
        <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          <i className="fas fa-exclamation-circle"></i> {error}
        </div>
      )}

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h4 style={{ margin: 0 }}>{editingId ? 'Edit Banner' : 'New Banner'}</h4>
            <button className="btn btn-sm" onClick={() => { setShowForm(false); setEditingId(null); setError(''); }}><i className="fas fa-times"></i></button>
          </div>

          {error && (
            <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
              <i className="fas fa-exclamation-circle"></i> {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Title *</label>
                <input type="text" required value={form.title} onChange={(e) => setField('title', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Short Description</label>
                <input type="text" value={form.short_description} onChange={(e) => setField('short_description', e.target.value)} />
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={labelStyle}>Detail Description <span style={{ color: '#94A3B8', fontWeight: 400 }}>(full content shown when customer taps to view details)</span></label>
              <textarea
                value={form.long_description}
                onChange={(e) => setField('long_description', e.target.value)}
                placeholder="Full content shown when customer taps to view details..."
                rows={4}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 14, resize: 'vertical' }}
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <ImageUploadField label="Banner Image (thumbnail)" imageUrl={form.image_url} token={token} onSet={(url) => setField('image_url', url)} hint="720 × 405 px (16:9) · Card thumbnail" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div>
                <label style={labelStyle}>Terms &amp; Conditions</label>
                <textarea
                  value={form.terms}
                  onChange={(e) => setField('terms', e.target.value)}
                  placeholder="One per line. e.g. One per customer per day"
                  rows={3}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 14, resize: 'vertical' }}
                />
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>One term per line</div>
              </div>
              <div>
                <label style={labelStyle}>How to Redeem</label>
                <input value={form.how_to_redeem} onChange={(e) => setField('how_to_redeem', e.target.value)} placeholder="e.g. Show this screen at checkout" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div>
                <label style={labelStyle}>Action Type</label>
                <select value={form.action_type} onChange={(e) => setField('action_type', e.target.value)}>
                  <option value="detail">Show Details (with redeem link)</option>
                  <option value="survey">Open Survey (auto-reward voucher)</option>
                </select>
              </div>
              {form.action_type === 'survey' ? (
                <div>
                  <label style={labelStyle}>Survey</label>
                  <select value={form.survey_id} onChange={(e) => setField('survey_id', e.target.value)}>
                    <option value="">— Select Survey —</option>
                    {surveys.map(s => (
                      <option key={s.id} value={String(s.id)}>{s.title}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label style={labelStyle}>Voucher to Redeem</label>
                  <select value={form.voucher_id} onChange={(e) => setField('voucher_id', e.target.value)}>
                    <option value="">— Select Voucher —</option>
                    {vouchers.filter(v => v.is_active).map(v => (
                      <option key={v.id} value={String(v.id)}>{v.code} — {v.title || v.description}</option>
                    ))}
                  </select>
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Customer gets this voucher when they tap Redeem</div>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div>
                <label style={labelStyle}>Start Date</label>
                <input type="date" value={form.start_date} onChange={(e) => setField('start_date', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>End Date</label>
                <input type="date" value={form.end_date} onChange={(e) => setField('end_date', e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
              <button type="button" className="btn" onClick={() => { setShowForm(false); setEditingId(null); setError(''); }}>
                Cancel
              </button>
              <div style={{ flex: 1 }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                <input type="checkbox" checked={form.is_active} onChange={(e) => setField('is_active', e.target.checked)} style={{ width: 16, height: 16 }} />
                Active
              </label>
            </div>
          </form>
        </div>
      )}

      <div style={{ overflowX: 'auto', borderRadius: 20, background: 'white', border: '1px solid #ECF1F7' }}>
        <table>
          <thead>
            <tr><th>Image</th><th>Title</th><th>Short Desc</th><th>Action</th><th>Status</th><th>Period</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {banners.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94A3B8', padding: 40 }}>
                <i className="fas fa-image" style={{ fontSize: 40, display: 'block', marginBottom: 12 }}></i>
                No banners yet
              </td></tr>
            ) : banners.map(banner => (
              <tr key={banner.id}>
                <td>
                  {banner.image_url ? (
                    <img src={banner.image_url} alt="" style={{ width: 80, height: 45, objectFit: 'cover', borderRadius: 8 }} />
                  ) : (
                    <div style={{ width: 80, height: 45, background: '#F1F5F9', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 14 }}>
                      <i className="fas fa-image"></i>
                    </div>
                  )}
                </td>
                <td style={{ fontWeight: 600 }}>{banner.title}</td>
                <td style={{ color: '#64748B', fontSize: 13 }}>{banner.short_description || '-'}</td>
                <td>
                  <div>
                    <span className={`badge ${banner.action_type === 'survey' ? 'badge-blue' : 'badge-gray'}`}>
                      {banner.action_type === 'survey' ? 'Open Survey' : 'Show Details'}
                    </span>
                  </div>
                  {(banner.action_type === 'detail' && banner.voucher_id) && (
                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 3 }}>
                      <i className="fas fa-ticket-alt" style={{ marginRight: 3 }}></i>Voucher #{banner.voucher_id}
                    </div>
                  )}
                  {(banner.action_type === 'survey' && banner.survey_id) && (
                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 3 }}>
                      <i className="fas fa-clipboard-list" style={{ marginRight: 3 }}></i>Survey #{banner.survey_id}
                    </div>
                  )}
                </td>
                <td>
                  <button className="btn btn-sm" onClick={() => handleToggleActive(banner)} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}>
                    <span className={`badge ${banner.is_active ? 'badge-green' : 'badge-gray'}`}>
                      {banner.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </button>
                </td>
                <td style={{ fontSize: 13, color: '#64748B' }}>
                  {(banner.start_date || banner.end_date) ? (
                    <>
                      {banner.start_date ? new Date(banner.start_date).toLocaleDateString() : '—'} → {banner.end_date ? new Date(banner.end_date).toLocaleDateString() : '—'}
                    </>
                  ) : '—'}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm" onClick={() => openEdit(banner)}><i className="fas fa-edit"></i></button>
                    {deletingId === banner.id ? (
                      <>
                        <button className="btn btn-sm" style={{ background: '#EF4444', color: 'white' }} onClick={() => handleDelete(banner.id)}>Confirm</button>
                        <button className="btn btn-sm" onClick={() => setDeletingId(null)}>Cancel</button>
                      </>
                    ) : (
                      <button className="btn btn-sm" style={{ color: '#EF4444' }} onClick={() => setDeletingId(banner.id)}>
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

function ImageUploadField({ label, imageUrl, token, onSet, hint }: { label: string; imageUrl: string; token: string; onSet: (url: string) => void; hint?: string }) {
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
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="file" ref={fileRef} accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />
        <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
        {imageUrl && (
          <>
            <img src={imageUrl} alt="" style={{ width: 40, height: 28, objectFit: 'cover', borderRadius: 4 }} />
            <button type="button" className="btn btn-sm" onClick={() => onSet('')} style={{ color: '#EF4444' }}><i className="fas fa-times"></i></button>
          </>
        )}
      </div>
      {hint && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 3 }}><i className="fas fa-info-circle" style={{ marginRight: 4 }}></i>{hint}</div>}
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: '#334155' };
