'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import { DateFilter, type DatePreset, calcDateRange } from '@/components/ui/DateFilter';
import { BarChart, Modal, TextArea } from '@/components/ui';

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

export default function FeedbackPage({ token: _token, selectedStore }: FeedbackPageProps) {
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
        apiFetch(`/admin/feedback${storeParam}${range}`),
        apiFetch(`/admin/feedback/stats${storeParam}${range}`),
      ]);
      if (fbRes.ok) {
        const fbData = await fbRes.json();
        setFeedbackList(Array.isArray(fbData) ? fbData : fbData.items ?? []);
      }
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.data ?? statsData);
      }
    } catch { console.error('Failed to fetch feedback'); } finally {
      setLoading(false);
    }
  }, [selectedStore, fromDate, toDate]);

  useEffect(() => {
    if (preset === 'CUSTOM') return;
    const range = calcDateRange(preset);
    setFromDate(range.from);
    setToDate(range.to);
  }, [preset]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function renderStars(rating: number) {
    return (
      <span className="rs-0">
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
      await apiFetch(endpoint, undefined, {
        method,
        body: JSON.stringify({ admin_reply: replyText.trim() }),
      });
      setShowModal(false);
      setReplyText('');
      setModalFeedback(null);
      fetchData();
    } catch { console.error('Failed to submit reply'); } finally {
      setSubmitting(false);
    }
  }

  async function deleteReply(feedback: Feedback) {
    if (!confirm('Are you sure you want to delete this reply?')) return;
    try {
      await apiFetch(`/admin/feedback/${feedback.id}/reply`, undefined, {
        method: 'PUT',
        body: JSON.stringify({ admin_reply: '' }),
      });
      fetchData();
    } catch { console.error('Failed to delete reply'); }
  }

  const distribution = stats?.rating_distribution ?? {};

  const ratingData = [5, 4, 3, 2, 1].map(star => ({
    label: `${star}★`,
    value: distribution[star] ?? 0,
  })).filter(d => d.value > 0);

  return (
    <div>
      <div className="fp-1">
        <DateFilter
          preset={preset}
          onChange={(p, from, to) => { setPreset(p); setFromDate(from); setToDate(to); }}
          fromDate={fromDate}
          toDate={toDate}
        />
      </div>

      {stats && (
        <div className="fp-2">
          <div className="card fp-3" >
            <div className="fp-4">Average Rating</div>
            <div className="fp-5">
              {Number(stats.average_rating ?? 0).toFixed(1)}
            </div>
            <div className="fp-6">{renderStars(Math.round(stats.average_rating ?? 0))}</div>
          </div>
          <div className="card fp-7" >
            <div className="fp-8">Total Reviews</div>
            <div className="fp-9">{stats.total_reviews ?? 0}</div>
          </div>
          <div className="card">
            <div className="fp-10">Rating Distribution</div>
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
        <div className="fp-11">Loading feedback...</div>
      ) : feedbackList.length === 0 ? (
        <div className="card fp-12" >
          No feedback yet
        </div>
      ) : (
        <div className="fp-13">
          {feedbackList.map(fb => (
            <div key={fb.id} className="card">
              <div className="fp-14">
                <div>
                    <div className="fp-15">
                      <strong className="fp-16">{fb.customer_name}</strong>
                      {renderStars(fb.rating)}
                    </div>
                    <div className="fp-17">
                    {fb.store_name} · {new Date(fb.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="fp-18">
                  {!fb.reply && (
                    <button className="btn btn-sm" onClick={() => openReplyModal(fb)}>Reply</button>
                  )}
                  {fb.reply && (
                    <>
                      <button className="btn btn-sm" onClick={() => openEditModal(fb)}>Edit Reply</button>
                      <button className="btn btn-sm fp-19"  onClick={() => deleteReply(fb)}>Delete Reply</button>
                    </>
                  )}
                </div>
              </div>
              <p className="fp-20">{fb.comment}</p>
              {fb.reply && (
                <div className="fp-21">
                  <div className="fp-22">Merchant Reply</div>
                  <div className="fp-23">{fb.reply}</div>
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
            <div className="fp-24">
              <strong className="fp-25">{modalFeedback.customer_name}</strong>
              {renderStars(modalFeedback.rating)}
            </div>
            <p className="fp-26">{modalFeedback.comment}</p>
            <TextArea
              rows={4}
              placeholder="Write your reply..."
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              className="fp-27"
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
