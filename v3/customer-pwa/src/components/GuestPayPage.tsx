'use client';

import { useState, useEffect, useCallback } from 'react';
import { CreditCard, CheckCircle, XCircle, Loader2, Smartphone, Utensils, ShoppingBag, Truck, Wallet } from 'lucide-react';
import api from '@/lib/api';
import { useUIStore } from '@/stores/uiStore';
import { useTranslation } from '@/hooks/useTranslation';
import { formatPrice, resolveAssetUrl, LOKA } from '@/lib/tokens';
import { normalizePhone } from '@/lib/phone';

interface GuestOrderData {
  order_id: number;
  order_number: string;
  order_type: string;
  table_number: string | null;
  status: string;
  payment_status: string;
  total_amount: string;
  amount_due?: string;
  currency_code: string;
  store_name: string | null;
  store_logo: string | null;
  line_items: Array<{
    name: string;
    quantity: number;
    unit_price: string;
    line_total: string;
    modifiers_label: string;
    image_url?: string;
  }>;
  can_pay: boolean;
  stripe_enabled: boolean;
  hitpay_enabled: boolean;
  eghl_enabled: boolean;
  wallet_enabled: boolean;
}

export default function GuestPayPage() {
  const { t } = useTranslation();
  const { pageParams, showToast, setIsGuest, setPage } = useUIStore();
  const orderId = pageParams.orderId as number | undefined;
  const token = pageParams.token as string | undefined;
  const returnStatus = pageParams.status as string | undefined;
  const prefer = (pageParams.prefer as string) || 'stripe';

  const [order, setOrder] = useState<GuestOrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  const fetchOrder = useCallback(async () => {
    if (!orderId || !token) {
      setError(t('guestPay.invalidLink'));
      setLoading(false);
      return;
    }
    try {
      const res = await api.get(`/payments/guest-pay/${orderId}`, { params: { token } });
      const data = res.data as GuestOrderData;
      setOrder(data);
      if (returnStatus === 'success' || returnStatus === 'completed') {
        setPaid(true);
      } else if (returnStatus === 'cancel' || returnStatus === 'failed') {
        setCancelled(true);
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('guestPay.loadFailed');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [orderId, token, returnStatus, t]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  const handleSendOtp = async () => {
    if (!phone.trim() || sendingOtp) return;
    setSendingOtp(true);
    try {
      await api.post('/auth/send-otp', { phone_number: normalizePhone(phone.trim()) });
      setOtpSent(true);
      setOtpCode('');
      showToast(t('guestPay.codeSent'), 'success');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('guestPay.sendCodeFailed');
      showToast(msg, 'error');
    } finally {
      setSendingOtp(false);
    }
  };

  const handlePay = async (provider: 'stripe' | 'hitpay' | 'eghl' | 'wallet') => {
    if (!orderId || !token || !order) return;
    setPaying(true);
    try {
      const params: Record<string, string> = { token, provider };
      if (phone.trim()) params.phone_number = normalizePhone(phone.trim());
      if (provider === 'wallet') params.otp_code = otpCode.trim();
      const res = await api.post(`/payments/guest-pay/${orderId}`, null, { params });
      const data = res.data as { redirect_url?: string; wallet_paid?: boolean };
      if (provider === 'wallet' && data.wallet_paid) {
        setPaid(true);
      } else if (data.redirect_url) {
        window.location.href = data.redirect_url;
      } else {
        showToast(t('guestPay.noRedirect'), 'error');
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('guestPay.payFailed');
      showToast(msg, 'error');
    } finally {
      setPaying(false);
    }
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div className="guest-pay-screen">
        <div className="guest-pay-loading">
          <Loader2 size={40} className="animate-spin" style={{ color: LOKA.primary, marginBottom: 16 }} />
          <p>{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="guest-pay-screen">
        <div className="guest-pay-error">
          <XCircle size={56} style={{ color: 'var(--color-danger)', marginBottom: 16 }} />
          <h1 className="guest-pay-error-title">{t('guestPay.error')}</h1>
          <p className="guest-pay-error-msg">{error}</p>
        </div>
      </div>
    );
  }

  if (!order) return null;

  // ── Paid / success state ──
  if (paid || order.payment_status === 'captured' || order.payment_status === 'settled' || order.payment_status === 'paid') {
    return (
      <div className="guest-pay-screen">
        <div className="guest-pay-success">
          <CheckCircle size={72} style={{ color: 'var(--color-success)', marginBottom: 20 }} />
          <h1 className="guest-pay-success-title">{t('guestPay.paymentSuccessful')}</h1>
          <p className="guest-pay-order-num">#{order.order_number}</p>
          <div className="guest-pay-amount">{formatPrice(order.total_amount)}</div>
          <p className="guest-pay-thank-you">{t('guestPay.thankYou')}</p>
          <button
            className="guest-pay-btn secondary"
            style={{ marginTop: 24, maxWidth: 280 }}
            onClick={() => { setIsGuest(true); setPage('home'); }}
          >
            {t('guestPay.browseMenu')}
          </button>
        </div>
      </div>
    );
  }

  // ── Cancelled state ──
  if (cancelled) {
    return (
      <div className="guest-pay-screen">
        <div className="guest-pay-cancelled">
          <XCircle size={56} style={{ color: 'var(--color-danger)', marginBottom: 16 }} />
          <h1 className="guest-pay-error-title">{t('guestPay.paymentCancelled')}</h1>
          <p className="guest-pay-error-msg">{t('guestPay.cancelMsg')}</p>
          {order.can_pay && (
            <button className="guest-pay-btn primary" onClick={() => { setCancelled(false); }}>
              {t('guestPay.tryAgain')}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Already paid ──
  if (!order.can_pay) {
    return (
      <div className="guest-pay-screen">
        <div className="guest-pay-success">
          <CheckCircle size={72} style={{ color: 'var(--color-success)', marginBottom: 20 }} />
          <h1 className="guest-pay-success-title">{t('guestPay.alreadyPaid')}</h1>
          <p className="guest-pay-order-num">#{order.order_number}</p>
        </div>
      </div>
    );
  }

  // ── Main: order summary + pay ──
  return (
    <div className="guest-pay-screen">
      <div className="guest-pay-header">
        <h1 className="guest-pay-title">{t('guestPay.payForOrder')}</h1>
      </div>

      <div className="guest-pay-scroll">
        {/* Store info */}
        {order.store_name && (
          <div className="guest-pay-store">
            {order.store_logo && <img src={resolveAssetUrl(order.store_logo) || ''} alt="" className="guest-pay-store-logo" />}
            <div className="guest-pay-store-name">{order.store_name}</div>
          </div>
        )}

        {/* Order meta */}
        <div className="guest-pay-meta">
          <span className="guest-pay-order-num">#{order.order_number}</span>
          <span className="guest-pay-type-badge">
            {order.order_type === 'dine_in' ? <Utensils size={14} /> : order.order_type === 'delivery' ? <Truck size={14} /> : <ShoppingBag size={14} />}
            {order.order_type === 'dine_in' ? t('cart.mode.dineIn') : order.order_type === 'delivery' ? t('cart.mode.delivery') : t('cart.mode.pickup')}
            {order.table_number && ` · ${t('pos.table')} ${order.table_number}`}
          </span>
        </div>

        {/* Items */}
        <div className="guest-pay-items">
          {order.line_items.map((item, i) => (
            <div key={i} className="guest-pay-item">
              <div className="guest-pay-item-qty">{item.quantity}×</div>
              <div className="guest-pay-item-info">
                <div className="guest-pay-item-name">{item.name}</div>
                {item.modifiers_label && <div className="guest-pay-item-mods">{item.modifiers_label}</div>}
              </div>
              <div className="guest-pay-item-price">{formatPrice(item.line_total)}</div>
            </div>
          ))}
        </div>

        {/* Total — amount_due reflects partial refunds; total_amount is the order gross */}
        <div className="guest-pay-total-row">
          <span>{t('cart.total')}</span>
          <span className="guest-pay-total-amount">{formatPrice(order.amount_due ?? order.total_amount)}</span>
        </div>

        {/* Optional phone (loyalty registration — passwordless; required for wallet) */}
        <div className="guest-pay-phone-section">
          <label className="guest-pay-phone-label">{t('guestPay.phoneOptional')}</label>
          <p className="guest-pay-phone-hint">{t('guestPay.phoneHint')}</p>
          <input
            type="tel"
            className="guest-pay-phone-input"
            placeholder="+60 12-345 6789"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setOtpSent(false); setOtpCode(''); }}
            inputMode="tel"
          />
          {order.wallet_enabled && phone.trim() && (
            <>
              <p className="guest-pay-phone-hint">{t('guestPay.walletOtpHint')}</p>
              <button
                className="guest-pay-btn secondary"
                onClick={handleSendOtp}
                disabled={sendingOtp || paying}
              >
                {sendingOtp ? <Loader2 size={18} className="animate-spin" /> : <Smartphone size={18} />}
                {otpSent ? t('guestPay.resendCode') : t('guestPay.sendCode')}
              </button>
            </>
          )}
          {order.wallet_enabled && otpSent && (
            <input
              type="text"
              className="guest-pay-phone-input"
              placeholder={t('guestPay.otpPlaceholder')}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          )}
        </div>

        {/* Pay buttons */}
        <div className="guest-pay-actions">
          {order.wallet_enabled && (
            <button
              className={`guest-pay-btn ${prefer === 'wallet' ? 'primary' : 'secondary'}`}
              onClick={() => handlePay('wallet')}
              disabled={paying || !phone.trim() || otpCode.trim().length !== 6}
            >
              {paying ? <Loader2 size={18} className="animate-spin" /> : <Wallet size={18} />}
              {paying ? t('guestPay.processing') : t('guestPay.payWithWallet')}
              {prefer === 'wallet' && <span className="guest-pay-recommended">{t('guestPay.recommended')}</span>}
            </button>
          )}
          {order.stripe_enabled && (
            <button
              className={`guest-pay-btn ${prefer === 'stripe' ? 'primary' : 'secondary'}`}
              onClick={() => handlePay('stripe')}
              disabled={paying}
            >
              {paying ? <Loader2 size={18} className="animate-spin" /> : <CreditCard size={18} />}
              {paying ? t('guestPay.processing') : t('guestPay.payWithCard')}
              {prefer === 'stripe' && <span className="guest-pay-recommended">{t('guestPay.recommended')}</span>}
            </button>
          )}
          {order.hitpay_enabled && (
            <button
              className="guest-pay-btn secondary"
              onClick={() => handlePay('hitpay')}
              disabled={paying}
            >
              <Smartphone size={18} />
              {t('guestPay.payWithHitPay')}
            </button>
          )}
          {order.eghl_enabled && (
            <button
              className="guest-pay-btn secondary"
              onClick={() => handlePay('eghl')}
              disabled={paying}
            >
              <CreditCard size={18} />
              {t('guestPay.payWithEGHL')}
            </button>
          )}
          {!order.stripe_enabled && !order.hitpay_enabled && !order.eghl_enabled && !order.wallet_enabled && (
            <p className="guest-pay-no-provider">{t('guestPay.noProvider')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
