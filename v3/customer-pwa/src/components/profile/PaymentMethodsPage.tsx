'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Plus, CreditCard, Loader2, Check, X } from 'lucide-react';
import { useWalletStore } from '@/stores/walletStore';
import { useUIStore } from '@/stores/uiStore';
import { Skeleton } from '@/components/ui';
import { useTranslation } from '@/hooks/useTranslation';
import api from '@/lib/api';
import { formatPrice, LOKA } from '@/lib/tokens';

interface PaymentMethodItem {
  id: number;
  type: string;
  provider?: string;
  last4?: string;
  expiry?: string;
  is_default: boolean;
}

export default function PaymentMethodsPage() {
  const { setPage, showToast } = useUIStore();
  const { balance } = useWalletStore();
  const { t } = useTranslation();
  const [methods, setMethods] = useState<PaymentMethodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddCard, setShowAddCard] = useState(false);
  const [setupIntentSecret, setSetupIntentSecret] = useState<string | null>(null);
  const [setupIntentId, setSetupIntentId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [canConfirm, setCanConfirm] = useState(false);
  // Stable callback — an inline arrow would retrigger StripeCardInput's mount
  // effect on every keystroke and wipe the entered card details.
  const handleCardStatusChange = useCallback((complete: boolean) => setCanConfirm(complete), []);

  useEffect(() => {
    api.get('/payments/methods')
      .then((res) => {
        const raw = Array.isArray(res.data) ? res.data : [];
        setMethods(raw.map((m: Record<string, unknown>) => ({
          id: m.id as number,
          type: (m.method_type as string) || (m.type as string) || '',
          provider: (m.provider as string) || (m.card_brand as string) || '',
          last4: (m.card_last_four as string) || (m.last4 as string) || '',
          expiry: (m.card_expiry_month && m.card_expiry_year)
            ? `${m.card_expiry_month}/${String(m.card_expiry_year).slice(-2)}`
            : (m.expiry as string) || undefined,
          is_default: (m.is_default as boolean) ?? false,
        })));
      })
      .catch((err) => { console.error('[PaymentMethods] Fetch failed:', err); showToast(t('toast.failedToLoad'), 'error'); setMethods([]); })
      .finally(() => setLoading(false));
  }, [t, showToast]);

  const handleRemove = async (id: number) => {
    try {
      await api.delete(`/payments/methods/${id}`);
      setMethods((prev) => prev.filter((m) => m.id !== id));
      showToast(t('toast.cardRemoved'), 'success');
    } catch {
      showToast(t('toast.cardRemoveFailed'), 'error');
    }
  };

  const handleAdd = async () => {
    setShowAddCard(true);
    setAdding(true);
    setSetupIntentSecret(null);
    setSetupIntentId(null);

    try {
      const res = await api.post('/payments/methods/setup-intent');
      const data = res.data;
      setSetupIntentSecret(data.client_secret);
      setSetupIntentId(data.setup_intent_id);
    } catch (err) {
      console.error('[AddCard] SetupIntent failed:', err);
      showToast('Failed to initialize card form. Is Stripe configured?', 'error');
      setShowAddCard(false);
    } finally {
      setAdding(false);
    }
  };

  const handleConfirmAdd = async () => {
    if (!setupIntentId) return;
    setAdding(true);
    try {
      // Confirm the SetupIntent with Stripe first — the backend only accepts
      // a SetupIntent whose status is "succeeded".
      const stripe = (window as any).__stripe_instance;
      const elements = (window as any).__stripe_elements;
      if (!stripe || !elements) {
        showToast('Card form is not ready. Please try again.', 'error');
        return;
      }
      const { error } = await stripe.confirmSetup({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: 'if_required',
      });
      if (error) {
        showToast(error.message || 'Card confirmation failed', 'error');
        return;
      }

      const res = await api.post('/payments/methods', { setup_intent_id: setupIntentId });
      const newMethod = res.data;
      setMethods(prev => [...prev, {
        id: newMethod.id,
        type: newMethod.method_type || 'card',
        provider: newMethod.card_brand || newMethod.provider || '',
        last4: newMethod.card_last_four || '',
        expiry: newMethod.card_expiry_month
          ? `${newMethod.card_expiry_month}/${String(newMethod.card_expiry_year).slice(-2)}`
          : undefined,
        is_default: newMethod.is_default ?? false,
      }]);
      showToast('Card saved successfully', 'success');
      setShowAddCard(false);
      setSetupIntentSecret(null);
      setSetupIntentId(null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to save card';
      showToast(msg, 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleSetDefault = async (id: number) => {
    try {
      await api.put(`/payments/methods/${id}/default`);
      setMethods(prev => prev.map(m => ({ ...m, is_default: m.id === id })));
      showToast(t('toast.defaultCardUpdated'), 'success');
    } catch {
      showToast(t('toast.cardUpdateFailed'), 'error');
    }
  };

  const brandClass = (provider?: string, type?: string) => {
    const p = (provider || type || '').toLowerCase();
    if (p.includes('visa')) return 'visa';
    if (p.includes('master') || p.includes('mc')) return 'mc';
    return '';
  };

  const brandLabel = (provider?: string, type?: string) => {
    const p = (provider || type || '').toLowerCase();
    if (p.includes('visa')) return 'Visa';
    if (p.includes('master') || p.includes('mc')) return 'Mastercard';
    return (provider || type || 'Card').toUpperCase();
  };

  return (
    <div className="page-container" id="main-content">
      <div className="page-header">
        <button className="icon-btn" onClick={() => setPage('profile')} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <h1 className="page-title">{t('paymentMethods.title')}</h1>
      </div>

      <div className="page-content">
        {/* Wallet Balance */}
        <div className="payment-wallet-card">
          <div className="payment-wallet-label">{t('paymentMethods.walletBalance')}</div>
          <div className="payment-wallet-amount">{formatPrice(String(balance || 0))}</div>
          <button className="payment-wallet-topup" onClick={() => setPage('wallet')}>
            {t('paymentMethods.topUp')}
          </button>
        </div>

        {/* Saved Cards */}
        <div className="payment-section-title">{t('paymentMethods.savedCards')}</div>

        {loading ? (
          [1, 2].map(i => <Skeleton key={i} className="skeleton pm-skeleton" />)
        ) : methods.length === 0 ? (
          <div className="payment-empty">
            <div className="payment-empty-icon">
              <CreditCard size={32} color={LOKA.copper} />
            </div>
            <div className="payment-empty-title">{t('paymentMethods.noMethods')}</div>
            <div className="payment-empty-text">{t('paymentMethods.noMethodsDesc')}</div>
            <button className="payment-empty-cta" onClick={handleAdd} disabled={adding}>
              <Plus size={14} />
              {t('paymentMethods.addCard')}
            </button>
          </div>
        ) : (
          <>
            {methods.map((m) => (
              <div key={m.id} className={`payment-card-item ${m.is_default ? 'is-default' : ''}`}>
                <div className={`payment-card-brand ${brandClass(m.provider, m.type)}`}>
                  {brandLabel(m.provider, m.type)}
                </div>
                <div className="payment-card-info">
                  <div className="payment-card-number">
                    {t('paymentMethods.endingIn', { brand: brandLabel(m.provider, m.type), last4: m.last4 || '' })}
                  </div>
                  {m.expiry && <div className="payment-card-expiry">{m.expiry}</div>}
                  {m.is_default && <span className="payment-card-default-badge">{t('paymentMethods.default')}</span>}
                </div>
                <div className="payment-card-actions">
                  {!m.is_default && (
                    <button className="text-btn" onClick={() => handleSetDefault(m.id)}>
                      {t('paymentMethods.setDefault')}
                    </button>
                  )}
                  <button className="text-btn danger" onClick={() => handleRemove(m.id)}>
                    {t('common.remove')}
                  </button>
                </div>
              </div>
            ))}
            <button className="payment-add-btn" onClick={handleAdd} disabled={adding}>
              <Plus size={16} />
              {t('paymentMethods.addCard')}
            </button>
          </>
        )}

        {/* Add Card Modal */}
        {showAddCard && (
          <div className="modal-overlay" onClick={() => !adding && setShowAddCard(false)}>
            <div className="modal-card" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{t('paymentMethods.addCard')}</h2>
                {!adding && (
                  <button className="icon-btn" onClick={() => setShowAddCard(false)}>
                    <X size={20} />
                  </button>
                )}
              </div>

              <div className="modal-body">
                {adding && !setupIntentSecret && (
                  <div style={{ textAlign: 'center', padding: 32 }}>
                    <Loader2 size={32} className="animate-spin" style={{ color: LOKA.primary }} />
                    <div style={{ marginTop: 12, color: '#666' }}>Initializing secure card form…</div>
                  </div>
                )}

                {setupIntentSecret && (
                  <>
                    <div style={{ marginBottom: 16, fontSize: 14, color: '#666' }}>
                      Enter your card details below. Your card information is processed securely by Stripe and never touches our servers.
                    </div>

                    {/* Stripe Elements iframe */}
                    <div style={{
                      border: '1px solid #e0e0e0',
                      borderRadius: 10,
                      padding: 16,
                      marginBottom: 16,
                      background: '#fafafa',
                    }}>
                      <StripeCardInput
                        clientSecret={setupIntentSecret}
                        onStatusChange={handleCardStatusChange}
                      />
                    </div>

                    <button
                      className="btn-primary"
                      onClick={handleConfirmAdd}
                      disabled={adding || !canConfirm}
                      style={{
                        width: '100%',
                        padding: '14px',
                        fontSize: 16,
                        fontWeight: 700,
                        borderRadius: 10,
                        border: 'none',
                        cursor: canConfirm && !adding ? 'pointer' : 'not-allowed',
                        opacity: canConfirm && !adding ? 1 : 0.5,
                        background: LOKA.primary,
                        color: 'white',
                      }}
                    >
                      {adding ? <Loader2 size={20} className="animate-spin" /> : (
                        <>
                          <Check size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                          Save Card
                        </>
                      )}
                    </button>
                  </>
                )}

                {!adding && !setupIntentSecret && (
                  <div style={{ textAlign: 'center', padding: 24, color: '#999' }}>
                    Failed to initialize. Please try again.
                    <br />
                    <button onClick={handleAdd} style={{ marginTop: 12, color: LOKA.primary, background: 'none', border: 'none', cursor: 'pointer' }}>
                      Retry
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── StripeCardInput: renders Stripe Elements in an iframe ──
// This component loads Stripe.js and mounts a PaymentElement inside a container.
function StripeCardInput({
  clientSecret,
  onStatusChange,
}: {
  clientSecret: string;
  onStatusChange: (complete: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [stripeLoaded, setStripeLoaded] = useState(false);
  const [publishableKey, setPublishableKey] = useState<string | null>(
    () => (window as any).__STRIPE_PUBLISHABLE_KEY__ || null
  );
  const [, setElements] = useState<any>(null);

  // Load Stripe.js
  useEffect(() => {
    if ((window as any).Stripe) {
      setStripeLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.async = true;
    script.onload = () => setStripeLoaded(true);
    script.onerror = () => setError('Failed to load Stripe. Check your network.');
    document.head.appendChild(script);
  }, []);

  // Fetch the publishable key BEFORE mounting the PaymentElement
  useEffect(() => {
    if (publishableKey) return;
    api.get('/payments/config').then(res => {
      const key = res.data?.stripe_publishable_key || res.data?.publishable_key;
      if (key) {
        (window as any).__STRIPE_PUBLISHABLE_KEY__ = key;
        setPublishableKey(key);
      } else {
        setError('Stripe publishable key not configured.');
      }
    }).catch(() => setError('Stripe publishable key not configured.'));
  }, [publishableKey]);

  // Mount PaymentElement once Stripe.js and the publishable key are ready
  useEffect(() => {
    if (!stripeLoaded || !publishableKey || !containerRef.current || !(window as any).Stripe) return;

    const stripe = (window as any).Stripe(publishableKey);
    const elements = stripe.elements({
      clientSecret: clientSecret,
      appearance: { theme: 'stripe' },
    });

    const paymentElement = elements.create('payment', {
      layout: { type: 'accordion', defaultCollapsed: false },
      wallets: { applePay: 'never', googlePay: 'never' },
    });

    paymentElement.mount(containerRef.current);
    setElements(elements);

    paymentElement.on('change', (event: any) => {
      onStatusChange(event.complete);
      if (event.error) setError(event.error.message);
    });

    // Store for confirm
    (window as any).__stripe_elements = elements;
    (window as any).__stripe_instance = stripe;

    return () => {
      paymentElement.destroy();
    };
  }, [stripeLoaded, publishableKey, clientSecret, onStatusChange]);

  if (error) {
    return <div style={{ color: 'var(--color-danger)', fontSize: 14, padding: 8 }}>{error}</div>;
  }

  if (!stripeLoaded || !publishableKey) {
    return (
      <div style={{ textAlign: 'center', padding: 16 }}>
        <Loader2 size={24} className="animate-spin" style={{ color: LOKA.primary }} />
      </div>
    );
  }

  return <div ref={containerRef} />;
}
