'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Gift, ArrowLeft, ArrowRight, Calendar, Clock, Star, Tag, PenLine, HelpCircle, CheckCircle, Flame, List, Circle } from 'lucide-react';
import { TypePill, RedemptionCodeModal } from '@/components/shared';
import { useUIStore } from '@/stores/uiStore';
import api from '@/lib/api';
import type { PromoBanner } from '@/lib/api';

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

import { resolveAssetUrl } from '@/lib/tokens';

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
  const { showToast, setPage, isGuest } = useUIStore();
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
    if (isGuest) { showToast('Sign in to claim offers', 'info'); return; }
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
    if (isGuest) { showToast('Sign in to submit surveys', 'info'); return; }
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
    const img = resolveAssetUrl(selectedPromo.image_url);
    const tagText = selectedPromo.action_type === 'survey' ? 'Survey' : selectedPromo.action_type === 'detail' ? 'Offer' : 'Promo';
    const isSurvey = selectedPromo.action_type === 'survey';
    const status = bannerStatus[selectedPromo.id];
    const surveyAlreadyDone = status?.survey_completed || surveyCompleted;

    return (
      <div className="promo-screen-white">
        <div className="rd-hero">
          {img ? (
            <img src={img} alt="" className="rd-hero-img promo-hero-img-fill" />
          ) : (
            <div className="rd-hero-img promo-hero-img-fallback" />
          )}
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
            <span className="promo-meta-item">
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
          {isSurvey && isGuest && !surveyAlreadyDone && (
            <div className="guest-locked">
              <div className="guest-locked-icon"><Gift size={28} /></div>
              <div className="guest-locked-title">Sign in to participate</div>
              <div className="guest-locked-desc">Create an account to complete surveys and earn rewards.</div>
            </div>
          )}
          {isSurvey && !isGuest && surveyQuestions.length > 0 && !surveyAlreadyDone && (
            <div className="survey-block">
              {surveyQuestions.map((q) => (
                <div key={q.id} className="promo-survey-question">
                  <div className="survey-question">
                    <HelpCircle size={16} />
                    {q.question_text}
                    {q.is_required && <span className="promo-required">*</span>}
                  </div>

                  {q.question_type === 'rating' && (
                    <div className="promo-rating-row">
                      {[1, 2, 3, 4, 5].map((r) => (
                        <button
                          key={r}
                          onClick={() => setSurveyAnswers((prev) => ({ ...prev, [q.id]: r }))}
                          className={`promo-rating-btn ${surveyAnswers[q.id] === r ? 'promo-rating-btn-selected' : ''}`}
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
                          <div className={`promo-radio-circle ${surveyAnswers[q.id] === opt ? 'promo-radio-circle-selected' : ''}`}>
                            {surveyAnswers[q.id] === opt && <div className="promo-radio-dot" />}
                          </div>
                          {opt}
                        </div>
                      ))}
                    </div>
                  )}

                  {q.question_type === 'text' && (
                    <textarea
                      className="promo-survey-textarea"
                      placeholder="Type your answer..."
                      onChange={(e) => setSurveyAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    />
                  )}

                  {q.question_type === 'dropdown' && q.options && (
                    <select
                      className="promo-survey-select"
                      onChange={(e) => setSurveyAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
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
              <CheckCircle size={48} className="promo-success-icon" />
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
              <p className="rd-desc promo-redeem-box">
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
                    <Circle size={10} fill="currentColor" /> {t}
                  </li>
                ))}
              </ul>
            </>
          )}

          {!isSurvey && isGuest && (
            <div className="guest-locked">
              <div className="guest-locked-icon"><Gift size={28} /></div>
              <div className="guest-locked-title">Sign in to claim</div>
              <div className="guest-locked-desc">Create an account to claim this offer and earn loyalty rewards.</div>
            </div>
          )}

          {!isSurvey && !isGuest && !cta.disabled && (
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
                <span className="promo-inline-icon"><Flame size={14} /></span>
                Only 47 vouchers left
              </p>
            </>
          )}

          {!isSurvey && !isGuest && cta.disabled && (
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
          onCopy={(_code) => { showToast('Code copied!', 'success'); setPage('my-rewards'); }}
        />
      </div>
    );
  }

  return (
    <div className="promo-screen">
      <div className="promo-header">
        <div className="promo-header-row">
          <motion.button whileTap={{ scale: 0.9 }} onClick={onBack} className="promo-back-btn">
            <ArrowLeft size={22} />
          </motion.button>
          <h1 className="promo-title">Promotions</h1>
        </div>
      </div>

      <div className="scroll-container promo-scroll-container">
        {loading ? (
          <div className="promo-skeleton-list">
            {[1, 2, 3].map((i) => (<div key={i} className="skeleton promo-skeleton-card" />))}
          </div>
        ) : promotions.length === 0 ? (
          <div className="promo-empty">
            <Gift size={40} className="promo-empty-icon" />
            <p className="promo-empty-title">No active promotions</p>
            <p className="promo-empty-desc">Check back soon for new offers</p>
          </div>
        ) : (
          <div className="promo-list">
            {promotions.map((promo) => {
              const img = resolveAssetUrl(promo.image_url);
              const tagText = promo.action_type === 'survey' ? 'Survey' : promo.action_type === 'detail' ? 'Offer' : 'Promo';
              return (
                <motion.button
                  key={promo.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleSelectPromo(promo)}
                  className="promo-card"
                >
                  <div className="promo-card-thumb">
                    {img ? (
                      <img src={img} alt="" className="promo-card-thumb-img" />
                    ) : (
                      <div className="promo-card-thumb-fallback">
                        <Gift size={24} strokeWidth={1.5} className="promo-card-thumb-icon" />
                      </div>
                    )}
                  </div>
                  <div className="promo-card-body">
                    <div className="promo-card-tags">
                      <TypePill variant={getTagVariant(promo.action_type)}>{tagText}</TypePill>
                    </div>
                    <p className="promo-card-title">
                      {promo.title}
                    </p>
                    {promo.short_description && (
                      <p className="promo-card-desc">
                        {promo.short_description}
                      </p>
                    )}
                    <span className="promo-card-meta">
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
