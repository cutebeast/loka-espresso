'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { apiFetch, apiUpload, cacheBust } from '@/lib/merchant-api';
import { THEME } from '@/lib/theme';
import { Select, Pagination, Drawer } from '@/components/ui';
import SurveysPage from './SurveysPage';
import SurveyReportPage from './SurveyReportPage';

interface PromotionsPageProps {
  token: string;
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

export default function PromotionsPage({ token }: PromotionsPageProps) {
  // Banner pagination
  const [banners, setBanners] = useState<any[]>([]);
  const [bannerPage, setBannerPage] = useState(1);
  const [bannerTotal, setBannerTotal] = useState(0);
  const [bannerTotalPages, setBannerTotalPages] = useState(1);
  const [bannerLoading, setBannerLoading] = useState(false);

  // View mode: which sub-view is active
  const [viewMode, setViewMode] = useState<'promotions' | 'banner-form' | 'surveys' | 'survey-form' | 'reports'>('promotions');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BannerForm>(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [surveys, setSurveys] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const PAGE_SIZE = 20;

  // ── Banner fetch with pagination ──
  const fetchBanners = useCallback(async (p: number) => {
    setBannerLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), page_size: String(PAGE_SIZE) });
      const res = await apiFetch(`/admin/banners?${params}`);
      if (res.ok) {
        const data = await res.json();
        setBanners(data.banners || []);
        setBannerTotal(data.total || 0);
        setBannerTotalPages(data.total_pages || 1);
        setBannerPage(p);
      }
    } catch {} finally { setBannerLoading(false); }
  }, []);

  useEffect(() => { fetchBanners(1); }, [fetchBanners]);

  useEffect(() => {
    if (viewMode === 'banner-form') {
      apiFetch('/admin/surveys')
        .then(r => r.ok ? r.json() : { surveys: [] })
        .then(d => setSurveys(Array.isArray(d) ? d : (d.surveys ?? [])))
        .catch(() => {});
      apiFetch('/admin/vouchers')
        .then(r => r.ok ? r.json() : { vouchers: [] })
        .then(d => setVouchers(Array.isArray(d) ? d : (d.vouchers ?? [])))
        .catch(() => {});
    }
  }, [viewMode, token]);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setViewMode('banner-form');
    setDrawerOpen(true);
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
    setViewMode('banner-form');
    setDrawerOpen(true);
  };

  const closeForm = () => {
    setDrawerOpen(false);
    setViewMode('promotions');
    setEditingId(null);
    setError('');
    fetchBanners(bannerPage);
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
        res = await apiFetch(`/admin/banners/${editingId}`, undefined, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        res = await apiFetch('/admin/banners', undefined, {
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
      await apiFetch(`/admin/banners/${id}`, undefined, { method: 'DELETE' });
      setDeletingId(null);
      fetchBanners(bannerPage);
    } catch (err: any) {
      setError(err.message || 'Failed to delete banner');
    }
  };

  const handleToggleActive = async (banner: any) => {
    setError('');
    try {
      const res = await apiFetch(`/admin/banners/${banner.id}`, undefined, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !banner.is_active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || 'Failed to toggle banner');
        return;
      }
      fetchBanners(bannerPage);
    } catch (err: any) {
      setError(err.message || 'Failed to toggle banner');
    }
  };

  const setField = (field: keyof BannerForm, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Determine current tab from viewMode for the tab bar highlight
  const currentTab = (viewMode === 'promotions' || viewMode === 'banner-form') ? 'promotions' : (viewMode === 'reports' ? 'reports' : 'surveys');
  const drawerTitle = editingId ? 'Edit Banner' : 'New Banner';

  return (
    <div>
      <Drawer isOpen={drawerOpen} onClose={closeForm} title={drawerTitle} width={560}>
        {/* BANNER FORM */}
        {viewMode === 'banner-form' && (
          <div className="card">
            {error && (
              <div className="pp-0">
                <i className="fas fa-exclamation-circle"></i> {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="pp-1">
                <div>
                  <label className="pp-label">Title *</label>
                  <input type="text" required value={form.title} onChange={(e) => setField('title', e.target.value)} />
                </div>
                <div>
                  <label className="pp-label">Short Description <span className="pp-2">(optional)</span></label>
                  <input type="text" value={form.short_description} onChange={(e) => setField('short_description', e.target.value)} placeholder="Brief summary shown on banner card" />
                </div>
              </div>

              <div className="pp-3">
                  <label className="pp-label">Detail Description <span className="pp-4">(full content shown when customer taps to view details)</span></label>
                <textarea
                  value={form.long_description}
                  onChange={(e) => setField('long_description', e.target.value)}
                  placeholder="Full content shown when customer taps to view details..."
                  rows={4}
                  className="pp-5"
                />
              </div>

              <div className="pp-6">
                <ImageUploadField label="Banner Image (thumbnail)" imageUrl={form.image_url} token={token} onSet={(url) => setField('image_url', url)} hint="720 × 405 px (16:9) · Card thumbnail" />
              </div>

              <div className="pp-7">
                <div>
                  <label className="pp-label">Terms &amp; Conditions</label>
                  <textarea
                    value={form.terms}
                    onChange={(e) => setField('terms', e.target.value)}
                    placeholder="One per line. e.g. One per customer per day"
                    rows={3}
                    className="pp-8"
                  />
                  <div className="pp-9">One term per line</div>
                </div>
                <div>
                  <label className="pp-label">How to Redeem</label>
                  <input value={form.how_to_redeem} onChange={(e) => setField('how_to_redeem', e.target.value)} placeholder="e.g. Show this screen at checkout" />
                </div>
              </div>

              <div className="pp-10">
                  <div>
                    <label className="pp-label">Action Type</label>
                    <Select value={form.action_type} onChange={(val) => setField('action_type', val)} options={[{ value: 'detail', label: 'Show Details (with redeem link)' }, { value: 'survey', label: 'Open Survey (auto-reward voucher)' }]} />
                    <div className="pp-11">
                      {form.action_type === 'survey'
                        ? 'Customer fills out survey → automatically receives reward voucher'
                        : 'Customer sees banner details → can tap to claim linked voucher'}
                    </div>
                  </div>
                  {form.action_type === 'survey' ? (
                    <div>
                      <label className="pp-label">Survey <span className="pp-12">* required</span></label>
                      <Select value={form.survey_id} onChange={(val) => setField('survey_id', val)} options={[{ value: '', label: '— Select Survey —' }, ...surveys.map(s => ({ value: String(s.id), label: s.title }))]} />
                      <div className="pp-13">Select which survey to show when customer taps this banner</div>
                    </div>
                  ) : (
                    <div>
                      <label className="pp-label">Voucher to Redeem <span className="pp-14">(optional)</span></label>
                      <Select value={form.voucher_id} onChange={(val) => setField('voucher_id', val)} options={[{ value: '', label: '— None (info only) —' }, ...vouchers.filter(v => v.is_active).map(v => ({ value: String(v.id), label: `${v.code} — ${v.title || v.description}` }))]} />
                      <div className="pp-15">Customer can claim this voucher when they tap &quot;Redeem&quot;. Leave empty for info-only banners.</div>
                    </div>
                  )}
                </div>

                <div className="pp-16">
                  <div>
                    <label className="pp-label">Start Date <span className="pp-17">(blank = always)</span></label>
                    <input type="date" value={form.start_date} onChange={(e) => setField('start_date', e.target.value)} />
                    <div className="pp-18">When banner becomes visible. Leave blank to show immediately.</div>
                  </div>
                  <div>
                    <label className="pp-label">End Date <span className="pp-19">(blank = unlimited)</span></label>
                    <input type="date" value={form.end_date} onChange={(e) => setField('end_date', e.target.value)} />
                    <div className="pp-20">When banner stops showing. Leave blank for no end date.</div>
                  </div>
                </div>

              <div className="pp-21">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
                </button>
                <button type="button" className="btn" onClick={closeForm}>
                  Cancel
                </button>
                <div className="pp-22" />
                <label className="pp-23">
                  <input type="checkbox" checked={form.is_active} onChange={(e) => setField('is_active', e.target.checked)} className="pp-24" />
                  Active
                </label>
              </div>
            </form>
          </div>
        )}
      </Drawer>
      {/* Tab bar — only show on list views */}
      {(viewMode === 'promotions' || viewMode === 'surveys') && (
        <div className="pp-25">
          <button
            onClick={() => setViewMode('promotions')}
            className="pp-tab"
            style={{
              borderBottom: `2px solid ${currentTab === 'promotions' ? THEME.primary : 'transparent'}`,
              color: currentTab === 'promotions' ? THEME.primary : THEME.textMuted,
            }}
          >
            <span className="pp-26"><i className="fas fa-bullhorn"></i></span>
            Promotions
          </button>
          <button
            onClick={() => setViewMode('surveys')}
            className="pp-tab"
            style={{
              borderBottom: `2px solid ${currentTab === 'surveys' ? THEME.primary : 'transparent'}`,
              color: currentTab === 'surveys' ? THEME.primary : THEME.textMuted,
            }}
          >
            <span className="pp-27"><i className="fas fa-list-check"></i></span>
            Surveys
          </button>
          <button
            onClick={() => setViewMode('reports')}
            className="pp-tab"
            style={{
              borderBottom: `2px solid ${currentTab === 'reports' ? THEME.primary : 'transparent'}`,
              color: currentTab === 'reports' ? THEME.primary : THEME.textMuted,
            }}
          >
            <span className="pp-28"><i className="fas fa-chart-bar"></i></span>
            Survey Reports
          </button>
        </div>
      )}

      {/* ── PROMOTIONS LIST VIEW ── */}
      {viewMode === 'promotions' && (
        <>
          <div className="pp-29">
            <button className="btn btn-primary" onClick={openNew}>
              <i className="fas fa-plus"></i> New Banner
            </button>
          </div>

          {error && (
            <div className="pp-30">
              <i className="fas fa-exclamation-circle"></i> {error}
            </div>
          )}

          <div className="pp-31">
            <div className="pp-32">
              <span className="pp-33"><i className="fas fa-image"></i></span>
              Showing <strong className="pp-34">{banners.length}</strong> of <strong>{bannerTotal}</strong> banners
            </div>
            <div className="pp-35">
              Page {bannerPage} of {bannerTotalPages}
            </div>
          </div>

          <div className="pp-36">
            <table>
              <thead>
                <tr><th>Image</th><th>Title</th><th>Short Desc</th><th>Action</th><th>Status</th><th>Period</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {banners.length === 0 ? (
                  <tr><td colSpan={7} className="pp-37">
                    <span className="pp-38"><i className="fas fa-image"></i></span>
                    No banners yet
                  </td></tr>
                ) : banners.map(banner => (
                  <tr key={banner.id}>
                    <td>
                      {banner.image_url ? (
                        <Image src={cacheBust(banner.image_url)} alt="" width={80} height={45} className="pp-39" />
                      ) : (
                        <div className="pp-40">
                          <i className="fas fa-image"></i>
                        </div>
                      )}
                    </td>
                    <td className="pp-41">{banner.title}</td>
                    <td className="pp-42">{banner.short_description || '-'}</td>
                    <td>
                      <div>
                        <span className={`badge ${banner.action_type === 'survey' ? 'badge-blue' : 'badge-gray'}`}>
                          {banner.action_type === 'survey' ? 'Open Survey' : 'Show Details'}
                        </span>
                      </div>
                      {(banner.action_type === 'detail' && banner.voucher_id) && (
                        <div className="pp-43">
                          <span className="pp-44"><i className="fas fa-ticket-alt"></i></span>Voucher #{banner.voucher_id}
                        </div>
                      )}
                      {(banner.action_type === 'survey' && banner.survey_id) && (
                        <div className="pp-45">
                          <span className="pp-46"><i className="fas fa-clipboard-list"></i></span>Survey #{banner.survey_id}
                        </div>
                      )}
                    </td>
                    <td>
                      <button className="btn btn-sm pp-47" onClick={() => handleToggleActive(banner)} >
                        <span className={`badge ${banner.is_active ? 'badge-green' : 'badge-gray'}`}>
                          {banner.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </button>
                    </td>
                    <td className="pp-48">
                      {(banner.start_date || banner.end_date) ? (
                        <>
                          {banner.start_date ? new Date(banner.start_date).toLocaleDateString() : '—'} → {banner.end_date ? new Date(banner.end_date).toLocaleDateString() : '—'}
                        </>
                      ) : '—'}
                    </td>
                    <td>
                      <div className="pp-49">
                        <button className="btn btn-sm" onClick={() => openEdit(banner)}><i className="fas fa-edit"></i></button>
                        {deletingId === banner.id ? (
                          <>
                            <button className="btn btn-sm pp-50"  onClick={() => handleDelete(banner.id)}>Confirm</button>
                            <button className="btn btn-sm" onClick={() => setDeletingId(null)}>Cancel</button>
                          </>
                        ) : (
                          <button className="btn btn-sm pp-51"  onClick={() => setDeletingId(banner.id)}>
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

          <Pagination page={bannerPage} totalPages={bannerTotalPages} onPageChange={fetchBanners} loading={bannerLoading} />
        </>
      )}

      {/* ── SURVEYS VIEW ── */}
      {(viewMode === 'surveys' || viewMode === 'survey-form') && (
        <SurveysPage
          token={token}
          onSwitchToPromotions={() => setViewMode('promotions')}
        />
      )}

      {/* ── SURVEY REPORTS VIEW ── */}
      {viewMode === 'reports' && (
        <SurveyReportPage token={token} />
      )}
    </div>
  );
}

function ImageUploadField({ label, imageUrl, token: _token, onSet, hint }: { label: string; imageUrl: string; token: string; onSet: (url: string) => void; hint?: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiUpload('/upload/marketing-image', fd);
      if (res.ok) {
        const data = await res.json();
        onSet(data.url);
      }
    } catch {} finally { setUploading(false); }
  }

  return (
    <div>
      <label className="pp-label">{label}</label>
      <div className="iuf-52">
        <input type="file" ref={fileRef} accept="image/*" onChange={handleUpload} className="iuf-53" />
        <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
        {imageUrl && (
          <>
            <Image src={imageUrl} alt="" width={40} height={28} className="iuf-54" />
            <button type="button" className="btn btn-sm iuf-55" onClick={() => onSet('')} ><i className="fas fa-times"></i></button>
          </>
        )}
      </div>
      {hint && <div className="iuf-56"><span className="iuf-57"><i className="fas fa-info-circle"></i></span>{hint}</div>}
    </div>
  );
}


