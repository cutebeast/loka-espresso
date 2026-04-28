'use client';

import { Gift, ArrowLeft, ArrowRight, Calendar, Clock, Star, Tag, PenLine, HelpCircle, CheckCircle, Flame, List, Circle } from 'lucide-react';
import { RedemptionCodeModal } from '@/components/shared';
import { resolveAssetUrl } from '@/lib/tokens';
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

function formatDate(d: string | null) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-MY', { month: 'short', day: 'numeric' });
}

interface VoucherSectionProps {
  selectedPromo: PromoBanner;
  status: BannerStatus | undefined;
  claiming: number | null;
  isGuest: boolean;
  surveyQuestions: SurveyQuestion[];
  surveyAnswers: Record<number, string | number>;
  submittingSurvey: boolean;
  surveyCompleted: boolean;
  showVoucher: string | null;
  onBack: () => void;
  onClaim: (promo: PromoBanner) => void;
  onSubmitSurvey: () => void;
  onSurveyAnswer: (questionId: number, value: string | number) => void;
  onCloseVoucher: () => void;
  onCopyVoucher: () => void;
  onGoToWallet: () => void;
}

export default function VoucherSection({
  selectedPromo,
  status,
  claiming,
  isGuest,
  surveyQuestions,
  surveyAnswers,
  submittingSurvey,
  surveyCompleted,
  showVoucher,
  onBack,
  onClaim,
  onSubmitSurvey,
  onSurveyAnswer,
  onCloseVoucher,
  onCopyVoucher,
  onGoToWallet,
}: VoucherSectionProps) {
  const img = resolveAssetUrl(selectedPromo.image_url);
  const tagText = selectedPromo.action_type === 'survey' ? 'Survey' : selectedPromo.action_type === 'detail' ? 'Offer' : 'Promo';
  const isSurvey = selectedPromo.action_type === 'survey';
  const surveyAlreadyDone = status?.survey_completed || surveyCompleted;

  const getCTA = () => {
    if (!status) return { text: 'Claim Offer', action: () => onClaim(selectedPromo), disabled: false };
    if (status.voucher_used) return { text: 'Already used', action: undefined, disabled: true };
    if (status.voucher_claimed) return { text: 'View in wallet →', action: onGoToWallet, disabled: false };
    if (status.action_type === 'survey' && status.survey_completed) return { text: 'Already completed', action: undefined, disabled: true };
    return { text: 'Claim Offer', action: () => onClaim(selectedPromo), disabled: false };
  };

  const cta = getCTA();

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
          onClick={onBack}
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
                        onClick={() => onSurveyAnswer(q.id, r)}
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
                        onClick={() => onSurveyAnswer(q.id, opt)}
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
                    onChange={(e) => onSurveyAnswer(q.id, e.target.value)}
                  />
                )}

                {q.question_type === 'dropdown' && q.options && (
                  <select
                    className="promo-survey-select"
                    onChange={(e) => onSurveyAnswer(q.id, e.target.value)}
                  >
                    <option value="">Select an option</option>
                    {q.options.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                  </select>
                )}
              </div>
            ))}
            <button
              className="survey-submit-btn"
              onClick={onSubmitSurvey}
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
        onClose={onCloseVoucher}
        onCopy={(_code) => onCopyVoucher()}
      />
    </div>
  );
}
