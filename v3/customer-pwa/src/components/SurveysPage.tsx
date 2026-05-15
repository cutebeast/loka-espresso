'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, ClipboardCheck, ChevronRight, Send, CheckCircle, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/stores/uiStore';
import { useTranslation } from '@/hooks/useTranslation';
import api from '@/lib/api';
import type { Survey, SurveyQuestion } from '@/lib/api';
import { GuestGate } from '@/components/auth/GuestGate';

export default function SurveysPage() {
  const { t } = useTranslation();
  const { setPage, showToast } = useUIStore();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSurvey, setSelectedSurvey] = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  const fetchSurveys = useCallback(async () => {
    try {
      const res = await api.get('/surveys');
      const data = Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
      setSurveys(data);
    } catch {
      setSurveys([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSurveys(); }, [fetchSurveys]);

  const openSurvey = async (survey: Survey) => {
    setSelectedSurvey(survey);
    setAnswers({});
    setCompleted(false);
    try {
      const res = await api.get(`/surveys/${survey.id}`);
      const data = res.data;
      setQuestions(data.questions || []);
    } catch {
      setQuestions(survey.questions || []);
    }
  };

  const handleAnswer = (questionId: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = async () => {
    if (!selectedSurvey) return;
    setSubmitting(true);
    try {
      const answerList = questions.map((q) => ({
        question_id: q.id,
        answer: answers[q.id!] || '',
      }));
      await api.post(`/surveys/${selectedSurvey.id}/submit`, { answers: answerList });
      setCompleted(true);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to submit survey';
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = () => {
    return questions.every((q) => !q.required || (answers[q.id!] && answers[q.id!].trim()));
  };

  return (
    <div className="h-full bg-bg flex flex-col">
      <div className="loka-page-header">
        <button className="loka-back-btn" onClick={() => setPage('profile')} aria-label={t('common.back')}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-text-primary">{t('surveys.title') || 'Surveys'}</h1>
      </div>

      <div className="flex-1 overflow-y-auto scroll-container p-4">
        <GuestGate>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-bg-card rounded-2xl p-4 shadow-card animate-pulse">
                  <div className="h-4 bg-border-subtle rounded w-2/3 mb-3" />
                  <div className="h-3 bg-border-subtle rounded w-full mb-2" />
                  <div className="h-3 bg-border-subtle rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : selectedSurvey ? (
            /* Survey Detail */
            <div>
              <button onClick={() => { setSelectedSurvey(null); setCompleted(false); }} className="text-primary text-sm font-semibold mb-4 flex items-center gap-1">
                <ArrowLeft size={16} /> {t('common.back') || 'Back'}
              </button>
              <div className="bg-bg-card rounded-2xl p-4 shadow-card mb-4">
                <h2 className="text-lg font-bold text-text-primary">{selectedSurvey.title}</h2>
                {selectedSurvey.description && (
                  <p className="text-sm text-text-secondary mt-1">{selectedSurvey.description}</p>
                )}
              </div>

              {completed ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-primary-light/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle size={32} className="text-primary" />
                  </div>
                  <h3 className="text-lg font-bold text-text-primary">{t('surveys.thankYou') || 'Thank You!'}</h3>
                  <p className="text-sm text-text-secondary mt-1">{t('surveys.responseSubmitted') || 'Your response has been submitted.'}</p>
                  <button onClick={() => { setSelectedSurvey(null); setCompleted(false); fetchSurveys(); }} className="btn btn-primary mt-6 px-6">
                    {t('surveys.backToSurveys') || 'Back to Surveys'}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {questions.map((q, i) => (
                    <div key={q.id || i} className="bg-bg-card rounded-2xl p-4 shadow-card border border-border-subtle">
                      <p className="text-sm font-semibold text-text-primary mb-2">
                        {i + 1}. {q.question_text}
                        {q.required && <span className="text-danger ml-1">*</span>}
                      </p>
                      {q.question_type === 'text' && (
                        <textarea
                          value={answers[q.id!] || ''}
                          onChange={(e) => handleAnswer(q.id!, e.target.value)}
                          rows={2}
                          placeholder={t('surveys.typeAnswer') || 'Type your answer...'}
                          className="w-full bg-bg-light rounded-xl px-4 py-3 border border-border-subtle focus:border-primary outline-none text-base text-text-primary resize-none"
                        />
                      )}
                      {q.question_type === 'rating' && (
                        <div className="flex gap-2">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => handleAnswer(q.id!, String(star))}
                              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                                Number(answers[q.id!]) >= star
                                  ? 'bg-primary text-white'
                                  : 'bg-bg-light text-text-muted hover:bg-primary/10'
                              }`}
                            >
                              <Star size={18} fill={Number(answers[q.id!]) >= star ? 'currentColor' : 'none'} />
                            </button>
                          ))}
                        </div>
                      )}
                      {(q.question_type === 'single_choice' || q.question_type === 'multiple_choice') && q.options && (
                        <div className="flex flex-col gap-2">
                          {q.options.map((opt, oi) => (
                            <button
                              key={oi}
                              type="button"
                              onClick={() => handleAnswer(q.id!, opt)}
                              className={`text-left px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${
                                answers[q.id!] === opt
                                  ? 'border-primary bg-primary/5 text-primary'
                                  : 'border-border-subtle bg-bg-light text-text-secondary hover:border-primary/30'
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !canSubmit()}
                    className="btn btn-primary w-full h-12 rounded-xl text-base font-semibold"
                  >
                    {submitting ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <Send size={18} /> {t('surveys.submit') || 'Submit'}
                      </span>
                    )}
                  </button>
                </div>
              )}
            </div>
          ) : surveys.length === 0 ? (
            <div className="text-center pt-16">
              <ClipboardCheck size={48} className="mx-auto text-text-muted mb-4" />
              <p className="text-text-secondary font-medium">{t('surveys.emptyTitle') || 'No surveys available'}</p>
              <p className="text-text-muted text-sm mt-1">{t('surveys.emptySubtitle') || 'Check back later for new surveys'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {surveys.map((s) => (
                <button
                  key={s.id}
                  onClick={() => openSurvey(s)}
                  className="w-full bg-bg-card rounded-2xl p-4 shadow-card border border-border-subtle text-left hover:border-primary/30 transition-colors flex items-center justify-between"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-text-primary truncate">{s.title}</p>
                    {s.description && <p className="text-sm text-text-secondary mt-1 line-clamp-2">{s.description}</p>}
                    <p className="text-xs text-text-muted mt-2">{t('surveys.tapToParticipate') || 'Tap to participate'}</p>
                  </div>
                  <ChevronRight size={20} className="text-text-muted flex-shrink-0 ml-3" />
                </button>
              ))}
            </div>
          )}
        </GuestGate>
      </div>
    </div>
  );
}
