'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import { Select } from '@/components/ui';
import { THEME } from '@/lib/theme';

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

interface SurveysPageProps {
  token: string;
}

const emptyQuestion = (): SurveyQuestion => ({
  question_text: '',
  question_type: 'text',
  options: '',
  required: false,
  sort_order: 0,
});

export default function SurveysPage({ token }: SurveysPageProps) {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSurvey, setEditingSurvey] = useState<Survey | null>(null);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [vouchers, setVouchers] = useState<any[]>([]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [rewardVoucherId, setRewardVoucherId] = useState('');
  const [questions, setQuestions] = useState<SurveyQuestion[]>([emptyQuestion()]);
  const [saving, setSaving] = useState(false);

  const fetchSurveys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/admin/surveys', token);
      if (res.ok) {
        const data = await res.json();
        setSurveys(Array.isArray(data) ? data : (data.surveys ?? data.data ?? []));
      }
    } catch {} finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchSurveys(); }, [fetchSurveys]);

  useEffect(() => {
    if (showForm) {
      apiFetch('/admin/vouchers', token)
        .then(r => r.ok ? r.json() : [])
        .then(d => setVouchers(Array.isArray(d) ? d : (d.vouchers ?? [])))
        .catch(() => {});
    }
  }, [showForm, token]);

  function openCreate() {
    setEditingSurvey(null);
    setTitle('');
    setDescription('');
    setIsActive(true);
    setRewardVoucherId('');
    setQuestions([emptyQuestion()]);
    setError('');
    setShowForm(true);
  }

  function openEdit(survey: Survey) {
    setEditingSurvey(survey);
    setTitle(survey.title);
    setDescription(survey.description || '');
    setIsActive(survey.is_active);
    setRewardVoucherId(survey.reward_voucher_id != null ? String(survey.reward_voucher_id) : '');
    setQuestions(survey.questions?.length ? survey.questions.map(q => ({
      ...q,
      options: Array.isArray(q.options) ? q.options.join(', ') : (q.options || ''),
    })) : [emptyQuestion()]);
    setError('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingSurvey(null);
    setError('');
    fetchSurveys();
  }

  async function toggleActive(survey: Survey) {
    setError('');
    try {
      const res = await apiFetch(`/admin/surveys/${survey.id}`, token, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !survey.is_active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || 'Failed to toggle');
        return;
      }
      fetchSurveys();
    } catch (err: any) {
      setError(err.message || 'Network error');
    }
  }

  function addQuestion() {
    if (questions.length >= 5) {
      setError('Maximum 5 questions per survey');
      return;
    }
    setQuestions(prev => [...prev, { ...emptyQuestion(), sort_order: prev.length }]);
  }

  function removeQuestion(index: number) {
    setQuestions(prev => prev.filter((_, i) => i !== index).map((q, i) => ({ ...q, sort_order: i })));
  }

  function updateQuestion(index: number, field: keyof SurveyQuestion, value: any) {
    setQuestions(prev => prev.map((q, i) => i === index ? { ...q, [field]: value } : q));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const payload = {
      title,
      description,
      is_active: isActive,
      reward_voucher_id: rewardVoucherId ? Number(rewardVoucherId) : null,
      questions: questions.map((q, i) => ({
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
      const res = editingSurvey
        ? await apiFetch(`/admin/surveys/${editingSurvey.id}`, token, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiFetch('/admin/surveys', token, { method: 'POST', body: JSON.stringify(payload) });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || `Failed (${res.status})`);
        return;
      }
      closeForm();
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    try {
      const res = await apiFetch(`/admin/surveys/${id}`, token, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || 'Delete failed');
        return;
      }
      setConfirmDelete(null);
      fetchSurveys();
    } catch { setError('Network error'); }
  }

  const rewardVoucherName = (id: number | null) => {
    if (!id) return '—';
    const v = vouchers.find(v => v.id === id);
    return v ? v.title || v.code : `#${id}`;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 20 }}>
        <button className="btn btn-primary" onClick={openCreate}><i className="fas fa-plus"></i> New Survey</button>
      </div>

      {error && !showForm && (
        <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          <i className="fas fa-exclamation-circle"></i> {error}
        </div>
      )}

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h4 style={{ margin: 0 }}>{editingSurvey ? 'Edit Survey' : 'New Survey'}</h4>
            <button className="btn btn-sm" onClick={() => { setShowForm(false); setEditingSurvey(null); setError(''); }}><i className="fas fa-times"></i></button>
          </div>

          {error && (
            <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
              <i className="fas fa-exclamation-circle"></i> {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Title *</label>
                <input value={title} onChange={e => setTitle(e.target.value)} required placeholder="e.g. Customer Satisfaction Survey" />
              </div>
              <div>
                <label style={labelStyle}>Reward Voucher</label>
                <Select value={rewardVoucherId} onChange={(val) => setRewardVoucherId(val)} options={[{ value: '', label: '— None —' }, ...vouchers.map(v => ({ value: String(v.id), label: v.title || v.code }))]} />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Survey description..." rows={2} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 14, resize: 'vertical' }} />
            </div>

            <div style={{ borderTop: '1px solid #ECF1F7', paddingTop: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h4 style={{ margin: 0 }}>Questions ({questions.length}/5)</h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {questions.length >= 5 && <span style={{ fontSize: 11, color: '#94A3B8' }}>Maximum 5 questions</span>}
                  <button type="button" className="btn btn-sm btn-primary" onClick={addQuestion} disabled={questions.length >= 5}>
                    <i className="fas fa-plus"></i> Add Question
                  </button>
                </div>
              </div>

              {questions.map((q, i) => (
                <div key={i} style={{ background: '#F8FAFC', borderRadius: 10, padding: 12, marginBottom: 8, border: '1px solid #ECF1F7' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: THEME.textSecondary }}>Q{i + 1}</span>
                    {questions.length > 1 && (
                      <button type="button" className="btn btn-sm" style={{ color: '#EF4444' }} onClick={() => removeQuestion(i)}>
                        <i className="fas fa-trash"></i>
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 8 }}>
                    <input value={q.question_text} onChange={e => updateQuestion(i, 'question_text', e.target.value)} placeholder="Question text" required />
                    <Select value={q.question_type} onChange={(val) => updateQuestion(i, 'question_type', val)} options={[{ value: 'text', label: 'Text' }, { value: 'single_choice', label: 'Single Choice' }, { value: 'rating', label: 'Rating' }, { value: 'dropdown', label: 'Dropdown' }]} />
                  </div>
                  {(q.question_type === 'single_choice' || q.question_type === 'dropdown') && (
                    <div style={{ marginBottom: 8 }}>
                      <input value={q.options} onChange={e => updateQuestion(i, 'options', e.target.value)} placeholder="Options (comma-separated, e.g. Good, Okay, Bad)" style={{ width: '100%' }} />
                    </div>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={q.required} onChange={e => updateQuestion(i, 'required', e.target.checked)} style={{ width: 14, height: 14 }} />
                    Required
                  </label>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : editingSurvey ? 'Update' : 'Create'}
              </button>
              <button type="button" className="btn" onClick={() => { setShowForm(false); setEditingSurvey(null); setError(''); }}>Cancel</button>
              <div style={{ flex: 1 }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} style={{ width: 16, height: 16 }} />
                Active
              </label>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>Loading surveys...</div>
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
              Showing <strong style={{ color: THEME.textPrimary }}>{surveys.length}</strong> surveys
            </div>
          </div>

          <div style={{ overflowX: 'auto', borderRadius: 20, background: 'white', border: `1px solid ${THEME.border}`, borderTop: 'none' }}>
            <table>
            <thead>
              <tr><th>Title</th><th>Questions</th><th>Responses</th><th>Reward Voucher</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {surveys.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94A3B8', padding: 40 }}>
                  <i className="fas fa-clipboard-list" style={{ fontSize: 40, display: 'block', marginBottom: 12 }}></i>
                  No surveys yet. Create one to start collecting feedback.
                </td></tr>
              ) : surveys.map(survey => (
                <tr key={survey.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{survey.title}</div>
                    {survey.description && <div style={{ fontSize: 12, color: THEME.textMuted, marginTop: 2 }}>{survey.description}</div>}
                  </td>
                  <td><span className="badge badge-blue">{survey.questions?.length ?? 0}</span></td>
                  <td>{survey.response_count ?? 0}</td>
                  <td>
                    {survey.reward_voucher_id ? (
                      <span className="badge badge-green">{rewardVoucherName(survey.reward_voucher_id)}</span>
                    ) : <span style={{ color: '#94A3B8' }}>None</span>}
                  </td>
                  <td>
                    <button className="btn btn-sm" onClick={() => toggleActive(survey)} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}>
                      <span className={`badge ${survey.is_active ? 'badge-green' : 'badge-gray'}`}>
                        {survey.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </button>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm" onClick={() => openEdit(survey)}><i className="fas fa-edit"></i></button>
                      {confirmDelete === survey.id ? (
                        <>
                          <button className="btn btn-sm" style={{ background: '#EF4444', color: 'white' }} onClick={() => handleDelete(survey.id)}>Confirm</button>
                          <button className="btn btn-sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
                        </>
                      ) : (
                        <button className="btn btn-sm" style={{ color: '#EF4444' }} onClick={() => setConfirmDelete(survey.id)}><i className="fas fa-trash"></i></button>
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
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: THEME.textSecondary };
