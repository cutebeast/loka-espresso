'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, Plus, Wallet } from 'lucide-react';
import { useWalletStore } from '@/stores/walletStore';
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

function formatPrice(val: number | string): string {
  const n = Number(val);
  if (!Number.isFinite(n)) return 'RM 0.00';
  return `RM ${n.toFixed(2)}`;
}

interface PaymentMethodItem {
  id: number;
  type: string;
  provider?: string;
  last4?: string;
  is_default: boolean;
}

export default function PaymentMethodsPage() {
  const { setPage, showToast } = useUIStore();
  const { balance } = useWalletStore();
  const [methods, setMethods] = useState<PaymentMethodItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/payments/methods')
      .then((res) => setMethods(Array.isArray(res.data) ? res.data : []))
      .catch(() => setMethods([]))
      .finally(() => setLoading(false));
  }, []);

  const providerIcon = (provider?: string) => {
    switch (provider?.toLowerCase()) {
      case 'visa': return '💳';
      case 'mastercard': return '💳';
      case 'tng': return '🪪';
      case 'grabpay': return '💚';
      default: return '💳';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: LOKA.bg }}>
      <PageHeader title="Payment Methods" onBack={() => setPage('profile')} />

      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div
          style={{
            background: LOKA.white,
            borderRadius: 20,
            padding: 18,
            border: `1px solid ${LOKA.borderSubtle}`,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              background: '#E8EDE0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Wallet size={24} color={LOKA.primary} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: LOKA.textPrimary }}>Loka Wallet</p>
            <p style={{ fontSize: 13, color: LOKA.textSecondary, marginTop: 2 }}>Balance: {formatPrice(balance)}</p>
          </div>
          <span
            style={{
              background: '#E8EDE0',
              color: LOKA.primary,
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            Default
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 4px' }}>
          <div style={{ flex: 1, height: 1, background: LOKA.borderSubtle }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: LOKA.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Saved Cards</span>
          <div style={{ flex: 1, height: 1, background: LOKA.borderSubtle }} />
        </div>

        <div
          style={{
            background: '#FFF7ED',
            border: '1px solid #FED7AA',
            color: '#9A3412',
            borderRadius: 16,
            padding: '12px 14px',
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          Saved card display is read-only for now. Card linking will be enabled together with the payment gateway rollout.
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1, 2].map((i) => (
              <div key={i} style={{ background: LOKA.white, borderRadius: 18, padding: 16, border: `1px solid ${LOKA.borderSubtle}`, height: 68 }} />
            ))}
          </div>
        ) : methods.length === 0 ? (
          <div
            style={{
              background: LOKA.white,
              borderRadius: 20,
              padding: 32,
              textAlign: 'center',
              border: `1px solid ${LOKA.borderSubtle}`,
            }}
          >
            <CreditCard size={36} color={LOKA.border} style={{ margin: '0 auto 10px' }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: LOKA.textMuted }}>No saved cards</p>
            <p style={{ fontSize: 12, color: LOKA.textSecondary, marginTop: 4 }}>Add a card for faster checkout</p>
          </div>
        ) : (
          methods.map((m) => (
            <motion.div
              key={m.id}
              whileTap={{ scale: 0.98 }}
              style={{
                background: LOKA.white,
                borderRadius: 18,
                padding: 16,
                border: `1px solid ${LOKA.borderSubtle}`,
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <span style={{ fontSize: 24 }}>{providerIcon(m.provider)}</span>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: LOKA.textPrimary }}>
                  {m.provider || 'Card'} •••• {m.last4 || '****'}
                </p>
                <p style={{ fontSize: 12, color: LOKA.textMuted, marginTop: 2, textTransform: 'capitalize' }}>
                  {m.type?.replace('_', ' ') || 'Payment card'}
                </p>
              </div>
              {m.is_default && (
                <span
                  style={{
                    background: '#E8EDE0',
                    color: LOKA.primary,
                    padding: '4px 10px',
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  Default
                </span>
              )}
            </motion.div>
          ))
        )}

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => showToast('Card linking will be enabled together with payment gateway integration', 'info')}
          disabled
          style={{
            width: '100%',
            padding: '14px 0',
            borderRadius: 999,
            border: `2px dashed ${LOKA.border}`,
            background: 'transparent',
            color: LOKA.textSecondary,
            fontWeight: 600,
            fontSize: 14,
            cursor: 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            opacity: 0.65,
          }}
        >
          <Plus size={18} /> Add Payment Method
        </motion.button>
      </div>
    </div>
  );
}
