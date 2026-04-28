'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/merchant-api';

import { Select, DataTable, type ColumnDef, Drawer } from '@/components/ui';

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
        setSurveyList(data.items || []);
        setSurveyTotal(data.total || 0);
        setSurveyTotalPages(data.total_pages || 1);
        setSurveyPage(p);
      }
    } catch { console.error('Failed to fetch surveys'); } finally { setSurveyLoading(false); }
  }, []);

  useEffect(() => {
    if (viewMode === 'list') {
      fetchSurveyList(1);
    }
  }, [viewMode, fetchSurveyList]);

  useEffect(() => {
    if (viewMode === 'form') {
      apiFetch('/admin/vouchers')
        .then(r => r.ok ? r.json() : { items: [] })
        .then(d => setSurveyVouchers(Array.isArray(d) ? d : (d.items ?? [])))
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

  async function surveyHandleSubmit() {
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

  function handleViewResponses(_survey: Survey) {}

  const surveyRewardVoucherName = (id: number | null) => {
    if (!id) return '—';
    const v = surveyVouchers.find(v => v.id === id);
    return v ? v.title || v.code : `#${id}`;
  };

  const surveyColumns: ColumnDef<Survey>[] = [
    {
      key: 'title',
      header: 'Title',
      render: (row) => (
        <div>
          <div className="sv-35">{row.title}</div>
          {row.description && <div className="sv-36">{row.description}</div>}
        </div>
      ),
    },
    {
      key: 'questions',
      header: 'Questions',
      render: (row) => (
        <span className="badge badge-blue">{row.questions?.length ?? 0}</span>
      ),
    },
    {
      key: 'responses',
      header: 'Responses',
      render: (row) => <>{row.response_count ?? 0}</>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <button className="btn btn-sm sv-38" onClick={() => surveyToggleActive(row)}>
          <span className={`badge ${row.is_active ? 'badge-green' : 'badge-gray'}`}>
            {row.is_active ? 'Active' : 'Inactive'}
          </span>
        </button>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="sv-39">
          <button className="btn btn-sm" onClick={() => surveyOpenEdit(row)}><i className="fas fa-edit"></i></button>
          <button className="btn btn-sm" onClick={() => handleViewResponses(row)}><i className="fas fa-reply"></i></button>
          {surveyConfirmDelete === row.id ? (
            <>
              <button className="btn btn-sm sv-40" onClick={() => surveyHandleDelete(row.id)}>Confirm</button>
              <button className="btn btn-sm" onClick={() => setSurveyConfirmDelete(null)}>Cancel</button>
            </>
          ) : (
            <button className="btn btn-sm sv-41" onClick={() => setSurveyConfirmDelete(row.id)}><i className="fas fa-trash"></i></button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <Drawer isOpen={viewMode === 'form'} onClose={surveyCloseForm} title={surveyEditing ? 'Edit Survey' : 'New Survey'}>
        {surveyError && (
          <div className="sv-2">
            <i className="fas fa-exclamation-circle"></i> {surveyError}
          </div>
        )}

        <div className="df-section">
          <div className="df-grid">
            <div className="df-field">
              <label className="df-label">Title *</label>
              <input value={surveyTitle} onChange={e => setSurveyTitle(e.target.value)} required placeholder="e.g. Customer Satisfaction Survey" />
            </div>
            <div className="df-field">
              <label className="df-label">Reward Voucher</label>
              <Select value={surveyRewardVoucherId} onChange={(val) => setSurveyRewardVoucherId(val)} options={[{ value: '', label: '— None —' }, ...surveyVouchers.map(v => ({ value: String(v.id), label: v.title || v.code }))]} />
            </div>
          </div>
          <div className="df-field" style={{ marginBottom: 16 }}>
            <label className="df-label">Description</label>
            <textarea value={surveyDescription} onChange={e => setSurveyDescription(e.target.value)} placeholder="Survey description..." rows={2} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 className="cdp-section-title" style={{ margin: 0 }}>Questions ({surveyQuestions.length}/5)</h4>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {surveyQuestions.length >= 5 && <span style={{ fontSize: 12, color: '#DC2626' }}>Maximum 5</span>}
                <button className="btn btn-sm btn-primary" onClick={surveyAddQuestion} disabled={surveyQuestions.length >= 5}>
                  <i className="fas fa-plus"></i> Add
                </button>
              </div>
            </div>

            {surveyQuestions.map((q, i) => (
              <div key={i} className="sv-11">
                <div className="sv-12">
                  <span className="sv-13">Q{i + 1}</span>
                  {surveyQuestions.length > 1 && (
                    <button className="btn btn-sm sv-14" onClick={() => surveyRemoveQuestion(i)}>
                      <i className="fas fa-trash"></i>
                    </button>
                  )}
                </div>
                <div className="sv-15">
                  <input value={q.question_text} onChange={e => surveyUpdateQuestion(i, 'question_text', e.target.value)} placeholder="Question text" required />
                  <Select value={q.question_type} onChange={(val) => surveyUpdateQuestion(i, 'question_type', val)} options={[{ value: 'text', label: 'Text' }, { value: 'single_choice', label: 'Single Choice' }, { value: 'rating', label: 'Rating' }, { value: 'dropdown', label: 'Dropdown' }]} />
                </div>
                {(q.question_type === 'single_choice' || q.question_type === 'dropdown') && (
                  <div className="sv-16">
                    <input value={q.options} onChange={e => surveyUpdateQuestion(i, 'options', e.target.value)} placeholder="Options (comma-separated, e.g. Good, Okay, Bad)" className="sv-17" />
                  </div>
                )}
                <label className="sv-18">
                  <input type="checkbox" checked={q.required} onChange={e => surveyUpdateQuestion(i, 'required', e.target.checked)} className="sv-19" />
                  Required
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="df-actions">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, marginRight: 'auto' }}>
            <input type="checkbox" checked={surveyIsActive} onChange={e => setSurveyIsActive(e.target.checked)} style={{ width: 16, height: 16 }} />
            Active
          </label>
          <button className="btn" onClick={surveyCloseForm}>Cancel</button>
          <button onClick={surveyHandleSubmit} className="btn btn-primary" disabled={surveySaving}>
            {surveySaving ? 'Saving...' : surveyEditing ? 'Update' : 'Create'}
          </button>
        </div>
      </Drawer>

      <div className="sv-24">
        <button className="btn btn-primary" onClick={surveyOpenCreate}><i className="fas fa-plus"></i> New Survey</button>
      </div>

      {surveyError && (
        <div className="sv-25">
          <i className="fas fa-exclamation-circle"></i> {surveyError}
        </div>
      )}

      <div className="sv-27">
        <div className="sv-28">
          <span className="sv-29"><i className="fas fa-clipboard-list"></i></span>
          Showing <strong className="sv-30">{surveyList.length}</strong> of <strong>{surveyTotal}</strong> surveys
        </div>
        <div className="sv-31">
          Page {surveyPage} of {surveyTotalPages}
        </div>
      </div>

      <DataTable
        data={surveyList}
        columns={surveyColumns}
        loading={surveyLoading}
        emptyMessage="No surveys yet. Create one to start collecting feedback."
        pagination={{ page: surveyPage, pageSize: PAGE_SIZE, total: surveyTotal, onPageChange: fetchSurveyList }}
      />
    </div>
  );
}
