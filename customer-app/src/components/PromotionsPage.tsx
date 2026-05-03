'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Gift } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import api from '@/lib/api';
import type { PromoBanner } from '@/lib/api';
import { VoucherSection } from './promotions';
import { resolveAssetUrl } from '@/lib/tokens';

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
      if (!isGuest) {
        const statuses = await Promise.all(active.map((p: PromoBanner) => api.get(`/promos/banners/${p.id}/status`).then((r) => ({ id: p.id, status: r.data })).catch(() => null)));
        const map: Record<number, BannerStatus> = {};
        statuses.forEach((s) => { if (s) map[s.id] = s.status; });
        setBannerStatus(map);
      }
    } catch { console.error("Failed to load promotions"); setPromotions([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadPromotions();
  }, [loadPromotions]);

  const loadSurveyQuestions = useCallback(async (surveyId: number) => {
    try {
      const res = await api.get(`/surveys/${surveyId}`);
      setSurveyQuestions(res.data.questions || []);
    } catch (err: any) { console.error("Failed to load");
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
    } catch { console.error("Claim failed"); showToast('Failed to claim offer', 'error'); }
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
    } catch (err: any) { console.error("Failed to load");
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
          <h1 className="promotions-page-title">Promotions</h1>
        </div>
      </div>

      {/* Horizontal carousel — fills the points+progress space */}
      {!loading && promotions.length > 0 ? (
        <div className="promotions-hero">
          <div className="promotions-carousel">
            {promotions.map(promo => (
              <div key={promo.id} className="promotions-carousel-item" onClick={() => handleSelectPromo(promo)}>
                {promo.image_url && <img src={resolveAssetUrl(promo.image_url) || ''} alt="" />}
                <div className="promotions-carousel-item-content">
                  <div className="promotions-carousel-item-title">{promo.title}</div>
                  {promo.short_description && <div className="promotions-carousel-item-sub">{promo.short_description}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Tab bar */}
      <div className="promotions-tab-bar">
        <button className="promotions-tab" onClick={() => setPage('rewards')}>Point Rewards</button>
        <button className="promotions-tab active">Promotions</button>
      </div>

      {/* Empty state */}
      {!loading && promotions.length === 0 && (
        <div className="promotions-empty">
          <div className="promotions-empty-icon"><Gift size={40} color="#D4DCE5" /></div>
          <p className="promotions-empty-title">No promotions available</p>
          <p className="promotions-empty-text">Check back soon for new offers</p>
        </div>
      )}
    </div>
  );
}
