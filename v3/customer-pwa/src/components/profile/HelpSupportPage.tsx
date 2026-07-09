'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Package, Gift, AlertCircle, MessageSquare, PartyPopper } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useTranslation } from '@/hooks/useTranslation';
import api from '@/lib/api';

interface HelpArticle {
  id: number;
  slug: string;
  title: string;
  audience: string;
  category: string | null;
  body_text: string | null;
}

const SUBJECTS = [
  { id: 'feedback', icon: MessageSquare, bg: '#F5F0E6', stroke: '#4A2210' },
  { id: 'order', icon: Package, bg: '#FFF3E0', stroke: '#C4893A' },
  { id: 'rewards', icon: Gift, bg: '#E6F0E8', stroke: '#3B4A1A' },
  { id: 'technical', icon: AlertCircle, bg: '#FDEAEA', stroke: '#C75050' },
];

export default function HelpSupportPage() {
  const { user } = useAuthStore();
  const { setPage, showToast, selectedStore } = useUIStore();
  const { t } = useTranslation();
  const storeId = selectedStore?.id;

  const [name, setName] = useState(user?.display_name || '');
  const [email, setEmail] = useState(user?.email_address || '');
  const [phone, setPhone] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [articles, setArticles] = useState<HelpArticle[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(true);

  const fetchArticles = useCallback(async () => {
    try {
      const res = await api.get('/public/help/articles', { params: { audience: 'customer', per_page: 50 } });
      const data = res.data;
      setArticles((data && typeof data === 'object' && Array.isArray(data.items) ? data.items : data) || []);
    } catch {
      // articles are optional, fail silently
    } finally {
      setArticlesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim() || !subject || !message.trim()) {
      showToast(t('toast.fieldsRequired'), 'error');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      showToast(t('toast.emailInvalid'), 'error');
      return;
    }
    setSending(true);
    try {
      await api.post('/feedback', {
        store_id: storeId ?? undefined,
        rating: 5,
        title: subject,
        body: `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\nMessage: ${message}`,
      });
      setShowSuccess(true);
      setSubject('');
      setMessage('');
    } catch {
      showToast(t('toast.feedbackFailed'), 'error');
    } finally {
      setSending(false);
    }
  };

  const categories = Array.from(new Set(articles.map((a) => a.category).filter(Boolean)));

  return (
    <div className="support-screen">
      <div className="sub-page-header">
        <div className="sub-header-left">
          <button className="sub-back-btn" onClick={() => setPage('profile')} aria-label={t('common.back')}>
            <ArrowLeft size={20} />
          </button>
          <h1 className="sub-page-title">{t('helpSupport.title')}</h1>
        </div>
        <div className="ad-spacer" />
      </div>

      <div className="support-form-scroll">
        {!showSuccess ? (
          <>
            {/* Help Articles from API */}
            {!articlesLoading && articles.length > 0 && (
              <div className="support-faq-section">
                <div className="support-faq-title">{t('helpSupport.faqTitle')}</div>
                {categories.map((category) => (
                  <div key={category}>
                    {categories.length > 1 && (
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, textTransform: 'capitalize', color: 'var(--loka-text-muted)' }}>
                        {category}
                      </div>
                    )}
                    {articles
                      .filter((a) => a.category === category)
                      .map((item) => {
                        const isOpen = expandedFaq === item.id;
                        return (
                          <div key={item.id}>
                            <button
                              className="support-faq-item"
                              onClick={() => setExpandedFaq(isOpen ? null : item.id)}
                            >
                              <span className="support-faq-text">{item.title}</span>
                              {isOpen ? (
                                <ChevronUp size={16} className="support-faq-chevron" />
                              ) : (
                                <ChevronDown size={16} className="support-faq-chevron" />
                              )}
                            </button>
                            {isOpen && (
                              <div
                                className="support-faq-answer"
                                dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(item.body_text || '') }}
                              />
                            )}
                          </div>
                        );
                      })}
                  </div>
                ))}
                {articles.some((a) => !a.category) && (
                  <div>
                    {articles
                      .filter((a) => !a.category)
                      .map((item) => {
                        const isOpen = expandedFaq === item.id;
                        return (
                          <div key={item.id}>
                            <button
                              className="support-faq-item"
                              onClick={() => setExpandedFaq(isOpen ? null : item.id)}
                            >
                              <span className="support-faq-text">{item.title}</span>
                              {isOpen ? (
                                <ChevronUp size={16} className="support-faq-chevron" />
                              ) : (
                                <ChevronDown size={16} className="support-faq-chevron" />
                              )}
                            </button>
                            {isOpen && (
                              <div
                                className="support-faq-answer"
                                dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(item.body_text || '') }}
                              />
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {/* Contact Form */}
            <div className="support-form-section">
              <div className="support-input-group">
                <label className="support-input-label" htmlFor="hs-name">{t('helpSupport.yourName')}</label>
            <input id="hs-name"                   type="text"
                  className="support-input-field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('helpSupport.namePlaceholder')}
                />
              </div>

              <div className="support-input-group">
                <label className="support-input-label">{t('helpSupport.email')}</label>
                <input
                  type="email"
                  className="support-input-field"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('helpSupport.emailPlaceholder')}
                />
              </div>

              <div className="support-input-group">
                <label className="support-input-label">{t('helpSupport.phoneOptional')}</label>
                <input
                  type="tel"
                  className="support-input-field"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t('helpSupport.phonePlaceholder')}
                />
              </div>

              <div className="support-input-group">
                <label className="support-input-label" htmlFor="hs-subject">{t('helpSupport.subject')}</label>
                <div className="support-subject-cards">
                  {SUBJECTS.map((s) => {
                    const Icon = s.icon;
                    const selected = subject === s.id;
                    return (
                      <div
                        key={s.id}
                        className={`support-subject-card ${selected ? 'selected' : ''}`}
                        onClick={() => setSubject(s.id)}
                      >
                        <div className="support-subject-icon" style={{ background: s.bg as string }}>
                          <Icon size={16} stroke={s.stroke} />
                        </div>
                        <span className="support-subject-label">{t(`helpSupport.subjects.${s.id}`)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="support-input-group">
                <label className="support-input-label">{t('helpSupport.message')}</label>
                <textarea
                  className="support-input-field"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t('helpSupport.messagePlaceholder')}
                />
              </div>

              <button className="support-submit-btn" onClick={handleSubmit} disabled={sending}>
                {sending ? t('common.loading') : t('helpSupport.sendMessage')}
              </button>
            </div>
          </>
        ) : (
          /* Celebratory Success */
          <div className="support-celebratory">
            <div className="support-celebratory-icon"><PartyPopper color="#C9A84C" size={40} /></div>
            <h3>{t('helpSupport.messageSent')}</h3>
            <p>{t('helpSupport.messageSentDesc')}</p>
            <button className="support-celebratory-back" onClick={() => setPage('home')}>
              {t('helpSupport.backToHome')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function renderSimpleMarkdown(md: string): string {
  return md
    .replace(/^### (.*$)/gim, "<h3>$1</h3>")
    .replace(/^## (.*$)/gim, "<h2>$1</h2>")
    .replace(/^# (.*$)/gim, "<h1>$1</h1>")
    .replace(/^\> (.*$)/gim, "<blockquote>$1</blockquote>")
    .replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/gim, "<em>$1</em>")
    .replace(/\n/g, "<br />");
}
