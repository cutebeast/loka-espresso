'use client';

import { useState, useEffect } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';

interface StripePaymentSheetProps {
  clientSecret: string;
  paymentId: number;
  orderId: number;
  publishableKey: string;
  onSuccess: () => void;
  onCancel: () => void;
  onError: (message: string) => void;
}

function PaymentForm({ paymentId, orderId, onSuccess, onCancel, onError }: Omit<StripePaymentSheetProps, 'clientSecret' | 'publishableKey'>) {
  const { t } = useTranslation();
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);

    const returnUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/#order-detail?orderId=${orderId}&paymentId=${paymentId}&status=success`
      : undefined;

    try {
      // Confirm on the client; Stripe handles card/FPX/GrabPay/DuitNow redirects.
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: returnUrl || '',
        },
        redirect: 'if_required',
      });

      if (error) {
        if (error.type === 'card_error' || error.type === 'validation_error') {
          onError(error.message || t('toast.paymentFailed'));
        } else {
          onError(t('toast.paymentFailed'));
        }
        return;
      }

      // No redirect required (e.g. card succeeded immediately).
      await api.post(`/payments/${paymentId}/confirm`, {});
      onSuccess();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('toast.paymentFailed');
      onError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white hover:bg-white/10"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={!stripe || submitting}
          className="flex-[2] rounded-xl bg-[#C8A46E] px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
        >
          {submitting ? <Loader2 size={16} className="mx-auto animate-spin" /> : t('checkout.payNow')}
        </button>
      </div>
    </form>
  );
}

export default function StripePaymentSheet(props: StripePaymentSheetProps) {
  const { clientSecret, publishableKey, ...rest } = props;
  const [stripe, setStripe] = useState<Stripe | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    let mounted = true;
    loadStripe(publishableKey)
      .then((s) => {
        if (!mounted) return;
        if (!s) setLoadError(t('toast.paymentGatewayUnavailable'));
        else setStripe(s);
      })
      .catch(() => setLoadError(t('toast.paymentGatewayUnavailable')));
    return () => { mounted = false; };
  }, [publishableKey, t]);

  if (loadError) {
    return <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{loadError}</div>;
  }

  if (!stripe) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={24} className="animate-spin text-[#C8A46E]" />
      </div>
    );
  }

  return (
    <Elements stripe={stripe} options={{ clientSecret, appearance: { theme: 'night', variables: { colorPrimary: '#C8A46E' } } }}>
      <PaymentForm {...rest} />
    </Elements>
  );
}
