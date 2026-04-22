'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Gift, ArrowLeft, Calendar, Clock, Star } from 'lucide-react';
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
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: LOKA.white }}>
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ position: 'absolute', inset: 0, background: img ? `url(${img}) center/cover` : `linear-gradient(135deg, ${LOKA.cream}, rgba(209,142,56,0.3))` }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(0,0,0,0.25) 0%, transparent 50%)' }} />
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => { setSelectedPromo(null); setSurveyQuestions([]); setSurveyAnswers({}); setSurveyCompleted(false); }}
            style={{ position: 'absolute', top: 16, left: 16, width: 40, height: 40, borderRadius: 999, background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(4px)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 6px 12px rgba(0,0,0,0.06)', zIndex: 5 }}
          >
            <ArrowLeft size={20} color={LOKA.primary} />
          </motion.button>
          <div style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 2 }}>
            <TypePill variant={getTagVariant(selectedPromo.action_type)}>{tagText}</TypePill>
          </div>
        </div>

        <div className="scroll-container" style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '20px 18px 32px' }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: LOKA.textPrimary, marginBottom: 10, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              {selectedPromo.title}
            </h1>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: LOKA.textMuted }}>
                <Calendar size={14} style={{ color: LOKA.copper }} /> {formatDate(selectedPromo.start_date)} – {formatDate(selectedPromo.end_date)}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 12px', borderRadius: 30, background: LOKA.cream, fontSize: 12, fontWeight: 600, color: LOKA.copper }}>
                <Clock size={12} style={{ marginRight: 4 }} /> {getDaysLeft(selectedPromo.end_date)}
              </span>
            </div>

            <div style={{ width: 40, height: 3, borderRadius: 2, background: LOKA.borderSubtle, marginBottom: 20 }} />

            {(selectedPromo.long_description || selectedPromo.short_description) && (
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: LOKA.textPrimary, marginBottom: 8 }}>About this promotion</h4>
                <p style={{ fontSize: 15, color: LOKA.textSecondary, lineHeight: 1.7 }}>
                  {selectedPromo.long_description || selectedPromo.short_description || 'No description available.'}
                </p>
              </div>
            )}

            {isSurvey && surveyQuestions.length > 0 && !surveyAlreadyDone && (
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: LOKA.textPrimary, marginBottom: 14 }}>
                  <span style={{ marginRight: 6 }}>📝</span> Quick Survey
                </h4>
                <div style={{ background: LOKA.cream, borderRadius: 20, padding: 18 }}>
                  {surveyQuestions.map((q, qi) => (
                    <div key={q.id} style={{ marginBottom: qi < surveyQuestions.length - 1 ? 20 : 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: LOKA.textPrimary, marginBottom: 10 }}>
                        {qi + 1}. {q.question_text}
                        {q.is_required && <span style={{ color: '#C75050', marginLeft: 4 }}>*</span>}
                      </p>
                      {q.question_type === 'rating' && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          {[1, 2, 3, 4, 5].map((r) => (
                            <motion.button
                              key={r}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => setSurveyAnswers((prev) => ({ ...prev, [q.id]: r }))}
                              style={{
                                width: 40, height: 40, borderRadius: 12, border: 'none', cursor: 'pointer',
                                background: surveyAnswers[q.id] === r ? LOKA.primary : LOKA.white,
                                color: surveyAnswers[q.id] === r ? LOKA.white : LOKA.copper,
                                fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                              }}
                            >
                              {r}
                            </motion.button>
                          ))}
                        </div>
                      )}
                      {q.question_type === 'single_choice' && q.options && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {q.options.map((opt) => (
                            <motion.button
                              key={opt}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => setSurveyAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                              style={{
                                padding: '12px 16px', borderRadius: 14, border: `1.5px solid ${surveyAnswers[q.id] === opt ? LOKA.primary : LOKA.borderSubtle}`,
                                background: surveyAnswers[q.id] === opt ? 'rgba(56,75,22,0.06)' : LOKA.white,
                                color: surveyAnswers[q.id] === opt ? LOKA.primary : LOKA.textSecondary,
                                fontSize: 14, fontWeight: surveyAnswers[q.id] === opt ? 600 : 400,
                                cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                              }}
                            >
                              <div style={{
                                width: 18, height: 18, borderRadius: 999, flexShrink: 0,
                                border: `2px solid ${surveyAnswers[q.id] === opt ? LOKA.primary : LOKA.border}`,
                                background: surveyAnswers[q.id] === opt ? LOKA.primary : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {surveyAnswers[q.id] === opt && <div style={{ width: 6, height: 6, borderRadius: 999, background: LOKA.white }} />}
                              </div>
                              {opt}
                            </motion.button>
                          ))}
                        </div>
                      )}
                      {(q.question_type === 'text') && (
                        <textarea
                          placeholder="Type your answer..."
                          onChange={(e) => setSurveyAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                          style={{
                            width: '100%', minHeight: 80, padding: '12px 14px', borderRadius: 14,
                            border: `1px solid ${LOKA.borderSubtle}`, fontSize: 14, color: LOKA.textPrimary,
                            background: LOKA.white, resize: 'vertical', fontFamily: 'inherit',
                          }}
                        />
                      )}
                      {q.question_type === 'dropdown' && q.options && (
                        <select
                          onChange={(e) => setSurveyAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                          style={{
                            width: '100%', padding: '12px 14px', borderRadius: 14,
                            border: `1px solid ${LOKA.borderSubtle}`, fontSize: 14, color: LOKA.textPrimary,
                            background: LOKA.white,
                          }}
                        >
                          <option value="">Select an option</option>
                          {q.options.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                        </select>
                      )}
                    </div>
                  ))}
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleSubmitSurvey}
                    disabled={submittingSurvey}
                    style={{
                      width: '100%', marginTop: 18, padding: '14px 20px', borderRadius: 60, border: 'none',
                      background: LOKA.primary, color: LOKA.white, fontSize: 15, fontWeight: 700,
                      cursor: submittingSurvey ? 'not-allowed' : 'pointer',
                      boxShadow: '0 8px 16px rgba(56,75,22,0.15)',
                      opacity: submittingSurvey ? 0.7 : 1,
                    }}
                  >
                    {submittingSurvey ? 'Submitting...' : 'Submit & get reward 🎁'}
                  </motion.button>
                </div>
              </div>
            )}

            {isSurvey && surveyAlreadyDone && (
              <div style={{ marginBottom: 24, background: '#E6F2E8', borderRadius: 20, padding: 18, textAlign: 'center' }}>
                <span style={{ fontSize: 28, display: 'block', marginBottom: 8 }}>✓</span>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#1A6E4B', marginBottom: 4 }}>Survey completed!</p>
                <p style={{ fontSize: 13, color: LOKA.textSecondary }}>Thank you for your feedback. Your reward has been added to your wallet.</p>
              </div>
            )}

            {!isSurvey && selectedPromo.how_to_redeem && (
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: LOKA.textPrimary, marginBottom: 10 }}>
                  <Star size={14} style={{ color: LOKA.copper, marginRight: 4 }} /> How to redeem
                </h4>
                <div style={{ background: LOKA.cream, borderRadius: 18, padding: 16 }}>
                  <p style={{ fontSize: 14, color: LOKA.textSecondary, lineHeight: 1.6 }}>{selectedPromo.how_to_redeem}</p>
                </div>
              </div>
            )}

            {!isSurvey && selectedPromo.terms && selectedPromo.terms.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: LOKA.textPrimary, marginBottom: 10 }}>Terms & Conditions</h4>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {selectedPromo.terms.map((t, i) => (
                    <li key={i} style={{ padding: '10px 0', borderBottom: `1px solid ${LOKA.borderSubtle}`, fontSize: 14, color: LOKA.textSecondary, display: 'flex', gap: 10 }}>
                      <span style={{ color: LOKA.copper, flexShrink: 0, fontWeight: 700 }}>•</span> {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!isSurvey && (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={cta.action}
                disabled={cta.disabled || claiming === selectedPromo.id}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px 20px', borderRadius: 60, border: 'none',
                  cursor: cta.disabled ? 'not-allowed' : 'pointer',
                  background: cta.disabled ? LOKA.surface : LOKA.primary,
                  color: cta.disabled ? LOKA.textMuted : LOKA.white,
                  fontSize: 16, fontWeight: 700, opacity: cta.disabled ? 0.7 : 1,
                  boxShadow: cta.disabled ? 'none' : '0 8px 16px rgba(56,75,22,0.15)',
                }}
              >
                <span>{claiming === selectedPromo.id ? 'Processing...' : cta.text}</span>
                <span>→</span>
              </motion.button>
            )}
          </div>
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
