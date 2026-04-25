'use client';

import { useState } from 'react';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import api from '@/lib/api';

export default function HelpSupportPage() {
  const { setPage, showToast, selectedStore } = useUIStore();
  const storeId = selectedStore?.id;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim() || !subject || !message.trim()) {
      showToast('Please fill in all required fields', 'error');
      return;
    }
    setSending(true);
    try {
      await api.post('/feedback', {
        store_id: storeId ?? undefined,
        rating: 5,
        comment: `Subject: ${subject}\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\nMessage: ${message}`,
      });
      setShowSuccess(true);
      setSubject('');
      setMessage('');
      setTimeout(() => setShowSuccess(false), 3000);
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
          <h1 className="sub-page-title">Help & Support</h1>
        </div>
        <div className="hsp-spacer" />
      </div>

      <div className="support-form-scroll">
        <div className="support-input-group">
          <label className="support-input-label">Your Name</label>
          <input
            type="text"
            className="support-input-field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sarah Renee"
          />
        </div>

        <div className="support-input-group">
          <label className="support-input-label">Email</label>
          <input
            type="email"
            className="support-input-field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="sarah@example.com"
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
          <select
            className="support-input-field hsp-select"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          >
            <option value="" disabled>Select a topic</option>
            <option value="feedback">General Feedback</option>
            <option value="order">Order Issue</option>
            <option value="rewards">Rewards / Points</option>
            <option value="technical">Technical Problem</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="support-input-group">
          <label className="support-input-label">Message</label>
          <textarea
            className="support-input-field"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell us how we can help…"
          />
        </div>

        <button className="support-submit-btn" onClick={handleSubmit} disabled={sending}>
          {sending ? 'Sending...' : 'Send Message'}
        </button>

        {showSuccess && (
          <p className="support-success-msg">
            <CheckCircle size={16} className="hsp-success-icon" />
            Message sent! We&apos;ll get back to you soon.
          </p>
        )}
      </div>
    </div>
  );
}
