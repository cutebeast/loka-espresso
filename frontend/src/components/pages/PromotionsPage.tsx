'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import { THEME } from '@/lib/theme';
import { Select, Pagination } from '@/components/ui';

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

interface SurveyQuestion {
  id?: number;
  question_text: string;
  question_type: 'text' | 'single_choice' | 'rating' | 'dropdown';
  options: string;
  required: boolean;
  sort_order: number;
}

interface Survey {
  id: number;
  title: string;
  description: string;
  is_active: boolean;
  reward_voucher_id: number | null;
  questions: SurveyQuestion[];
  response_count?: number;
  created_at: string;
}

const emptySurveyQuestion = (): SurveyQuestion => ({
  question_text: '',
  question_type: 'text',
  options: '',
  required: false,
  sort_order: 0,
});

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

  // Survey pagination
  const [surveyList, setSurveyList] = useState<Survey[]>([]);
  const [surveyPage, setSurveyPage] = useState(1);
  const [surveyTotal, setSurveyTotal] = useState(0);
  const [surveyTotalPages, setSurveyTotalPages] = useState(1);
  const [surveyLoading, setSurveyLoading] = useState(false);

  // View mode: which sub-view is active
  const [viewMode, setViewMode] = useState<'promotions' | 'banner-form' | 'surveys' | 'survey-form'>('promotions');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BannerForm>(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [surveys, setSurveys] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);

  const [surveyEditing, setSurveyEditing] = useState<Survey | null>(null);
  const [surveyError, setSurveyError] = useState('');
  const [surveyConfirmDelete, setSurveyConfirmDelete] = useState<number | null>(null);
  const [surveyTitle, setSurveyTitle] = useState('');
  const [surveyDescription, setSurveyDescription] = useState('');
  const [surveyIsActive, setSurveyIsActive] = useState(true);
  const [surveyRewardVoucherId, setSurveyRewardVoucherId] = useState('');
  const [surveyQuestions, setSurveyQuestions] = useState<SurveyQuestion[]>([emptySurveyQuestion()]);
  const [surveySaving, setSurveySaving] = useState(false);
  const [surveyVouchers, setSurveyVouchers] = useState<any[]>([]);

  const PAGE_SIZE = 20;

  // ── Banner fetch with pagination ──
  const fetchBanners = useCallback(async (p: number) => {
    setBannerLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), page_size: String(PAGE_SIZE) });
      const res = await apiFetch(`/admin/banners?${params}`, token);
      if (res.ok) {
        const data = await res.json();
        setBanners(data.banners || []);
        setBannerTotal(data.total || 0);
        setBannerTotalPages(data.total_pages || 1);
        setBannerPage(p);
      }
    } catch {} finally { setBannerLoading(false); }
  }, [token]);

  // ── Survey fetch with pagination ──
  const fetchSurveyList = useCallback(async (p: number = 1) => {
    setSurveyLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), page_size: String(PAGE_SIZE) });
      const res = await apiFetch(`/admin/surveys?${params}`, token);
      if (res.ok) {
        const data = await res.json();
        setSurveyList(data.surveys || []);
        setSurveyTotal(data.total || 0);
        setSurveyTotalPages(data.total_pages || 1);
        setSurveyPage(p);
      }
    } catch {} finally { setSurveyLoading(false); }
  }, [token]);

  useEffect(() => { fetchBanners(1); }, [fetchBanners]);
  useEffect(() => { if (viewMode === 'surveys') fetchSurveyList(1); }, [viewMode, fetchSurveyList]);

  useEffect(() => {
    if (viewMode === 'banner-form') {
      apiFetch('/admin/surveys', token)
        .then(r => r.ok ? r.json() : { surveys: [] })
        .then(d => setSurveys(Array.isArray(d) ? d : (d.surveys ?? [])))
        .catch(() => {});
      apiFetch('/admin/vouchers', token)
        .then(r => r.ok ? r.json() : { vouchers: [] })
        .then(d => setVouchers(Array.isArray(d) ? d : (d.vouchers ?? [])))
        .catch(() => {});
    }
  }, [viewMode, token]);

  useEffect(() => {
    if (viewMode === 'survey-form') {
      apiFetch('/admin/vouchers', token)
        .then(r => r.ok ? r.json() : { vouchers: [] })
        .then(d => setSurveyVouchers(Array.isArray(d) ? d : (d.vouchers ?? [])))
        .catch(() => {});
    }
  }, [viewMode, token]);

  function surveyOpenCreate() {
    setSurveyEditing(null);
    setSurveyTitle('');
    setSurveyDescription('');
    setSurveyIsActive(true);
    setSurveyRewardVoucherId('');
    setSurveyQuestions([emptySurveyQuestion()]);
    setSurveyError('');
    setViewMode('survey-form');
  }

  function surveyOpenEdit(survey: Survey) {
    setSurveyEditing(survey);
    setSurveyTitle(survey.title);
    setSurveyDescription(survey.description || '');
    setSurveyIsActive(survey.is_active);
    setSurveyRewardVoucherId(survey.reward_voucher_id != null ? String(survey.reward_voucher_id) : '');
    setSurveyQuestions(survey.questions?.length ? survey.questions.map(q => ({
      ...q,
      options: Array.isArray(q.options) ? q.options.join(', ') : (q.options || ''),
    })) : [emptySurveyQuestion()]);
    setSurveyError('');
    setViewMode('survey-form');
  }

  function surveyCloseForm() {
    setViewMode('surveys');
    setSurveyEditing(null);
    setSurveyError('');
    fetchSurveyList(surveyPage);
  }

  async function surveyToggleActive(survey: Survey) {
    setSurveyError('');
    try {
      const res = await apiFetch(`/admin/surveys/${survey.id}`, token, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !survey.is_active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSurveyError(data.detail || 'Failed to toggle');
        return;
      }
      fetchSurveyList(surveyPage);
    } catch (err: any) {
      setSurveyError(err.message || 'Network error');
    }
  }

  function surveyAddQuestion() {
    if (surveyQuestions.length >= 5) {
      setSurveyError('Maximum 5 questions per survey');
      return;
    }
    setSurveyQuestions(prev => [...prev, { ...emptySurveyQuestion(), sort_order: prev.length }]);
  }

  function surveyRemoveQuestion(index: number) {
    setSurveyQuestions(prev => prev.filter((_, i) => i !== index).map((q, i) => ({ ...q, sort_order: i })));
  }

  function surveyUpdateQuestion(index: number, field: keyof SurveyQuestion, value: any) {
    setSurveyQuestions(prev => prev.map((q, i) => i === index ? { ...q, [field]: value } : q));
  }

  async function surveyHandleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSurveySaving(true);
    setSurveyError('');

    const payload = {
      title: surveyTitle,
      description: surveyDescription,
      is_active: surveyIsActive,
      reward_voucher_id: surveyRewardVoucherId ? Number(surveyRewardVoucherId) : null,
      questions: surveyQuestions.map((q, i) => ({
        question_text: q.question_text,
        question_type: q.question_type,
        options: (q.question_type === 'single_choice' || q.question_type === 'dropdown')
          ? q.options.split(',').map((o: string) => o.trim()).filter(Boolean)
          : [],
        is_required: q.required,
        sort_order: i,
      })),
    };

    try {
      const res = surveyEditing
        ? await apiFetch(`/admin/surveys/${surveyEditing.id}`, token, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiFetch('/admin/surveys', token, { method: 'POST', body: JSON.stringify(payload) });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSurveyError(data.detail || `Failed (${res.status})`);
        return;
      }
      surveyCloseForm();
    } catch (err: any) {
      setSurveyError(err.message || 'Network error');
    } finally { setSurveySaving(false); }
  }

  async function surveyHandleDelete(id: number) {
    try {
      const res = await apiFetch(`/admin/surveys/${id}`, token, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSurveyError(data.detail || 'Delete failed');
        return;
      }
      setSurveyConfirmDelete(null);
      fetchSurveyList(surveyPage);
    } catch { setSurveyError('Network error'); }
  }

  const surveyRewardVoucherName = (id: number | null) => {
    if (!id) return '—';
    const v = surveyVouchers.find(v => v.id === id);
    return v ? v.title || v.code : `#${id}`;
  };

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setViewMode('banner-form');
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
  };

  const closeForm = () => {
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
      fetchBanners(bannerPage);
    } catch (err: any) {
      setError(err.message || 'Failed to delete banner');
    }
  };

  const handleToggleActive = async (banner: any) => {
    setError('');
    try {
      const res = await apiFetch(`/admin/banners/${banner.id}`, token, {
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
  const currentTab = (viewMode === 'promotions' || viewMode === 'banner-form') ? 'promotions' : 'surveys';

  return (
    <div>
      {/* Tab bar — only show on list views */}
      {(viewMode === 'promotions' || viewMode === 'surveys') && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: `1px solid ${THEME.border}` }}>
          <button
            onClick={() => setViewMode('promotions')}
            style={{
              padding: '12px 20px',
              border: 'none',
              borderBottom: `2px solid ${currentTab === 'promotions' ? THEME.primary : 'transparent'}`,
              background: 'transparent',
              color: currentTab === 'promotions' ? THEME.primary : THEME.textMuted,
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <i className="fas fa-bullhorn" style={{ marginRight: 8 }}></i>
            Promotions
          </button>
          <button
            onClick={() => setViewMode('surveys')}
            style={{
              padding: '12px 20px',
              border: 'none',
              borderBottom: `2px solid ${currentTab === 'surveys' ? THEME.primary : 'transparent'}`,
              background: 'transparent',
              color: currentTab === 'surveys' ? THEME.primary : THEME.textMuted,
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <i className="fas fa-list-check" style={{ marginRight: 8 }}></i>
            Surveys
          </button>
        </div>
      )}

      {/* ── BANNER FORM VIEW ── */}
      {viewMode === 'banner-form' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <button className="btn btn-sm" onClick={closeForm}>
              <i className="fas fa-arrow-left"></i> Back to Promotions
            </button>
            <h3 style={{ margin: 0 }}>{editingId ? 'Edit Banner' : 'New Banner'}</h3>
          </div>

          <div className="card">
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
                  <label style={labelStyle}>Short Description <span style={{ color: THEME.success, fontWeight: 400 }}>(optional)</span></label>
                  <input type="text" value={form.short_description} onChange={(e) => setField('short_description', e.target.value)} placeholder="Brief summary shown on banner card" />
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                  <label style={labelStyle}>Detail Description <span style={{ color: THEME.success, fontWeight: 400 }}>(full content shown when customer taps to view details)</span></label>
                <textarea
                  value={form.long_description}
                  onChange={(e) => setField('long_description', e.target.value)}
                  placeholder="Full content shown when customer taps to view details..."
                  rows={4}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${THEME.accentLight}`, fontSize: 14, resize: 'vertical' }}
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
 style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${THEME.accentLight}`, fontSize: 14, resize: 'vertical' }}
                  />
                  <div style={{ fontSize: 11, color: THEME.success, marginTop: 2 }}>One term per line</div>
                </div>
                <div>
                  <label style={labelStyle}>How to Redeem</label>
                  <input value={form.how_to_redeem} onChange={(e) => setField('how_to_redeem', e.target.value)} placeholder="e.g. Show this screen at checkout" />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                  <div>
                    <label style={labelStyle}>Action Type</label>
                    <Select value={form.action_type} onChange={(val) => setField('action_type', val)} options={[{ value: 'detail', label: 'Show Details (with redeem link)' }, { value: 'survey', label: 'Open Survey (auto-reward voucher)' }]} />
                    <div style={{ fontSize: 11, color: THEME.success, marginTop: 2 }}>
                      {form.action_type === 'survey'
                        ? 'Customer fills out survey → automatically receives reward voucher'
                        : 'Customer sees banner details → can tap to claim linked voucher'}
                    </div>
                  </div>
                  {form.action_type === 'survey' ? (
                    <div>
                      <label style={labelStyle}>Survey <span style={{ color: '#EF4444', fontWeight: 400 }}>* required</span></label>
                      <Select value={form.survey_id} onChange={(val) => setField('survey_id', val)} options={[{ value: '', label: '— Select Survey —' }, ...surveys.map(s => ({ value: String(s.id), label: s.title }))]} />
                      <div style={{ fontSize: 11, color: THEME.success, marginTop: 2 }}>Select which survey to show when customer taps this banner</div>
                    </div>
                  ) : (
                    <div>
                      <label style={labelStyle}>Voucher to Redeem <span style={{ color: THEME.success, fontWeight: 400 }}>(optional)</span></label>
                      <Select value={form.voucher_id} onChange={(val) => setField('voucher_id', val)} options={[{ value: '', label: '— None (info only) —' }, ...vouchers.filter(v => v.is_active).map(v => ({ value: String(v.id), label: `${v.code} — ${v.title || v.description}` }))]} />
                      <div style={{ fontSize: 11, color: THEME.success, marginTop: 2 }}>Customer can claim this voucher when they tap &quot;Redeem&quot;. Leave empty for info-only banners.</div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                  <div>
                    <label style={labelStyle}>Start Date <span style={{ color: THEME.success, fontWeight: 400 }}>(blank = always)</span></label>
                    <input type="date" value={form.start_date} onChange={(e) => setField('start_date', e.target.value)} />
                    <div style={{ fontSize: 11, color: THEME.success, marginTop: 2 }}>When banner becomes visible. Leave blank to show immediately.</div>
                  </div>
                  <div>
                    <label style={labelStyle}>End Date <span style={{ color: THEME.success, fontWeight: 400 }}>(blank = unlimited)</span></label>
                    <input type="date" value={form.end_date} onChange={(e) => setField('end_date', e.target.value)} />
                    <div style={{ fontSize: 11, color: THEME.success, marginTop: 2 }}>When banner stops showing. Leave blank for no end date.</div>
                  </div>
                </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
                </button>
                <button type="button" className="btn" onClick={closeForm}>
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
        </>
      )}

      {/* ── PROMOTIONS LIST VIEW ── */}
      {viewMode === 'promotions' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 20 }}>
            <button className="btn btn-primary" onClick={openNew}>
              <i className="fas fa-plus"></i> New Banner
            </button>
          </div>

          {error && (
            <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
              <i className="fas fa-exclamation-circle"></i> {error}
            </div>
          )}

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            background: THEME.bgMuted,
            borderRadius: `${THEME.radius.md} ${THEME.radius.md} 0 0`,
            border: `1px solid ${THEME.border}`,
            borderBottom: 'none',
          }}>
            <div style={{ fontSize: 14, color: THEME.textSecondary }}>
              <i className="fas fa-image" style={{ marginRight: 8, color: THEME.primary }}></i>
              Showing <strong style={{ color: THEME.textPrimary }}>{banners.length}</strong> of <strong>{bannerTotal}</strong> banners
            </div>
            <div style={{ fontSize: 13, color: THEME.textMuted }}>
              Page {bannerPage} of {bannerTotalPages}
            </div>
          </div>

          <div style={{ overflowX: 'auto', borderRadius: 20, background: 'white', border: `1px solid ${THEME.border}`, borderTop: 'none' }}>
            <table>
              <thead>
                <tr><th>Image</th><th>Title</th><th>Short Desc</th><th>Action</th><th>Status</th><th>Period</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {banners.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: THEME.primaryLight, padding: 40 }}>
                    <i className="fas fa-image" style={{ fontSize: 40, display: 'block', marginBottom: 12 }}></i>
                    No banners yet
                  </td></tr>
                ) : banners.map(banner => (
                  <tr key={banner.id}>
                    <td>
                      {banner.image_url ? (
                        <img src={banner.image_url} alt="" style={{ width: 80, height: 45, objectFit: 'cover', borderRadius: 8 }} />
                      ) : (
                        <div style={{ width: 80, height: 45, background: THEME.bgMuted, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: THEME.success, fontSize: 14 }}>
                          <i className="fas fa-image"></i>
                        </div>
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>{banner.title}</td>
                    <td style={{ color: THEME.success, fontSize: 13 }}>{banner.short_description || '-'}</td>
                    <td>
                      <div>
                        <span className={`badge ${banner.action_type === 'survey' ? 'badge-blue' : 'badge-gray'}`}>
                          {banner.action_type === 'survey' ? 'Open Survey' : 'Show Details'}
                        </span>
                      </div>
                      {(banner.action_type === 'detail' && banner.voucher_id) && (
                        <div style={{ fontSize: 11, color: THEME.success, marginTop: 3 }}>
                          <i className="fas fa-ticket-alt" style={{ marginRight: 3 }}></i>Voucher #{banner.voucher_id}
                        </div>
                      )}
                      {(banner.action_type === 'survey' && banner.survey_id) && (
                        <div style={{ fontSize: 11, color: THEME.success, marginTop: 3 }}>
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
                    <td style={{ fontSize: 13, color: THEME.success }}>
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

          <Pagination page={bannerPage} totalPages={bannerTotalPages} onPageChange={fetchBanners} loading={bannerLoading} />
        </>
      )}

      {/* ── SURVEY FORM VIEW ── */}
      {viewMode === 'survey-form' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <button className="btn btn-sm" onClick={surveyCloseForm}>
              <i className="fas fa-arrow-left"></i> Back to Surveys
            </button>
            <h3 style={{ margin: 0 }}>{surveyEditing ? 'Edit Survey' : 'New Survey'}</h3>
          </div>

          <div className="card">
            {surveyError && (
              <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
                <i className="fas fa-exclamation-circle"></i> {surveyError}
              </div>
            )}

            <form onSubmit={surveyHandleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>Title *</label>
                  <input value={surveyTitle} onChange={e => setSurveyTitle(e.target.value)} required placeholder="e.g. Customer Satisfaction Survey" />
                </div>
                <div>
                  <label style={labelStyle}>Reward Voucher</label>
                  <Select value={surveyRewardVoucherId} onChange={(val) => setSurveyRewardVoucherId(val)} options={[{ value: '', label: '— None —' }, ...surveyVouchers.map(v => ({ value: String(v.id), label: v.title || v.code }))]} />
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Description</label>
                <textarea value={surveyDescription} onChange={e => setSurveyDescription(e.target.value)} placeholder="Survey description..." rows={2} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 14, resize: 'vertical' }} />
              </div>

                  <div style={{ borderTop: `1px solid ${THEME.accentLight}`, paddingTop: 16, marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <h4 style={{ margin: 0 }}>Questions ({surveyQuestions.length}/5)</h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {surveyQuestions.length >= 5 && <span style={{ fontSize: 11, color: THEME.success }}>Maximum 5 questions</span>}
                    <button type="button" className="btn btn-sm btn-primary" onClick={surveyAddQuestion} disabled={surveyQuestions.length >= 5}>
                      <i className="fas fa-plus"></i> Add Question
                    </button>
                  </div>
                </div>

                {surveyQuestions.map((q, i) => (
                  <div key={i} style={{ background: THEME.bgMuted, borderRadius: 10, padding: 12, marginBottom: 8, border: `1px solid ${THEME.accentLight}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: THEME.primary }}>Q{i + 1}</span>
                      {surveyQuestions.length > 1 && (
                        <button type="button" className="btn btn-sm" style={{ color: '#EF4444' }} onClick={() => surveyRemoveQuestion(i)}>
                          <i className="fas fa-trash"></i>
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 8 }}>
                      <input value={q.question_text} onChange={e => surveyUpdateQuestion(i, 'question_text', e.target.value)} placeholder="Question text" required />
                      <Select value={q.question_type} onChange={(val) => surveyUpdateQuestion(i, 'question_type', val)} options={[{ value: 'text', label: 'Text' }, { value: 'single_choice', label: 'Single Choice' }, { value: 'rating', label: 'Rating' }, { value: 'dropdown', label: 'Dropdown' }]} />
                    </div>
                    {(q.question_type === 'single_choice' || q.question_type === 'dropdown') && (
                      <div style={{ marginBottom: 8 }}>
                        <input value={q.options} onChange={e => surveyUpdateQuestion(i, 'options', e.target.value)} placeholder="Options (comma-separated, e.g. Good, Okay, Bad)" style={{ width: '100%' }} />
                      </div>
                    )}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={q.required} onChange={e => surveyUpdateQuestion(i, 'required', e.target.checked)} style={{ width: 14, height: 14 }} />
                      Required
                    </label>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
                <button type="submit" className="btn btn-primary" disabled={surveySaving}>
                  {surveySaving ? 'Saving...' : surveyEditing ? 'Update' : 'Create'}
                </button>
                <button type="button" className="btn" onClick={surveyCloseForm}>Cancel</button>
                <div style={{ flex: 1 }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                  <input type="checkbox" checked={surveyIsActive} onChange={e => setSurveyIsActive(e.target.checked)} style={{ width: 16, height: 16 }} />
                  Active
                </label>
              </div>
            </form>
          </div>
        </>
      )}

      {/* ── SURVEYS LIST VIEW ── */}
      {viewMode === 'surveys' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 20 }}>
            <button className="btn btn-primary" onClick={surveyOpenCreate}><i className="fas fa-plus"></i> New Survey</button>
          </div>

          {surveyError && (
            <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
              <i className="fas fa-exclamation-circle"></i> {surveyError}
            </div>
          )}

          {surveyLoading ? (
            <div style={{ textAlign: 'center', padding: 40, color: THEME.success }}>Loading surveys...</div>
          ) : (
          <>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              background: THEME.bgMuted,
              borderRadius: `${THEME.radius.md} ${THEME.radius.md} 0 0`,
              border: `1px solid ${THEME.border}`,
              borderBottom: 'none',
            }}>
              <div style={{ fontSize: 14, color: THEME.textSecondary }}>
                <i className="fas fa-clipboard-list" style={{ marginRight: 8, color: THEME.primary }}></i>
                Showing <strong style={{ color: THEME.textPrimary }}>{surveyList.length}</strong> of <strong>{surveyTotal}</strong> surveys
              </div>
              <div style={{ fontSize: 13, color: THEME.textMuted }}>
                Page {surveyPage} of {surveyTotalPages}
              </div>
            </div>

            <div style={{ overflowX: 'auto', borderRadius: 20, background: 'white', border: `1px solid ${THEME.border}`, borderTop: 'none' }}>
              <table>
                <thead>
                  <tr><th>Title</th><th>Questions</th><th>Responses</th><th>Reward Voucher</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {surveyList.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: THEME.success, padding: 40 }}>
                      <i className="fas fa-clipboard-list" style={{ fontSize: 40, display: 'block', marginBottom: 12 }}></i>
                      No surveys yet. Create one to start collecting feedback.
                    </td></tr>
                  ) : surveyList.map(survey => (
                    <tr key={survey.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{survey.title}</div>
                        {survey.description && <div style={{ fontSize: 12, color: THEME.success, marginTop: 2 }}>{survey.description}</div>}
                      </td>
                      <td><span className="badge badge-blue">{survey.questions?.length ?? 0}</span></td>
                      <td>{survey.response_count ?? 0}</td>
                      <td>
                        {survey.reward_voucher_id ? (
                          <span className="badge badge-green">{surveyRewardVoucherName(survey.reward_voucher_id)}</span>
                        ) : <span style={{ color: THEME.success }}>None</span>}
                      </td>
                      <td>
                        <button className="btn btn-sm" onClick={() => surveyToggleActive(survey)} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}>
                          <span className={`badge ${survey.is_active ? 'badge-green' : 'badge-gray'}`}>
                            {survey.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </button>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-sm" onClick={() => surveyOpenEdit(survey)}><i className="fas fa-edit"></i></button>
                          {surveyConfirmDelete === survey.id ? (
                            <>
                              <button className="btn btn-sm" style={{ background: '#EF4444', color: 'white' }} onClick={() => surveyHandleDelete(survey.id)}>Confirm</button>
                              <button className="btn btn-sm" onClick={() => setSurveyConfirmDelete(null)}>Cancel</button>
                            </>
                          ) : (
                            <button className="btn btn-sm" style={{ color: '#EF4444' }} onClick={() => setSurveyConfirmDelete(survey.id)}><i className="fas fa-trash"></i></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
          )}

          <Pagination page={surveyPage} totalPages={surveyTotalPages} onPageChange={fetchSurveyList} loading={surveyLoading} />
        </>
      )}
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
      {hint && <div style={{ fontSize: 11, color: THEME.success, marginTop: 3 }}><i className="fas fa-info-circle" style={{ marginRight: 4 }}></i>{hint}</div>}
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: THEME.primaryDark };
