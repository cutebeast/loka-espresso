'use client';

import { useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Clock, Package, Gift, AlertCircle, MessageSquare, PartyPopper } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import api from '@/lib/api';

const FAQ_ITEMS = [
  {
    q: 'How do I redeem my rewards?',
    a: 'Go to the Rewards page from the Profile menu. Browse available rewards, tap one to see details, and tap "Redeem". Show the generated code to the cashier at checkout.',
  },
  {
    q: 'Where is my order?',
    a: 'Track your order status on the Orders page in the bottom navigation. Active orders show real-time progress, and past orders show delivery history.',
  },
  {
    q: 'How does the loyalty program work?',
    a: 'Earn points on every order. As your points grow, you unlock higher tiers (Silver, Gold, Platinum) with better rewards and perks.',
  },
  {
    q: 'Can I cancel my order?',
    a: 'Orders can be cancelled while in "Pending" or "Confirmed" status. Tap on the order in the Orders page and select "Cancel Order" if available.',
  },
];

const SUBJECTS = [
  { id: 'feedback', label: 'General', icon: MessageSquare, bg: '#F5F0E6', stroke: '#4A2210' },
  { id: 'order', label: 'Order Issue', icon: Package, bg: '#FFF3E0', stroke: '#C4893A' },
  { id: 'rewards', label: 'Rewards', icon: Gift, bg: '#E6F0E8', stroke: '#3B4A1A' },
  { id: 'technical', label: 'Technical', icon: AlertCircle, bg: '#FDEAEA', stroke: '#C75050' },
];

export default function HelpSupportPage() {
  const { user } = useAuthStore();
  const { setPage, showToast, selectedStore } = useUIStore();
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
      showToast('Please fill all required fields', 'error');
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
      showToast('Failed to send message', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="support-screen">
      <div className="sub-page-header">
        <div className="sub-header-left">
          <button className="sub-back-btn" onClick={() => setPage('profile')} aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <h1 className="sub-page-title">Help &amp; Support</h1>
        </div>
        <div className="ad-spacer" />
      </div>

      <div className="support-form-scroll">
        {!showSuccess ? (
          <>
            {/* FAQ Section */}
            <div className="support-faq-section">
              <div className="support-faq-title">Frequently Asked Questions</div>
              {FAQ_ITEMS.map((item, i) => {
                const isOpen = expandedFaq === i;
                return (
                  <div key={i}>
                    <button
                      className="support-faq-item"
                      onClick={() => setExpandedFaq(isOpen ? null : i)}
                    >
                      <span className="support-faq-text">{item.q}</span>
                      {isOpen ? (
                        <ChevronUp size={16} className="support-faq-chevron" />
                      ) : (
                        <ChevronDown size={16} className="support-faq-chevron" />
                      )}
                    </button>
                    {isOpen && (
                      <div className="support-faq-answer">{item.a}</div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Contact Form */}
            <div className="support-form-section">
              <div className="support-input-group">
                <label className="support-input-label">Your Name</label>
                <input
                  type="text"
                  className="support-input-field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                />
              </div>

              <div className="support-input-group">
                <label className="support-input-label">Email</label>
                <input
                  type="email"
                  className="support-input-field"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>

              <div className="support-input-group">
                <label className="support-input-label">Phone (optional)</label>
                <input
                  type="tel"
                  className="support-input-field"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+60 12 345 6789"
                />
              </div>

              <div className="support-input-group">
                <label className="support-input-label">Subject</label>
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
                        <div className="support-subject-icon" style={{ background: s.bg }}>
                          <Icon size={16} stroke={s.stroke} />
                        </div>
                        <span className="support-subject-label">{s.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="support-input-group">
                <label className="support-input-label">Message</label>
                <textarea
                  className="support-input-field"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us how we can help..."
                />
              </div>

              <button className="support-submit-btn" onClick={handleSubmit} disabled={sending}>
                {sending ? 'Sending...' : 'Send Message'}
              </button>
            </div>
          </>
        ) : (
          /* Celebratory Success */
          <div className="support-celebratory">
            <div className="support-celebratory-icon"><PartyPopper size={40} /></div>
            <h3>Message Sent!</h3>
            <p>Thank you for reaching out. Our team will get back to you within 24 hours.</p>
            <button className="support-celebratory-back" onClick={() => setPage('home')}>
              Back to Home
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
