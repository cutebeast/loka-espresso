'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/merchant-api';

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

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const storeParam = selectedStore === 'all' ? '' : `?store_id=${selectedStore}`;
      const [fbRes, statsRes] = await Promise.all([
        apiFetch(`/admin/feedback${storeParam}`, token),
        apiFetch(`/admin/feedback/stats${storeParam}`, token),
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
  }, [token, selectedStore]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function renderStars(rating: number) {
    return (
      <span style={{ color: '#F59E0B', fontSize: 16 }}>
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3>Feedback Management</h3>
        <span style={{ fontSize: 13, color: '#64748B' }}>
          {selectedStore === 'all' ? 'All Stores' : 'Filtered by selected store'}
        </span>
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 16, marginBottom: 24 }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ color: '#64748B', fontSize: 14, marginBottom: 8 }}>Average Rating</div>
            <div style={{ fontSize: 36, fontWeight: 700, color: '#002F6C' }}>
              {Number(stats.average_rating ?? 0).toFixed(1)}
            </div>
            <div style={{ marginTop: 4 }}>{renderStars(Math.round(stats.average_rating ?? 0))}</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ color: '#64748B', fontSize: 14, marginBottom: 8 }}>Total Reviews</div>
            <div style={{ fontSize: 36, fontWeight: 700, color: '#002F6C' }}>{stats.total_reviews ?? 0}</div>
          </div>
          <div className="card">
            <div style={{ color: '#64748B', fontSize: 14, marginBottom: 12 }}>Rating Distribution</div>
            {[5, 4, 3, 2, 1].map(star => {
              const count = distribution[star] ?? 0;
              const pct = maxDistCount > 0 ? (count / maxDistCount) * 100 : 0;
              return (
                <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ width: 50, fontSize: 13, color: '#F59E0B' }}>
                    {star} ★
                  </span>
                  <div style={{ flex: 1, height: 8, background: '#ECF1F7', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: '#F59E0B', borderRadius: 4 }} />
                  </div>
                  <span style={{ width: 30, fontSize: 13, color: '#64748B', textAlign: 'right' }}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>Loading feedback...</div>
      ) : feedbackList.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: '#94A3B8', padding: 40 }}>
          No feedback yet
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {feedbackList.map(fb => (
            <div key={fb.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong style={{ fontSize: 16 }}>{fb.customer_name}</strong>
                    {renderStars(fb.rating)}
                  </div>
                  <div style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>
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
                      <button className="btn btn-sm" style={{ background: '#EF4444', color: '#fff' }} onClick={() => deleteReply(fb)}>Delete Reply</button>
                    </>
                  )}
                </div>
              </div>
              <p style={{ margin: '8px 0', color: '#334155' }}>{fb.comment}</p>
              {fb.reply && (
                <div style={{ background: '#F0F9FF', borderRadius: 12, borderLeft: '3px solid #002F6C', padding: '12px 16px', marginTop: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#002F6C', marginBottom: 4 }}>Merchant Reply</div>
                  <div style={{ fontSize: 14, color: '#334155' }}>{fb.reply}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && modalFeedback && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3>{isEdit ? 'Edit Reply' : 'Reply to Feedback'}</h3>
              <button className="btn btn-sm" onClick={() => setShowModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <strong>{modalFeedback.customer_name}</strong>
                {renderStars(modalFeedback.rating)}
              </div>
              <p style={{ fontSize: 14, color: '#64748B', marginBottom: 12 }}>{modalFeedback.comment}</p>
              <textarea
                className="input"
                rows={4}
                placeholder="Write your reply..."
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitReply} disabled={submitting || !replyText.trim()}>
                {submitting ? 'Submitting...' : isEdit ? 'Update Reply' : 'Submit Reply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
