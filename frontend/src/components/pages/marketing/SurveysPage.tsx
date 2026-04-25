'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/merchant-api';

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


interface SurveysPageProps {
  token: string;
  onSwitchToPromotions?: () => void;
}

export default function SurveysPage({ token, onSwitchToPromotions: _onSwitchToPromotions }: SurveysPageProps) {
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
      const res = await apiFetch(`/admin/surveys?${params}`);
      if (res.ok) {
        const data = await res.json();
        setSurveyList(data.surveys || []);
        setSurveyTotal(data.total || 0);
        setSurveyTotalPages(data.total_pages || 1);
        setSurveyPage(p);
      }
    } catch {} finally { setSurveyLoading(false); }
  }, []);

  useEffect(() => {
    if (viewMode === 'list') {
      fetchSurveyList(1);
    }
  }, [viewMode, fetchSurveyList]);

  useEffect(() => {
    if (viewMode === 'form') {
      apiFetch('/admin/vouchers')
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
      const res = await apiFetch(`/admin/surveys/${survey.id}`, undefined, {
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
        ? await apiFetch(`/admin/surveys/${surveyEditing.id}`, undefined, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiFetch('/admin/surveys', undefined, { method: 'POST', body: JSON.stringify(payload) });

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
      const res = await apiFetch(`/admin/surveys/${id}`, undefined, { method: 'DELETE' });
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
          <div className="sp-0">
            <button className="btn btn-sm" onClick={surveyCloseForm}>
              <i className="fas fa-arrow-left"></i> Back to Surveys
            </button>
            <h3 className="sp-1">{surveyEditing ? 'Edit Survey' : 'New Survey'}</h3>
          </div>

          <div className="card">
            {surveyError && (
              <div className="sp-2">
                <i className="fas fa-exclamation-circle"></i> {surveyError}
              </div>
            )}

            <form onSubmit={surveyHandleSubmit}>
              <div className="sp-3">
                <div>
                  <label className="form-label">Title *</label>
                  <input value={surveyTitle} onChange={e => setSurveyTitle(e.target.value)} required placeholder="e.g. Customer Satisfaction Survey" />
                </div>
                <div>
                  <label className="form-label">Reward Voucher</label>
                  <Select value={surveyRewardVoucherId} onChange={(val) => setSurveyRewardVoucherId(val)} options={[{ value: '', label: '— None —' }, ...surveyVouchers.map(v => ({ value: String(v.id), label: v.title || v.code }))]} />
                </div>
              </div>

              <div className="sp-4">
                <label className="form-label">Description</label>
                <textarea value={surveyDescription} onChange={e => setSurveyDescription(e.target.value)} placeholder="Survey description..." rows={2} className="sp-5" />
              </div>

              <div className="sp-6">
                <div className="sp-7">
                  <h4 className="sp-8">Questions ({surveyQuestions.length}/5)</h4>
                  <div className="sp-9">
                    {surveyQuestions.length >= 5 && <span className="sp-10">Maximum 5 questions</span>}
                    <button type="button" className="btn btn-sm btn-primary" onClick={surveyAddQuestion} disabled={surveyQuestions.length >= 5}>
                      <i className="fas fa-plus"></i> Add Question
                    </button>
                  </div>
                </div>

                {surveyQuestions.map((q, i) => (
                  <div key={i} className="sp-11">
                    <div className="sp-12">
                      <span className="sp-13">Q{i + 1}</span>
                      {surveyQuestions.length > 1 && (
                        <button type="button" className="btn btn-sm sp-14"  onClick={() => surveyRemoveQuestion(i)}>
                          <i className="fas fa-trash"></i>
                        </button>
                      )}
                    </div>
                    <div className="sp-15">
                      <input value={q.question_text} onChange={e => surveyUpdateQuestion(i, 'question_text', e.target.value)} placeholder="Question text" required />
                      <Select value={q.question_type} onChange={(val) => surveyUpdateQuestion(i, 'question_type', val)} options={[{ value: 'text', label: 'Text' }, { value: 'single_choice', label: 'Single Choice' }, { value: 'rating', label: 'Rating' }, { value: 'dropdown', label: 'Dropdown' }]} />
                    </div>
                    {(q.question_type === 'single_choice' || q.question_type === 'dropdown') && (
                      <div className="sp-16">
                        <input value={q.options} onChange={e => surveyUpdateQuestion(i, 'options', e.target.value)} placeholder="Options (comma-separated, e.g. Good, Okay, Bad)" className="sp-17" />
                      </div>
                    )}
                    <label className="sp-18">
                      <input type="checkbox" checked={q.required} onChange={e => surveyUpdateQuestion(i, 'required', e.target.checked)} className="sp-19" />
                      Required
                    </label>
                  </div>
                ))}
              </div>

              <div className="sp-20">
                <button type="submit" className="btn btn-primary" disabled={surveySaving}>
                  {surveySaving ? 'Saving...' : surveyEditing ? 'Update' : 'Create'}
                </button>
                <button type="button" className="btn" onClick={surveyCloseForm}>Cancel</button>
                <div className="sp-21" />
                <label className="sp-22">
                  <input type="checkbox" checked={surveyIsActive} onChange={e => setSurveyIsActive(e.target.checked)} className="sp-23" />
                  Active
                </label>
              </div>
            </form>
          </div>
        </>
      ) : (
        <>
          <div className="sp-24">
            <button className="btn btn-primary" onClick={surveyOpenCreate}><i className="fas fa-plus"></i> New Survey</button>
          </div>

          {surveyError && (
            <div className="sp-25">
              <i className="fas fa-exclamation-circle"></i> {surveyError}
            </div>
          )}

          {surveyLoading ? (
            <div className="sp-26">Loading surveys...</div>
          ) : (
          <>
            <div className="sp-27">
              <div className="sp-28">
                <span className="sp-29"><i className="fas fa-clipboard-list"></i></span>
                Showing <strong className="sp-30">{surveyList.length}</strong> of <strong>{surveyTotal}</strong> surveys
              </div>
              <div className="sp-31">
                Page {surveyPage} of {surveyTotalPages}
              </div>
            </div>

            <div className="sp-32">
              <table>
                <thead>
                  <tr><th>Title</th><th>Questions</th><th>Responses</th><th>Reward Voucher</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {surveyList.length === 0 ? (
                    <tr><td colSpan={6} className="sp-33">
                      <span className="sp-34"><i className="fas fa-clipboard-list"></i></span>
                      No surveys yet. Create one to start collecting feedback.
                    </td></tr>
                  ) : surveyList.map(survey => (
                    <tr key={survey.id}>
                      <td>
                        <div className="sp-35">{survey.title}</div>
                        {survey.description && <div className="sp-36">{survey.description}</div>}
                      </td>
                      <td><span className="badge badge-blue">{survey.questions?.length ?? 0}</span></td>
                      <td>{survey.response_count ?? 0}</td>
                      <td>
                        {survey.reward_voucher_id ? (
                          <span className="badge badge-green">{surveyRewardVoucherName(survey.reward_voucher_id)}</span>
                        ) : <span className="sp-37">None</span>}
                      </td>
                      <td>
                        <button className="btn btn-sm sp-38" onClick={() => surveyToggleActive(survey)} >
                          <span className={`badge ${survey.is_active ? 'badge-green' : 'badge-gray'}`}>
                            {survey.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </button>
                      </td>
                      <td>
                        <div className="sp-39">
                          <button className="btn btn-sm" onClick={() => surveyOpenEdit(survey)}><i className="fas fa-edit"></i></button>
                          {surveyConfirmDelete === survey.id ? (
                            <>
                              <button className="btn btn-sm sp-40"  onClick={() => surveyHandleDelete(survey.id)}>Confirm</button>
                              <button className="btn btn-sm" onClick={() => setSurveyConfirmDelete(null)}>Cancel</button>
                            </>
                          ) : (
                            <button className="btn btn-sm sp-41"  onClick={() => setSurveyConfirmDelete(survey.id)}><i className="fas fa-trash"></i></button>
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
