'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import { Select, Pagination, DataTableExpandableRow, ColumnDef } from '@/components/ui';

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

export default function SurveyReportPage() {
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
        const list = Array.isArray(data) ? data : (data.items || []);
        setSurveys(list.filter((s: SurveyListItem) => s.response_count > 0));
      }
    } catch { console.error('Failed to fetch surveys'); }
  }, []);

  useEffect(() => { fetchSurveys(); }, [fetchSurveys]);

  const fetchResponses = useCallback(async (p: number) => {
    if (!selectedSurvey) return;
    setLoading(true);
    try {
      const res = await apiFetch(
        `/admin/surveys/${selectedSurvey}/responses?page=${p}&page_size=${PAGE_SIZE}`
      );
      if (res.ok) {
        const data = await res.json();
        setResponses(data.items || []);
        setTotalPages(data.total_pages || 1);
        setTotalResponses(data.total || 0);
        setSurveyTitle(data.survey_title || '');
        setPage(p);
      }
    } catch { console.error('Failed to fetch responses'); } finally { setLoading(false); }
  }, [selectedSurvey]);

  useEffect(() => {
    if (selectedSurvey) fetchResponses(1);
  }, [selectedSurvey, fetchResponses]);

  const renderAnswer = (answer: SurveyResponse['answers'][0]) => {
    if (answer.question_type === 'rating') {
      const stars = answer.answer ? parseInt(answer.answer) : 0;
      return (
        <div>
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className="srp-star" style={{ color: i < stars ? '#F59E0B' : '#D1D5DB' }}>★</span>
          ))}
        </div>
      );
    }
    return <span className="ra-0">{answer.answer || '—'}</span>;
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
        return <span className="srpt-idx">{(page - 1) * PAGE_SIZE + idx + 1}</span>;
      },
      width: '60px'
    },
    {
      key: 'user_name',
      header: 'Customer',
      render: (r) => (
          <div className="srpt-customer">
            <div className="srpt-name">{r.user_name}</div>
            {r.user_email && <div className="srpt-email">{r.user_email}</div>}
          </div>
      )
    },
    {
      key: 'created_at',
      header: 'Submitted',
      render: (r) => <span className="srpt-date">{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</span>
    },
    {
      key: 'rewarded',
      header: 'Rewarded',
      render: (r) => (
        <span className="srp-reward-badge" style={{
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
    <div className="rec-5">
      {response.answers.map((a, ai) => (
        <div key={ai}>
          <div className="rec-6">
            Q{ai + 1}: {a.question_text}
            <span className="rec-7">({a.question_type})</span>
          </div>
          <div className="rec-8">
            {renderAnswer(a)}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <h3 className="srpt-title">
        <span className="srpt-title-icon"><i className="fas fa-chart-bar"></i></span>
        Survey Responses
      </h3>

      {/* Survey Selector using standardized Select component */}
      <div className="srpt-selector">
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
          <p className="srpt-empty">
            No surveys with responses yet.
          </p>
        )}
      </div>

      {selectedSurvey && (
        <>
          {/* Stats Bar */}
          <div className="srpt-stats">
            <div className="srpt-stats-left">
              <span className="srpt-stats-icon"><i className="fas fa-inbox"></i></span>
              Showing <strong className="srpt-stats-count">{responses.length}</strong> of <strong className="srpt-stats-total">{totalResponses}</strong> responses
            </div>
            <div className="srpt-stats-page">
              Page {page} of {totalPages}
            </div>
          </div>

          {/* Responses Table - using DataTableExpandableRow */}
          <div className="srpt-table">
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
