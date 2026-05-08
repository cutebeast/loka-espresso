'use client';

import { Gift, ArrowLeft, ArrowRight, Calendar, Clock, Star, Tag, PenLine, HelpCircle, CheckCircle, Flame, List, Circle, Share2 } from 'lucide-react';
import { RedemptionCodeModal } from '@/components/shared';
import { useUIStore } from '@/stores/uiStore';
import { resolveAssetUrl } from '@/lib/tokens';
import { useTranslation } from '@/hooks/useTranslation';
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
  remainingVouchers?: number | null;
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
  remainingVouchers,
  onBack,
  onClaim,
  onSubmitSurvey,
  onSurveyAnswer,
  onCloseVoucher,
  onCopyVoucher,
  onGoToWallet,
}: VoucherSectionProps) {
  const { t } = useTranslation();
  const img = resolveAssetUrl(selectedPromo.image_url);
  const tagText = selectedPromo.action_type === 'survey' ? t('promotions.tagSurvey') : selectedPromo.action_type === 'detail' ? t('promotions.tagOffer') : t('promotions.tagPromo');
  const isSurvey = selectedPromo.action_type === 'survey';
  const surveyAlreadyDone = status?.survey_completed || surveyCompleted;

  const getCTA = () => {
    if (!status) return { text: t('promotions.claimOffer'), action: () => onClaim(selectedPromo), disabled: false };
    if (status.voucher_used) return { text: t('promotions.alreadyUsed'), action: undefined, disabled: true };
    if (status.voucher_claimed) return { text: t('promotions.viewInWallet'), action: onGoToWallet, disabled: false };
    if (status.action_type === 'survey' && status.survey_completed) return { text: t('promotions.alreadyCompleted'), action: undefined, disabled: true };
    return { text: t('promotions.claimOffer'), action: () => onClaim(selectedPromo), disabled: false };
  };

  const cta = getCTA();

  const remainingText = remainingVouchers != null && remainingVouchers > 0
    ? t('promotions.vouchersLeft', { count: remainingVouchers })
    : t('promotions.limitedSupply');

  const handleShare = async () => {
    const shareData: ShareData = {
      title: selectedPromo.title,
      text: selectedPromo.short_description || '',
      url: `${window.location.origin}${window.location.pathname}?promo=${selectedPromo.id}#promotions`,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url || '');
        useUIStore.getState().showToast(t('toast.linkCopied'), 'success');
      }
    } catch { /* user cancelled or not supported */ }
  };

  return (
    <div className="promo-screen-white">
      <div className="rd-hero">
        {img ? (
          <img src={img} alt="" loading="lazy" className="rd-hero-img promo-hero-img-fill" />
        ) : (
          <div className="rd-hero-img promo-hero-img-fallback" />
        )}
        <div className="rd-hero-overlay" />
        <button
          className="rd-back-btn"
          onClick={onBack}
          aria-label={t('common.back')}
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
            {isSurvey ? t('promotions.surveyDuration', { minutes: 2 }) : `${formatDate(selectedPromo.start_date)} – ${formatDate(selectedPromo.end_date)}`}
          </span>
          <span className={`rd-meta-pill ${isSurvey ? 'rd-pill-green' : 'rd-pill-brown'}`}>
            {isSurvey ? t('promotions.surveyReward', { amount: 5 }) : t('promotions.limitedVouchers')}
          </span>
        </div>

        <p className="rd-desc">
          {selectedPromo.long_description || selectedPromo.short_description || t('promotions.noDescription')}
        </p>

        {/* ── Survey Flow ── */}
        {isSurvey && isGuest && !surveyAlreadyDone && (
          <div className="guest-locked">
            <div className="guest-locked-icon" onClick={() => useUIStore.getState().triggerSignIn()} role="button" tabIndex={0}><Gift size={28} /></div>
            <div className="guest-locked-title">{t('promotions.signInToParticipate')}</div>
            <div className="guest-locked-desc">{t('promotions.signInToParticipateDesc')}</div>
            <button className="guest-locked-btn" onClick={() => useUIStore.getState().triggerSignIn()}>{t('auth.signIn')}</button>
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
                    placeholder={t('promotions.typeAnswer')}
                    onChange={(e) => onSurveyAnswer(q.id, e.target.value)}
                  />
                )}

                {q.question_type === 'dropdown' && q.options && (
                  <select
                    className="promo-survey-select"
                    onChange={(e) => onSurveyAnswer(q.id, e.target.value)}
                  >
                    <option value="">{t('promotions.selectOption')}</option>
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
              {submittingSurvey ? t('common.submitting') : t('promotions.submitSurvey')}
              <Gift size={16} />
            </button>
          </div>
        )}

        {isSurvey && surveyAlreadyDone && (
          <div className="rd-success-state">
            <CheckCircle size={48} className="promo-success-icon" />
            <p>{t('promotions.surveyCompleted')}</p>
            <p className="rd-success-sub">{t('promotions.surveyThankYou')}</p>
          </div>
        )}

        {/* ── Promo Claim Flow ── */}
        {!isSurvey && selectedPromo.how_to_redeem && (
          <>
            <div className="rd-section-title">
              <Star size={16} /> {t('promotions.howToRedeem')}
            </div>
            <p className="rd-desc promo-redeem-box">
              {selectedPromo.how_to_redeem}
            </p>
            <p className="rd-remaining-badge">
              <span className="promo-inline-icon"><Flame size={14} /></span>
              {remainingText}
            </p>
          </>
        )}

        {!isSurvey && selectedPromo.terms && selectedPromo.terms.length > 0 && (
          <>
            <div className="rd-section-title">
              <List size={16} /> {t('promotions.terms')}
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
            <div className="guest-locked-icon" onClick={() => useUIStore.getState().triggerSignIn()} role="button" tabIndex={0}><Gift size={28} /></div>
            <div className="guest-locked-title">{t('promotions.signInToClaim')}</div>
            <div className="guest-locked-desc">{t('promotions.signInToClaimDesc')}</div>
            <button className="guest-locked-btn btn btn-primary" onClick={() => useUIStore.getState().triggerSignIn()}>{t('auth.signIn')}</button>
          </div>
        )}

        {!isSurvey && !isGuest && !cta.disabled && (
          <>
            <button
              className="rd-action-btn"
              onClick={cta.action}
              disabled={claiming === selectedPromo.id}
            >
              <span>{claiming === selectedPromo.id ? t('common.processing') : cta.text}</span>
              <ArrowRight size={20} />
            </button>
            <button
              className="rd-action-btn-outline"
              onClick={handleShare}
            >
              <span>{t('common.share')}</span>
              <Share2 size={18} />
            </button>
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
        title={t('promotions.voucherUnlocked')}
        onClose={onCloseVoucher}
        onCopy={(_code) => onCopyVoucher()}
      />
    </div>
  );
}
