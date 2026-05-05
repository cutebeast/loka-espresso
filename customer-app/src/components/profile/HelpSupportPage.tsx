'use client';

import { useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Package, Gift, AlertCircle, MessageSquare, PartyPopper } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useTranslation } from '@/hooks/useTranslation';
import api from '@/lib/api';

const FAQ_ITEMS = [
  { id: 'q1' },
  { id: 'q2' },
  { id: 'q3' },
  { id: 'q4' },
];

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

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

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
        comment: `Subject: ${subject}\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\nMessage: ${message}`,
        tags: [subject],
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
            {/* FAQ Section */}
            <div className="support-faq-section">
              <div className="support-faq-title">{t('helpSupport.faqTitle')}</div>
              {FAQ_ITEMS.map((item, i) => {
                const isOpen = expandedFaq === i;
                return (
                  <div key={i}>
                    <button
                      className="support-faq-item"
                      onClick={() => setExpandedFaq(isOpen ? null : i)}
                    >
                      <span className="support-faq-text">{t(`helpSupport.faq.${item.id}` as const)}</span>
                      {isOpen ? (
                        <ChevronUp size={16} className="support-faq-chevron" />
                      ) : (
                        <ChevronDown size={16} className="support-faq-chevron" />
                      )}
                    </button>
                    {isOpen && (
                      <div className="support-faq-answer">{t(`helpSupport.faq.a${item.id.slice(1)}` as const)}</div>
                    )}
                  </div>
                );
              })}
            </div>

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
