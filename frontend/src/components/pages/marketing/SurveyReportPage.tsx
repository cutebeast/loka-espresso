'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import { THEME } from '@/lib/theme';
import { Pagination } from '@/components/ui';

interface SurveyReportPageProps {
  token: string;
}

interface SurveyListItem {
  id: number;
  title: string;
  is_active: boolean;
  question_count: number;
  response_count: number;
  created_at: string;
}

interface SurveyResponse {
  id: number;
  user_name: string;
  user_email: string | null;
  rewarded: boolean;
  created_at: string;
  answers: {
    question_id: number;
    question_text: string;
    question_type: string;
    answer: string | null;
  }[];
}

const PAGE_SIZE = 10;

export default function SurveyReportPage({ token }: SurveyReportPageProps) {
  const [surveys, setSurveys] = useState<SurveyListItem[]>([]);
  const [selectedSurvey, setSelectedSurvey] = useState<number | null>(null);
  const [surveyTitle, setSurveyTitle] = useState('');
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResponses, setTotalResponses] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedResponse, setExpandedResponse] = useState<number | null>(null);

  const fetchSurveys = useCallback(async () => {
    try {
      const res = await apiFetch('/admin/surveys?page_size=200', token);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.surveys || []);
        setSurveys(list.filter((s: SurveyListItem) => s.response_count > 0));
      }
    } catch {}
  }, [token]);

  useEffect(() => { fetchSurveys(); }, [fetchSurveys]);

  const fetchResponses = useCallback(async (p: number) => {
    if (!selectedSurvey) return;
    setLoading(true);
    try {
      const res = await apiFetch(
        `/admin/surveys/${selectedSurvey}/responses?page=${p}&page_size=${PAGE_SIZE}`,
        token
      );
      if (res.ok) {
        const data = await res.json();
        setResponses(data.responses || []);
        setTotalPages(data.total_pages || 1);
        setTotalResponses(data.total || 0);
        setSurveyTitle(data.survey_title || '');
        setPage(p);
      }
    } catch {} finally { setLoading(false); }
  }, [selectedSurvey, token]);

  useEffect(() => {
    if (selectedSurvey) fetchResponses(1);
  }, [selectedSurvey, fetchResponses]);

  const renderAnswer = (answer: SurveyResponse['answers'][0]) => {
    if (answer.question_type === 'rating') {
      const stars = answer.answer ? parseInt(answer.answer) : 0;
      return (
        <div>
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} style={{ color: i < stars ? '#F59E0B' : '#D1D5DB', fontSize: 16 }}>★</span>
          ))}
        </div>
      );
    }
    return <span style={{ color: THEME.textPrimary }}>{answer.answer || '—'}</span>;
  };

  return (
    <div>
      <h3 style={{ margin: '0 0 20px', color: THEME.textPrimary }}>
        <i className="fas fa-chart-bar" style={{ marginRight: 8, color: THEME.primary }}></i>
        Survey Responses
      </h3>

      {/* Survey Selector */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: THEME.textSecondary, display: 'block', marginBottom: 6 }}>
          Select Survey
        </label>
        <select
          value={selectedSurvey || ''}
          onChange={(e) => { setSelectedSurvey(e.target.value ? Number(e.target.value) : null); setExpandedResponse(null); }}
          style={{
            padding: '8px 12px',
            borderRadius: THEME.radius.md,
            border: `1px solid ${THEME.border}`,
            background: THEME.bgCard,
            color: THEME.textPrimary,
            fontSize: 14,
            minWidth: 300,
          }}
        >
          <option value="">— Select a survey —</option>
          {surveys.map(s => (
            <option key={s.id} value={s.id}>
              {s.title} ({s.response_count} responses)
            </option>
          ))}
        </select>
        {surveys.length === 0 && (
          <p style={{ fontSize: 13, color: THEME.textMuted, marginTop: 8 }}>
            No surveys with responses yet.
          </p>
        )}
      </div>

      {selectedSurvey && (
        <>
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
          }}>
            <div style={{ fontSize: 14, color: THEME.textSecondary }}>
              <i className="fas fa-inbox" style={{ marginRight: 8, color: THEME.primary }}></i>
              Showing <strong style={{ color: THEME.textPrimary }}>{responses.length}</strong> of <strong style={{ color: THEME.textPrimary }}>{totalResponses}</strong> responses
            </div>
            <div style={{ fontSize: 13, color: THEME.textMuted }}>
              Page {page} of {totalPages}
            </div>
          </div>

          {/* Responses Table */}
          <div style={{
            borderRadius: `0 0 ${THEME.radius.md} ${THEME.radius.md}`,
            background: THEME.bgCard,
            border: `1px solid ${THEME.border}`,
            borderTop: 'none',
            overflow: 'hidden',
          }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: THEME.textMuted }}>
                <i className="fas fa-spinner fa-spin" style={{ fontSize: 24, marginBottom: 12 }}></i>
                <p>Loading responses...</p>
              </div>
            ) : responses.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: THEME.textMuted }}>
                <i className="fas fa-inbox" style={{ fontSize: 32, marginBottom: 12 }}></i>
                <p>No responses found for this survey.</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: THEME.bgMuted }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: THEME.textMuted, borderBottom: `1px solid ${THEME.border}` }}>#</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: THEME.textMuted, borderBottom: `1px solid ${THEME.border}` }}>Customer</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: THEME.textMuted, borderBottom: `1px solid ${THEME.border}` }}>Submitted</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: THEME.textMuted, borderBottom: `1px solid ${THEME.border}` }}>Rewarded</th>
                    <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: THEME.textMuted, borderBottom: `1px solid ${THEME.border}` }}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {responses.map((r, idx) => (
                    <>
                      <tr key={r.id} style={{ borderBottom: `1px solid ${THEME.border}`, background: expandedResponse === r.id ? THEME.bgMuted : 'transparent' }}>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: THEME.textMuted }}>{(page - 1) * PAGE_SIZE + idx + 1}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13 }}>
                          <div style={{ fontWeight: 600, color: THEME.textPrimary }}>{r.user_name}</div>
                          {r.user_email && <div style={{ fontSize: 11, color: THEME.textMuted }}>{r.user_email}</div>}
                        </td>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: THEME.textSecondary }}>
                          {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            background: r.rewarded ? '#ECFDF5' : '#FEF2F2',
                            color: r.rewarded ? '#065F46' : '#991B1B',
                          }}>
                            {r.rewarded ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                          <button
                            className="btn btn-sm"
                            onClick={() => setExpandedResponse(expandedResponse === r.id ? null : r.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: THEME.primary,
                              fontSize: 14,
                            }}
                          >
                            <i className={`fas fa-chevron-${expandedResponse === r.id ? 'up' : 'down'}`}></i>
                          </button>
                        </td>
                      </tr>
                      {expandedResponse === r.id && (
                        <tr>
                          <td colSpan={5} style={{ padding: '16px 24px', background: THEME.bgMuted, borderBottom: `1px solid ${THEME.border}` }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                              {r.answers.map((a, ai) => (
                                <div key={ai}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: THEME.textSecondary, marginBottom: 4 }}>
                                    Q{ai + 1}: {a.question_text}
                                    <span style={{ fontWeight: 400, color: THEME.textMuted, marginLeft: 8 }}>({a.question_type})</span>
                                  </div>
                                  <div style={{ fontSize: 14, color: THEME.textPrimary, paddingLeft: 12, borderLeft: `2px solid ${THEME.primary}` }}>
                                    {renderAnswer(a)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <Pagination page={page} totalPages={totalPages} onPageChange={fetchResponses} loading={loading} />
        </>
      )}
    </div>
  );
}
