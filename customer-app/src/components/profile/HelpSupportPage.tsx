'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Headset,
  MessageCircle,
  Phone,
  Mail,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Send,
} from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { PageHeader } from '@/components/shared';
import api from '@/lib/api';

const LOKA = {
  primary: '#384B16',
  copper: '#D18E38',
  copperSoft: 'rgba(209,142,56,0.12)',
  textPrimary: '#1B2023',
  textSecondary: '#3A4A5A',
  textMuted: '#6A7A8A',
  border: '#D4DCE5',
  borderSubtle: '#E4EAEF',
  surface: '#F5F7FA',
  bg: '#E4EAEF',
  white: '#FFFFFF',
} as const;

const FAQ_ITEMS = [
  {
    q: 'How do I place an order?',
    a: 'Browse the menu, add items to your cart, select your order type (pickup, delivery, or dine-in), and proceed to checkout.',
  },
  {
    q: 'How do I top up my wallet?',
    a: 'Go to the Wallet page from your profile or home screen, choose a top-up amount, and complete the payment.',
  },
  {
    q: 'How do loyalty points work?',
    a: 'You earn points on every order. Points can be redeemed for rewards in the Rewards catalog. Your tier upgrades as you earn more points.',
  },
  {
    q: 'How do I use a voucher?',
    a: 'During checkout, tap the voucher selector to apply an available voucher to your order. The discount is applied instantly.',
  },
  {
    q: 'How do I scan a QR code for dine-in?',
    a: 'Tap the QR icon in the navigation bar and point your camera at the table QR code. Your order will be linked to that table automatically.',
  },
  {
    q: 'Can I cancel an order?',
    a: 'Once placed, orders are sent to the kitchen immediately. Please contact the store directly for cancellation requests.',
  },
];

export default function HelpSupportPage() {
  const { setPage, showToast } = useUIStore();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [sending, setSending] = useState(false);

  const handleSendFeedback = async () => {
    if (!feedbackMsg.trim()) {
      showToast('Please enter a message', 'error');
      return;
    }
    setSending(true);
    try {
      await api.post('/feedback', {
        store_id: 0,
        rating: 5,
        comment: feedbackMsg.trim(),
      });
      showToast('Message sent! We\'ll get back to you soon.', 'success');
      setFeedbackMsg('');
    } catch {
      showToast('Failed to send message', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: LOKA.bg }}>
      <PageHeader title="Help & Support" onBack={() => setPage('profile')} />

      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <a
            href="mailto:hello@lokaespresso.com"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '16px 14px',
              borderRadius: 18,
              background: LOKA.white,
              border: `1px solid ${LOKA.borderSubtle}`,
              textDecoration: 'none',
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 14,
                background: '#E8EDE0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Mail size={18} color={LOKA.primary} />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: LOKA.textPrimary }}>Email Us</p>
              <p style={{ fontSize: 11, color: LOKA.textMuted, marginTop: 2 }}>hello@lokaespresso.com</p>
            </div>
          </a>
          <a
            href="tel:+60123456789"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '16px 14px',
              borderRadius: 18,
              background: LOKA.white,
              border: `1px solid ${LOKA.borderSubtle}`,
              textDecoration: 'none',
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 14,
                background: LOKA.copperSoft,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Phone size={18} color={LOKA.copper} />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: LOKA.textPrimary }}>Call Us</p>
              <p style={{ fontSize: 11, color: LOKA.textMuted, marginTop: 2 }}>+60 12-345 6789</p>
            </div>
          </a>
        </div>

        <div>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: LOKA.textPrimary, marginBottom: 12 }}>
            Frequently Asked Questions
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {FAQ_ITEMS.map((faq, i) => (
              <div
                key={i}
                style={{
                  background: LOKA.white,
                  borderRadius: 16,
                  border: `1px solid ${LOKA.borderSubtle}`,
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '14px 16px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    gap: 10,
                  }}
                >
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: LOKA.textPrimary }}>{faq.q}</span>
                  {openFaq === i ? <ChevronUp size={16} color={LOKA.textMuted} /> : <ChevronDown size={16} color={LOKA.textMuted} />}
                </button>
                {openFaq === i && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    style={{ padding: '0 16px 14px' }}
                  >
                    <p style={{ fontSize: 13, color: LOKA.textSecondary, lineHeight: 1.5 }}>{faq.a}</p>
                  </motion.div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: LOKA.textPrimary, marginBottom: 12 }}>
            Send us a message
          </h3>
          <div
            style={{
              background: LOKA.white,
              borderRadius: 20,
              padding: 18,
              border: `1px solid ${LOKA.borderSubtle}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <textarea
              value={feedbackMsg}
              onChange={(e) => setFeedbackMsg(e.target.value)}
              placeholder="How can we help?"
              rows={4}
              style={{
                width: '100%',
                padding: 12,
                borderRadius: 14,
                border: `1px solid ${LOKA.borderSubtle}`,
                fontSize: 14,
                color: LOKA.textPrimary,
                outline: 'none',
                background: LOKA.surface,
                resize: 'none',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleSendFeedback}
              disabled={sending}
              style={{
                width: '100%',
                padding: '14px 0',
                borderRadius: 999,
                background: sending ? LOKA.border : LOKA.primary,
                color: LOKA.white,
                fontWeight: 700,
                fontSize: 14,
                border: 'none',
                cursor: sending ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Send size={16} />
              {sending ? 'Sending...' : 'Send Message'}
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
