'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Gift, ArrowLeft, ArrowRight, Calendar, Clock, Star, Tag, PenLine, HelpCircle, CheckCircle, Flame, List, Circle } from 'lucide-react';
import { TypePill, RedemptionCodeModal } from '@/components/shared';
import { useUIStore } from '@/stores/uiStore';
import api, { cacheBust } from '@/lib/api';
import type { PromoBanner } from '@/lib/api';

const LOKA = {
  primary: '#384B16',
  copper: '#D18E38',
  copperLight: '#E5A559',
  copperSoft: 'rgba(209,142,56,0.12)',
  cream: '#F3EEE5',
  brown: '#57280D',
  textPrimary: '#1B2023',
  textSecondary: '#3A4A5A',
  textMuted: '#6A7A8A',
  border: '#D4DCE5',
  borderSubtle: '#E4EAEF',
  surface: '#F5F7FA',
  bg: '#E4EAEF',
  white: '#FFFFFF',
} as const;

interface BannerStatus {
  action_type: string;
  survey_completed?: boolean;
  voucher_claimed?: boolean;
  voucher_used?: boolean;
  voucher_code?: string;
}

interface SurveyQuestion {
  id: number;
  question_text: string;
  question_type: string;
  options: string[] | null;
  is_required: boolean;
  sort_order: number;
}

interface PromotionsPageProps {
  onBack: () => void;
  preselectedId?: number;
}

function resolveUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return cacheBust(url.startsWith('http') ? url : `https://admin.loyaltysystem.uk${url}`);
}

function formatDate(d: string | null) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-MY', { month: 'short', day: 'numeric' });
}

function getDaysLeft(end: string | null) {
  if (!end) return 'Ongoing';
  const diff = Math.ceil((new Date(end).getTime() - Date.now()) / 86400000);
  if (diff <= 0) return 'Ended';
  return diff === 1 ? '1 day left' : `${diff} days left`;
}

function getTagVariant(t: string | null): 'offer' | 'survey' | 'limited' | 'system' {
  if (t === 'survey') return 'survey';
  if (t === 'detail') return 'offer';
  return 'system';
}

