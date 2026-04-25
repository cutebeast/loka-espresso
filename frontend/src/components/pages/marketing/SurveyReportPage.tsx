'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import { THEME } from '@/lib/theme';
import { Select, Pagination, DataTableExpandableRow, ColumnDef } from '@/components/ui';

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
  const [_surveyTitle, setSurveyTitle] = useState('');
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResponses, setTotalResponses] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchSurveys = useCallback(async () => {
    try {
      const res = await apiFetch('/admin/surveys?page_size=200');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.surveys || []);
        setSurveys(list.filter((s: SurveyListItem) => s.response_count > 0));
      }
    } catch {}
  }, []);

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

  const surveyOptions = surveys.map(s => ({
    value: String(s.id),
    label: `${s.title} (${s.response_count} responses)`
  }));

  // Column definitions for responses table
  const responseColumns: ColumnDef<SurveyResponse>[] = [
    {
      key: 'index',
      header: '#',
      render: (r) => {
        const idx = responses.findIndex(item => item.id === r.id);
        return <span style={{ color: '#6B635E' }}>{(page - 1) * PAGE_SIZE + idx + 1}</span>;
      },
      width: '60px'
    },
    {
      key: 'user_name',
      header: 'Customer',
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600, color: '#2C1E16' }}>{r.user_name}</div>
          {r.user_email && <div style={{ fontSize: 12, color: '#6B635E' }}>{r.user_email}</div>}
        </div>
      )
    },
    {
      key: 'created_at',
      header: 'Submitted',
      render: (r) => <span style={{ color: '#6B635E' }}>{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</span>
    },
    {
      key: 'rewarded',
      header: 'Rewarded',
      render: (r) => (
        <span style={{
          padding: '4px 10px',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          background: r.rewarded ? '#ECFDF5' : '#FEF2F2',
          color: r.rewarded ? '#065F46' : '#991B1B',
        }}>
          {r.rewarded ? 'Yes' : 'No'}
        </span>
      ),
      width: '100px'
    },
  ];

  // Render expanded content for a response
  const renderExpandedContent = (response: SurveyResponse) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {response.answers.map((a, ai) => (
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
  );

  return (
    <div>
      <h3 style={{ margin: '0 0 20px', color: THEME.textPrimary }}>
        <i className="fas fa-chart-bar" style={{ marginRight: 8, color: THEME.primary }}></i>
        Survey Responses
      </h3>

      {/* Survey Selector using standardized Select component */}
      <div style={{ marginBottom: 20 }}>
        <Select
          label="Select Survey"
          value={selectedSurvey ? String(selectedSurvey) : ''}
          onChange={(val) => { 
            setSelectedSurvey(val ? Number(val) : null); 
          }}
          options={surveyOptions}
          placeholder="— Select a survey —"
        />
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

          {/* Responses Table - using DataTableExpandableRow */}
          <div style={{
            borderRadius: `0 0 ${THEME.radius.md} ${THEME.radius.md}`,
            background: THEME.bgCard,
            border: `1px solid ${THEME.border}`,
            borderTop: 'none',
            overflow: 'hidden',
          }}>
            <DataTableExpandableRow
              data={responses}
              columns={responseColumns}
              getRowId={(r) => r.id}
              renderExpandedContent={renderExpandedContent}
              expandColumnHeader="Details"
              emptyMessage="No responses found for this survey."
              loading={loading}
            />
          </div>

          {/* Using standardized Pagination component */}
          <Pagination page={page} totalPages={totalPages} onPageChange={fetchResponses} loading={loading} />
        </>
      )}
    </div>
  );
}
