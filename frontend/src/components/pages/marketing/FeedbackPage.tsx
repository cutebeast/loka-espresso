'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import { DateFilter, type DatePreset, calcDateRange } from '@/components/ui/DateFilter';
import { BarChart, Modal, TextArea } from '@/components/ui';
import { THEME } from '@/lib/theme';

interface FeedbackPageProps {
  token: string;
  selectedStore: string;
}

interface FeedbackStats {
  average_rating: number;
  total_reviews: number;
  rating_distribution: Record<number, number>;
}

interface Feedback {
  id: number;
  customer_name: string;
  rating: number;
  store_name: string;
  comment: string;
  reply: string | null;
  created_at: string;
}

export default function FeedbackPage({ token, selectedStore }: FeedbackPageProps) {
  const [feedbackList, setFeedbackList] = useState<Feedback[]>([]);
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalFeedback, setModalFeedback] = useState<Feedback | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isEdit, setIsEdit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [preset, setPreset] = useState<DatePreset>('MTD');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const storeParam = selectedStore === 'all' ? '' : `?store_id=${selectedStore}`;
      const joinChar = storeParam ? '&' : '?';
      const range = fromDate && toDate ? `${joinChar}from_date=${fromDate}T00:00:00&to_date=${toDate}T23:59:59` : '';
      const [fbRes, statsRes] = await Promise.all([
        apiFetch(`/admin/feedback${storeParam}${range}`, token),
        apiFetch(`/admin/feedback/stats${storeParam}${range}`, token),
      ]);
      if (fbRes.ok) {
        const fbData = await fbRes.json();
        setFeedbackList(Array.isArray(fbData) ? fbData : fbData.data ?? []);
      }
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.data ?? statsData);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [token, selectedStore, fromDate, toDate]);

  useEffect(() => {
    const range = calcDateRange(preset);
    setFromDate(range.from);
    setToDate(range.to);
  }, [preset]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function renderStars(rating: number) {
    return (
      <span style={{ color: THEME.warning, fontSize: 16 }}>
        {'★'.repeat(rating) + '☆'.repeat(5 - rating)}
      </span>
    );
  }

  function openReplyModal(feedback: Feedback) {
    setModalFeedback(feedback);
    setReplyText('');
    setIsEdit(false);
    setShowModal(true);
  }

  function openEditModal(feedback: Feedback) {
    setModalFeedback(feedback);
    setReplyText(feedback.reply || '');
    setIsEdit(true);
    setShowModal(true);
  }

  async function submitReply() {
    if (!modalFeedback || !replyText.trim()) return;
    setSubmitting(true);
    try {
      const endpoint = `/admin/feedback/${modalFeedback.id}/reply`;
      const method = isEdit ? 'PUT' : 'POST';
      await apiFetch(endpoint, token, {
        method,
        body: JSON.stringify({ admin_reply: replyText.trim() }),
      });
      setShowModal(false);
      setReplyText('');
      setModalFeedback(null);
      fetchData();
    } catch {
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteReply(feedback: Feedback) {
    if (!confirm('Are you sure you want to delete this reply?')) return;
    try {
      await apiFetch(`/admin/feedback/${feedback.id}/reply`, token, {
        method: 'PUT',
        body: JSON.stringify({ admin_reply: '' }),
      });
      fetchData();
    } catch {
    }
  }

  const distribution = stats?.rating_distribution ?? {};
  const maxDistCount = Math.max(...Object.values(distribution), 1);

  const ratingData = [5, 4, 3, 2, 1].map(star => ({
    label: `${star}★`,
    value: distribution[star] ?? 0,
  })).filter(d => d.value > 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <DateFilter
          preset={preset}
          onChange={(p, from, to) => { setPreset(p); setFromDate(from); setToDate(to); }}
          fromDate={fromDate}
          toDate={toDate}
        />
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 16, marginBottom: 24 }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ color: THEME.success, fontSize: 14, marginBottom: 8 }}>Average Rating</div>
            <div style={{ fontSize: 36, fontWeight: 700, color: THEME.primary }}>
              {Number(stats.average_rating ?? 0).toFixed(1)}
            </div>
            <div style={{ marginTop: 4 }}>{renderStars(Math.round(stats.average_rating ?? 0))}</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ color: THEME.success, fontSize: 14, marginBottom: 8 }}>Total Reviews</div>
            <div style={{ fontSize: 36, fontWeight: 700, color: THEME.primary }}>{stats.total_reviews ?? 0}</div>
          </div>
          <div className="card">
            <div style={{ color: THEME.success, fontSize: 14, marginBottom: 12 }}>Rating Distribution</div>
            <BarChart
              data={ratingData}
              orientation="horizontal"
              formatValue={(v) => String(v)}
              height={120}
            />
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: THEME.success }}>Loading feedback...</div>
      ) : feedbackList.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: THEME.success, padding: 40 }}>
          No feedback yet
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {feedbackList.map(fb => (
            <div key={fb.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong style={{ fontSize: 16, color: THEME.primary }}>{fb.customer_name}</strong>
                      {renderStars(fb.rating)}
                    </div>
                    <div style={{ fontSize: 13, color: THEME.success, marginTop: 2 }}>
                    {fb.store_name} · {new Date(fb.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {!fb.reply && (
                    <button className="btn btn-sm" onClick={() => openReplyModal(fb)}>Reply</button>
                  )}
                  {fb.reply && (
                    <>
                      <button className="btn btn-sm" onClick={() => openEditModal(fb)}>Edit Reply</button>
                      <button className="btn btn-sm" style={{ background: '#A83232', color: '#fff' }} onClick={() => deleteReply(fb)}>Delete Reply</button>
                    </>
                  )}
                </div>
              </div>
              <p style={{ margin: '8px 0', color: THEME.primary }}>{fb.comment}</p>
              {fb.reply && (
                <div style={{ background: THEME.bgMuted, borderRadius: 12, borderLeft: `3px solid ${THEME.primary}`, padding: '12px 16px', marginTop: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: THEME.primary, marginBottom: 4 }}>Merchant Reply</div>
                  <div style={{ fontSize: 14, color: THEME.primary }}>{fb.reply}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showModal && !!modalFeedback} onClose={() => setShowModal(false)} title={isEdit ? 'Edit Reply' : 'Reply to Feedback'} footer={
        <>
          <button className="btn" onClick={() => setShowModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={submitReply} disabled={submitting || !replyText.trim()}>
            {submitting ? 'Submitting...' : isEdit ? 'Update Reply' : 'Submit Reply'}
          </button>
        </>
      }>
        {modalFeedback && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <strong style={{ color: THEME.primary }}>{modalFeedback.customer_name}</strong>
              {renderStars(modalFeedback.rating)}
            </div>
            <p style={{ fontSize: 14, color: THEME.success, marginBottom: 12 }}>{modalFeedback.comment}</p>
            <TextArea
              rows={4}
              placeholder="Write your reply..."
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