export default function PromotionsPage({ onBack, preselectedId }: PromotionsPageProps) {
  const { showToast, setPage } = useUIStore();
  const [promotions, setPromotions] = useState<PromoBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPromo, setSelectedPromo] = useState<PromoBanner | null>(null);
  const [bannerStatus, setBannerStatus] = useState<Record<number, BannerStatus>>({});
  const [claiming, setClaiming] = useState<number | null>(null);
  const [showVoucher, setShowVoucher] = useState<string | null>(null);

  const [surveyQuestions, setSurveyQuestions] = useState<SurveyQuestion[]>([]);
  const [surveyAnswers, setSurveyAnswers] = useState<Record<number, string | number>>({});
  const [submittingSurvey, setSubmittingSurvey] = useState(false);
  const [surveyCompleted, setSurveyCompleted] = useState(false);
  const preselectedConsumed = useRef(false);

  const loadPromotions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/promos/banners');
      const data = Array.isArray(res.data) ? res.data : [];
      const now = new Date();
      const active = data.filter((b: PromoBanner) => {
        if (!b.start_date || !b.end_date) return true;
        return new Date(b.start_date) <= now && new Date(b.end_date) >= now;
      });
      setPromotions(active);
      const statuses = await Promise.all(active.map((p: PromoBanner) => api.get(`/promos/banners/${p.id}/status`).then((r) => ({ id: p.id, status: r.data })).catch(() => null)));
      const map: Record<number, BannerStatus> = {};
      statuses.forEach((s) => { if (s) map[s.id] = s.status; });
      setBannerStatus(map);
    } catch { setPromotions([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadPromotions();
  }, [loadPromotions]);

  const loadSurveyQuestions = useCallback(async (surveyId: number) => {
    try {
      const res = await api.get(`/surveys/${surveyId}`);
      setSurveyQuestions(res.data.questions || []);
    } catch {
      setSurveyQuestions([]);
    }
  }, []);

  useEffect(() => {
    if (preselectedId && !preselectedConsumed.current && promotions.length > 0 && !selectedPromo) {
      const found = promotions.find((p) => p.id === preselectedId);
      if (found) {
        setSelectedPromo(found);
        preselectedConsumed.current = true;
        if (found.action_type === 'survey' && found.survey_id) {
          loadSurveyQuestions(found.survey_id);
        }
      }
    }
  }, [preselectedId, promotions, selectedPromo, loadSurveyQuestions]);

  const handleClaim = async (promo: PromoBanner) => {
    setClaiming(promo.id);
    try {
      const res = await api.post(`/promos/banners/${promo.id}/claim`);
      const code = res.data?.voucher_code || res.data?.redemption_code || '';
      if (code) { setShowVoucher(code); await loadPromotions(); }
      else showToast('Offer claimed! Check your vouchers.', 'success');
    } catch { showToast('Failed to claim offer', 'error'); }
    finally { setClaiming(null); }
  };

  const handleSubmitSurvey = async () => {
    if (!selectedPromo?.survey_id) return;
    const unanswered = surveyQuestions.filter((q) => q.is_required && !surveyAnswers[q.id]);
    if (unanswered.length > 0) {
      showToast('Please answer all required questions', 'error');
      return;
    }
    setSubmittingSurvey(true);
    try {
      const answers = surveyQuestions.map((q) => {
        const ans: Record<string, unknown> = { question_id: q.id };
        if (q.question_type === 'rating') ans.rating_value = Number(surveyAnswers[q.id]);
        else if (q.question_type === 'single_choice' || q.question_type === 'dropdown') ans.choice_value = surveyAnswers[q.id];
        else ans.text_value = surveyAnswers[q.id];
        return ans;
      });
      const res = await api.post(`/surveys/${selectedPromo.survey_id}/submit`, { answers });
      if (res.data?.success === false) {
        showToast(res.data.message || 'Already submitted', 'info');
        setSurveyCompleted(true);
      } else {
        const code = res.data?.voucher_code || '';
        if (code) setShowVoucher(code);
        else showToast('Survey submitted! Thank you.', 'success');
        setSurveyCompleted(true);
        await loadPromotions();
      }
    } catch {
      showToast('Failed to submit survey', 'error');
    } finally {
      setSubmittingSurvey(false);
    }
  };

  const handleSelectPromo = async (promo: PromoBanner) => {
    setSelectedPromo(promo);
    setSurveyAnswers({});
    setSurveyCompleted(false);
    setSurveyQuestions([]);
    if (promo.action_type === 'survey' && promo.survey_id) {
      await loadSurveyQuestions(promo.survey_id);
    }
  };

  const getCTA = (promo: PromoBanner) => {
    const s = bannerStatus[promo.id];
    if (!s) return { text: 'Claim Offer', action: () => handleClaim(promo), disabled: false };
    if (s.voucher_used) return { text: 'Already used', action: undefined, disabled: true };
    if (s.voucher_claimed) return { text: 'View in wallet →', action: () => { setPage('my-rewards'); setSelectedPromo(null); }, disabled: false };
    if (s.action_type === 'survey' && s.survey_completed) return { text: 'Already completed', action: undefined, disabled: true };
    return { text: 'Claim Offer', action: () => handleClaim(promo), disabled: false };
  };

  if (selectedPromo) {
    const cta = getCTA(selectedPromo);
    const img = resolveUrl(selectedPromo.image_url);
    const tagText = selectedPromo.action_type === 'survey' ? 'Survey' : selectedPromo.action_type === 'detail' ? 'Offer' : 'Promo';
    const isSurvey = selectedPromo.action_type === 'survey';
    const status = bannerStatus[selectedPromo.id];
    const surveyAlreadyDone = status?.survey_completed || surveyCompleted;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white' }}>
        <div className="rd-hero">
          <div className="rd-hero-img" style={img ? { backgroundImage: `url(${img})` } : { background: 'linear-gradient(135deg, #F3EEE5, rgba(209,142,56,0.3))' }} />
          <div className="rd-hero-overlay" />
          <button
            className="rd-back-btn"
            onClick={() => { setSelectedPromo(null); setSurveyQuestions([]); setSurveyAnswers({}); setSurveyCompleted(false); }}
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <span className={`rd-hero-tag ${isSurvey ? 'rd-tag-teal' : 'rd-tag-primary'}`}>
            {isSurvey ? <PenLine size={14} /> : <Tag size={14} />}
            {tagText}
          </span>
        </div>

        <div className="rd-content">
          <h1 className="rd-title">{selectedPromo.title}</h1>

          <div className="rd-meta">
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              {isSurvey ? <Clock size={16} /> : <Calendar size={16} />}
              {isSurvey ? '2 min survey' : `${formatDate(selectedPromo.start_date)} – ${formatDate(selectedPromo.end_date)}`}
            </span>
            <span className={`rd-meta-pill ${isSurvey ? 'rd-pill-green' : 'rd-pill-brown'}`}>
              {isSurvey ? 'RM5 voucher' : 'Limited vouchers'}
            </span>
          </div>

          <p className="rd-desc">
            {selectedPromo.long_description || selectedPromo.short_description || 'No description available.'}
          </p>

          {/* ── Survey Flow ── */}
          {isSurvey && surveyQuestions.length > 0 && !surveyAlreadyDone && (
            <div className="survey-block">
              {surveyQuestions.map((q, qi) => (
                <div key={q.id} style={{ marginBottom: qi < surveyQuestions.length - 1 ? 20 : 0 }}>
                  <div className="survey-question">
                    <HelpCircle size={16} />
                    {q.question_text}
                    {q.is_required && <span style={{ color: '#C75050' }}>*</span>}
                  </div>

                  {q.question_type === 'rating' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[1, 2, 3, 4, 5].map((r) => (
                        <button
                          key={r}
                          onClick={() => setSurveyAnswers((prev) => ({ ...prev, [q.id]: r }))}
                          className="survey-option"
                          style={{
                            width: 44, height: 44, borderRadius: 12, justifyContent: 'center',
                            border: surveyAnswers[q.id] === r ? '2px solid var(--loka-primary)' : '1.5px solid #e3d8cf',
                            background: surveyAnswers[q.id] === r ? '#f2f6f4' : 'white',
                            color: surveyAnswers[q.id] === r ? 'var(--loka-primary)' : 'var(--loka-copper)',
                            fontWeight: 700,
                          }}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  )}

                  {q.question_type === 'single_choice' && q.options && (
                    <div>
                      {q.options.map((opt) => (
                        <div
                          key={opt}
                          className={`survey-option ${surveyAnswers[q.id] === opt ? 'selected' : ''}`}
                          onClick={() => setSurveyAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                        >
                          <div style={{
                            width: 18, height: 18, borderRadius: 999, flexShrink: 0,
                            border: `2px solid ${surveyAnswers[q.id] === opt ? 'var(--loka-primary)' : 'var(--loka-border-light)'}`,
                            background: surveyAnswers[q.id] === opt ? 'var(--loka-primary)' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {surveyAnswers[q.id] === opt && <div style={{ width: 6, height: 6, borderRadius: 999, background: 'white' }} />}
                          </div>
                          {opt}
                        </div>
                      ))}
                    </div>
                  )}

                  {q.question_type === 'text' && (
                    <textarea
                      placeholder="Type your answer..."
                      onChange={(e) => setSurveyAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      style={{
                        width: '100%', minHeight: 80, padding: '12px 14px', borderRadius: 14,
                        border: '1px solid var(--loka-border-light)', fontSize: 14,
                        color: 'var(--loka-text-primary)', background: 'white',
                        resize: 'vertical', fontFamily: 'inherit',
                      }}
                    />
                  )}

                  {q.question_type === 'dropdown' && q.options && (
                    <select
                      onChange={(e) => setSurveyAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      style={{
                        width: '100%', padding: '12px 14px', borderRadius: 14,
                        border: '1px solid var(--loka-border-light)', fontSize: 14,
                        color: 'var(--loka-text-primary)', background: 'white',
                      }}
                    >
                      <option value="">Select an option</option>
                      {q.options.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                    </select>
                  )}
                </div>
              ))}
              <button
                className="survey-submit-btn"
                onClick={handleSubmitSurvey}
                disabled={submittingSurvey}
              >
                {submittingSurvey ? 'Submitting...' : 'Submit & get voucher'}
                <Gift size={16} />
              </button>
            </div>
          )}

          {isSurvey && surveyAlreadyDone && (
            <div className="rd-success-state">
              <CheckCircle size={48} color="#1A6E4B" />
              <p>Survey completed!</p>
              <p className="rd-success-sub">Thank you for your feedback. Your reward has been added to your wallet.</p>
            </div>
          )}

          {/* ── Promo Claim Flow ── */}
          {!isSurvey && selectedPromo.how_to_redeem && (
            <>
              <div className="rd-section-title">
                <Star size={16} /> How to redeem
              </div>
              <p className="rd-desc" style={{ background: '#faf7f4', borderRadius: 18, padding: 16, marginBottom: 20 }}>
                {selectedPromo.how_to_redeem}
              </p>
            </>
          )}

          {!isSurvey && selectedPromo.terms && selectedPromo.terms.length > 0 && (
            <>
              <div className="rd-section-title">
                <List size={16} /> Terms
              </div>
              <ul className="rd-terms-list">
                {selectedPromo.terms.map((t, i) => (
                  <li key={i}>
                    <Circle size={10} fill="#D18E38" color="#D18E38" /> {t}
                  </li>
                ))}
              </ul>
            </>
          )}

          {!isSurvey && !cta.disabled && (
            <>
              <button
                className="rd-action-btn"
                onClick={cta.action}
                disabled={claiming === selectedPromo.id}
              >
                <span>{claiming === selectedPromo.id ? 'Processing...' : cta.text}</span>
                <ArrowRight size={20} />
              </button>
              <p className="rd-remaining-badge">
                <Flame size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                Only 47 vouchers left
              </p>
            </>
          )}

          {!isSurvey && cta.disabled && (
            <button className="rd-action-btn" disabled>
              <span>{cta.text}</span>
            </button>
          )}
        </div>

        <RedemptionCodeModal
          isOpen={!!showVoucher}
          code={showVoucher || ''}
          title="Voucher Unlocked!"
          onClose={() => { setShowVoucher(null); setSelectedPromo(null); }}
          onCopy={(code) => { showToast('Code copied!', 'success'); setPage('my-rewards'); }}
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: LOKA.bg }}>
      <div style={{ padding: '20px 18px 12px', background: LOKA.white, borderBottom: `1px solid ${LOKA.borderSubtle}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <motion.button whileTap={{ scale: 0.9 }} onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, display: 'flex', color: LOKA.primary }}>
            <ArrowLeft size={22} />
          </motion.button>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: LOKA.textPrimary, letterSpacing: '-0.02em' }}>Promotions</h1>
        </div>
      </div>

      <div className="scroll-container" style={{ flex: 1, padding: '14px 16px 24px' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1, 2, 3].map((i) => (<div key={i} className="skeleton" style={{ height: 88, borderRadius: 18 }} />))}
          </div>
        ) : promotions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', background: LOKA.white, borderRadius: 20, border: `1px solid ${LOKA.borderSubtle}` }}>
            <Gift size={40} color={LOKA.borderSubtle} style={{ marginBottom: 12 }} />
            <p style={{ fontSize: 16, fontWeight: 700, color: LOKA.textPrimary, marginBottom: 6 }}>No active promotions</p>
            <p style={{ fontSize: 13, color: LOKA.textMuted }}>Check back soon for new offers</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {promotions.map((promo) => {
              const img = resolveUrl(promo.image_url);
              const tagText = promo.action_type === 'survey' ? 'Survey' : promo.action_type === 'detail' ? 'Offer' : 'Promo';
              return (
                <motion.button
                  key={promo.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleSelectPromo(promo)}
                  style={{
                    display: 'flex', background: LOKA.white, borderRadius: 18,
                    border: `1px solid ${LOKA.borderSubtle}`, overflow: 'hidden',
                    cursor: 'pointer', textAlign: 'left', width: '100%',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  }}
                >
                  <div
                    style={{
                      width: 88, height: 88, flexShrink: 0,
                      background: img ? `url(${img}) center/cover` : `linear-gradient(135deg, ${LOKA.cream}, rgba(209,142,56,0.2))`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {!img && <Gift size={24} color={LOKA.brown} strokeWidth={1.5} />}
                  </div>
                  <div style={{ flex: 1, padding: '10px 14px', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                      <TypePill variant={getTagVariant(promo.action_type)}>{tagText}</TypePill>
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: LOKA.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {promo.title}
                    </p>
                    {promo.short_description && (
                      <p style={{ fontSize: 12, color: LOKA.textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {promo.short_description}
                      </p>
                    )}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 4, fontSize: 11, color: LOKA.copper, fontWeight: 600 }}>
                      <Clock size={10} /> {getDaysLeft(promo.end_date)}
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
