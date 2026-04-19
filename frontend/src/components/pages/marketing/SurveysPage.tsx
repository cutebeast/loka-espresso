'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import { THEME } from '@/lib/theme';
import { Select, Pagination } from '@/components/ui';

export interface SurveyQuestion {
  id?: number;
  question_text: string;
  question_type: 'text' | 'single_choice' | 'rating' | 'dropdown';
  options: string;
  required: boolean;
  sort_order: number;
}

export interface Survey {
  id: number;
  title: string;
  description: string;
  is_active: boolean;
  reward_voucher_id: number | null;
  questions: SurveyQuestion[];
  response_count?: number;
  created_at: string;
}

export const emptySurveyQuestion = (): SurveyQuestion => ({
  question_text: '',
  question_type: 'text',
  options: '',
  required: false,
  sort_order: 0,
});

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: THEME.primaryDark };

interface SurveysPageProps {
  token: string;
  onSwitchToPromotions?: () => void;
}

export default function SurveysPage({ token, onSwitchToPromotions }: SurveysPageProps) {
  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');

  // Survey pagination
  const [surveyList, setSurveyList] = useState<Survey[]>([]);
  const [surveyPage, setSurveyPage] = useState(1);
  const [surveyTotal, setSurveyTotal] = useState(0);
  const [surveyTotalPages, setSurveyTotalPages] = useState(1);
  const [surveyLoading, setSurveyLoading] = useState(false);

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

  useEffect(() => {
    if (viewMode === 'list') {
      fetchSurveyList(1);
    }
  }, [viewMode, fetchSurveyList]);

  useEffect(() => {
    if (viewMode === 'form') {
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
    setViewMode('form');
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
    setViewMode('form');
  }

  function surveyCloseForm() {
    setViewMode('list');
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

  return (
    <>
      {viewMode === 'form' ? (
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
      ) : (
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
    </>
  );
}
