'use client';

import { useState } from 'react';
import { ArrowLeft, Star, Send, CheckCircle } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';

/** Customer feedback & suggestions — the dashboard's customer-facing
 * replacement for the FAQ/guide link (the guide is staff training material,
 * not customer-critical). Sends a star rating + suggestion to the admin
 * Feedback inbox. */
export default function FeedbackPage() {
  const { t } = useTranslation();
  const { setPage, showToast, selectedStore } = useUIStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (rating === 0 || !message.trim()) {
      showToast(t('toast.fieldsRequired'), 'error');
      return;
    }
    setSending(true);
    try {
      await api.post('/feedback', {
        store_id: selectedStore?.id ?? undefined,
        rating,
        title: isAuthenticated ? (user?.display_name || '') : 'Guest suggestion',
        body: message.trim(),
      });
      setSent(true);
      setMessage('');
    } catch {
      showToast(t('toast.feedbackFailed'), 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{
      maxWidth: 480, margin: '0 auto', minHeight: '100vh',
      background: 'var(--loka-bg, #FAFAF8)', color: 'var(--loka-text-primary, #1E1B18)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
        background: 'var(--loka-bg-card, #fff)', borderBottom: '1px solid var(--color-hair, #E8E6E0)',
      }}>
        <button onClick={() => setPage('home')} aria-label={t('common.back')} className="sub-back-btn">
          <ArrowLeft size={20} />
        </button>
        <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{t('feedback.title')}</h1>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
        {sent ? (
          <div style={{
            textAlign: 'center', padding: '40px 20px', borderRadius: 12,
            border: '1px solid var(--color-hair, #E8E6E0)', background: 'var(--loka-bg-card, #fff)',
          }}>
            <CheckCircle size={44} color="var(--color-success, #3E7A3E)" />
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 12 }}>{t('feedback.thanks')}</div>
            <div style={{ fontSize: 13, color: 'var(--loka-text-muted, #8A8078)', marginTop: 6 }}>
              {t('feedback.thanksSub')}
            </div>
            <button
              className="btn btn-primary"
              style={{ marginTop: 18 }}
              onClick={() => { setSent(false); setRating(0); setMessage(''); }}
            >
              {t('feedback.another')}
            </button>
          </div>
        ) : (
          <>
            <div style={{
              borderRadius: 12, padding: 18, marginBottom: 14,
              border: '1px solid var(--color-hair, #E8E6E0)', background: 'var(--loka-bg-card, #fff)',
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{t('feedback.rate')}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    onMouseEnter={() => setHover(n)}
                    onMouseLeave={() => setHover(0)}
                    aria-label={`${n}`}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                      color: (hover || rating) >= n ? 'var(--color-gold, #C9A84C)' : 'var(--loka-text-muted, #C9C2B8)',
                    }}
                  >
                    <Star size={30} fill={(hover || rating) >= n ? 'currentColor' : 'none'} />
                  </button>
                ))}
              </div>
            </div>

            <div style={{
              borderRadius: 12, padding: 18,
              border: '1px solid var(--color-hair, #E8E6E0)', background: 'var(--loka-bg-card, #fff)',
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{t('feedback.suggestions')}</div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('feedback.placeholder')}
                rows={5}
                maxLength={2000}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 8,
                  border: '1px solid var(--color-hair, #E8E6E0)', background: 'var(--loka-bg, #FAFAF8)',
                  color: 'var(--loka-text-primary)', fontSize: 14, fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
              <button
                type="button"
                className="btn btn-primary"
                disabled={sending || rating === 0 || !message.trim()}
                onClick={submit}
                style={{ width: '100%', marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <Send size={16} />
                {sending ? t('common.saving') : t('feedback.submit')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
