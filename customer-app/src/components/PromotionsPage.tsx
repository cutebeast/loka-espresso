'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ChevronRight, Gift } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import api from '@/lib/api';
import type { PromoBanner } from '@/lib/api';
import { VoucherSection } from './promotions';
import { resolveAssetUrl, LOKA } from '@/lib/tokens';
import { useTranslation } from '@/hooks/useTranslation';

interface BannerStatus {
  action_type: string;
  survey_completed?: boolean;
  voucher_claimed?: boolean;
  voucher_used?: boolean;
  voucher_code?: string;
  remaining?: number | null;
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

export default function PromotionsPage({ onBack, preselectedId }: PromotionsPageProps) {
  const { t } = useTranslation();
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
      if (!isGuest) {
        const statuses = await Promise.all(active.map((p: PromoBanner) => api.get(`/promos/banners/${p.id}/status`).then((r) => ({ id: p.id, status: r.data })).catch(() => null)));
        const map: Record<number, BannerStatus> = {};
        statuses.forEach((s) => { if (s) map[s.id] = s.status; });
        setBannerStatus(map);
      }
    } catch (err) { console.error('[PromotionsPage] Failed to load promotions:', err); setPromotions([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadPromotions();
  }, [loadPromotions]);

  const loadSurveyQuestions = useCallback(async (surveyId: number) => {
    try {
      const res = await api.get(`/surveys/${surveyId}`);
      setSurveyQuestions(res.data.questions || []);
    } catch (err) { console.error('[PromotionsPage] Failed to load survey questions:', err);
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
    if (isGuest) { showToast(t('promotions.signInToClaim'), 'info'); return; }
    setClaiming(promo.id);
    try {
      const res = await api.post(`/promos/banners/${promo.id}/claim`);
      const code = res.data?.voucher_code || res.data?.redemption_code || '';
      if (code) { setShowVoucher(code); await loadPromotions(); }
      else showToast(t('promotions.offerClaimed'), 'success');
    } catch (err) { console.error('[PromotionsPage] Claim failed:', err); showToast(t('promotions.failedToClaim'), 'error'); }
    finally { setClaiming(null); }
  };

  const handleSubmitSurvey = async () => {
    if (isGuest) { showToast(t('promotions.signInToSurvey'), 'info'); return; }
    if (!selectedPromo?.survey_id) return;
    const unanswered = surveyQuestions.filter((q) => q.is_required && !surveyAnswers[q.id]);
    if (unanswered.length > 0) {
      showToast(t('promotions.answerRequired'), 'error');
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
        showToast(res.data.message || t('promotions.alreadySubmitted'), 'info');
        setSurveyCompleted(true);
      } else {
        const code = res.data?.voucher_code || '';
        if (code) setShowVoucher(code);
        else showToast('Survey submitted! Thank you.', 'success');
        setSurveyCompleted(true);
        await loadPromotions();
      }
    } catch (err) { console.error('[PromotionsPage] Failed to submit survey:', err);
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

  const handleSurveyAnswer = useCallback((questionId: number, value: string | number) => {
    setSurveyAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const handleBackFromDetail = () => {
    setSelectedPromo(null);
    setSurveyQuestions([]);
    setSurveyAnswers({});
    setSurveyCompleted(false);
  };

  if (selectedPromo) {
    return (
      <VoucherSection
        selectedPromo={selectedPromo}
        status={bannerStatus[selectedPromo.id]}
        claiming={claiming}
        isGuest={isGuest}
        surveyQuestions={surveyQuestions}
        surveyAnswers={surveyAnswers}
        submittingSurvey={submittingSurvey}
        surveyCompleted={surveyCompleted}
        showVoucher={showVoucher}
        remainingVouchers={bannerStatus[selectedPromo.id]?.remaining ?? null}
        onBack={handleBackFromDetail}
        onClaim={handleClaim}
        onSubmitSurvey={handleSubmitSurvey}
        onSurveyAnswer={handleSurveyAnswer}
        onCloseVoucher={() => { setShowVoucher(null); setSelectedPromo(null); }}
        onCopyVoucher={() => { showToast('Code copied!', 'success'); setPage('my-rewards'); }}
        onGoToWallet={() => { setPage('my-rewards'); setSelectedPromo(null); }}
      />
    );
  }

  return (
    <div className="promotions-screen">
      {/* Header */}
      <div className="promotions-header">
        <div className="promotions-header-left">
          <button className="promotions-back-btn" onClick={onBack}><ArrowLeft size={20} /></button>
          <h1 className="promotions-page-title">{t('promotions.title')}</h1>
        </div>
      </div>

      {/* Horizontal carousel */}
      {!loading && promotions.length > 0 && (
        <div className="promotions-carousel-wrap">
          <div className="promotions-carousel">
            {promotions.map(promo => (
              <div key={promo.id} className="promotions-promo-card" onClick={() => handleSelectPromo(promo)}>
                {promo.image_url && <img src={resolveAssetUrl(promo.image_url) || ''} alt="" className="promotions-card-bg-img" loading="lazy" />}
                <div className="promotions-promo-content">
                  <div className="promotions-promo-title">{promo.title}</div>
                  {promo.short_description && <div className="promotions-promo-sub">{promo.short_description}</div>}
                  <button className="promotions-promo-btn" onClick={(e) => { e.stopPropagation(); handleSelectPromo(promo); }}>{t('common.view')}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="promotions-tab-bar">
        <button className="promotions-tab" onClick={() => setPage('rewards')}>{t('promotions.pointRewards')}</button>
        <button className="promotions-tab active">{t('promotions.title')}</button>
      </div>

      {/* Empty state */}
      {!loading && promotions.length === 0 && (
        <div className="promotions-empty">
          <div className="promotions-empty-icon"><Gift size={40} color={LOKA.borderLight} /></div>
          <p className="promotions-empty-title">{t('promotions.noPromotions')}</p>
          <p className="promotions-empty-text">{t('promotions.checkBackSoon')}</p>
        </div>
      )}

      {/* Card list (below tab bar) */}
      {promotions.length > 0 && (
        <div className="promotions-card-list">
          {promotions.map(promo => {
            const img = resolveAssetUrl(promo.image_url);
            return (
              <div key={promo.id} className="promotions-list-card" onClick={() => handleSelectPromo(promo)}>
                <div className="promotions-card-thumb">
                  {img ? <img src={img} alt="" loading="lazy" /> : <Gift size={24} color={LOKA.border} />}
                </div>
                <div className="promotions-card-body">
                  <div className="promotions-card-title">{promo.title}</div>
                  {promo.short_description && <div className="promotions-card-desc">{promo.short_description}</div>}
                  <div className={`promotions-card-tag ${promo.action_type === 'survey' ? 'tag-survey' : 'tag-promo'}`}>
                    {promo.action_type === 'survey' ? 'Survey' : 'Promo'}
                  </div>
                </div>
                <div className="promotions-card-arrow"><ChevronRight size={16} /></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
