'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import api from '@/lib/api';
import { SplashScreen } from '@/components/auth/SplashScreen';
import { PhoneInput } from '@/components/auth/PhoneInput';
import { OTPInput } from '@/components/auth/OTPInput';
import { ProfileSetup } from '@/components/auth/ProfileSetup';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTranslation } from '@/hooks/useTranslation';

type AuthStep = 'splash' | 'phone' | 'otp' | 'profile' | 'done';

const pageTransition = (reducedMotion: boolean) =>
  reducedMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0 },
      }
    : {
        initial: { opacity: 0, x: 20 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -20 },
        transition: { duration: 0.25, ease: 'easeOut' as const },
      };

interface AuthFlowProps {
  onAuthDone: () => void;
}

async function fetchAndSetUser() {
  try {
    const me = await api.get('/me');
    useAuthStore.getState().setUser(me.data);
  } catch { /* user will be set on next load */ }
}

export default function AuthFlow({ onAuthDone }: AuthFlowProps) {
  const { t } = useTranslation();
  const { isAuthenticated, setIsNewUser, setPhone } = useAuthStore();
  const { showToast } = useUIStore();
  const reducedMotion = useReducedMotion();

  const [authStep, setAuthStep] = useState<AuthStep>('splash');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loadingAuth, setLoadingAuth] = useState(false);

  const getApiErrorMessage = useCallback((error: unknown, fallback: string) => {
    const detail = (error as { response?: { data?: { detail?: unknown; message?: string } } })?.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
    if (typeof message === 'string' && message.trim()) return message;
    return fallback;
  }, []);

  const handleSplashFinish = useCallback(() => {
    if (isAuthenticated) { onAuthDone(); setAuthStep('done'); }
    else setAuthStep('phone');
  }, [isAuthenticated, onAuthDone]);

  const handlePhoneSubmit = useCallback(async (phoneValue: string) => {
    setPhoneNumber(phoneValue);
    setPhone(phoneValue);
    // v3 doesn't have send-otp endpoint — skip directly to OTP entry
    // In production this should call /auth/send-otp
    setAuthStep('otp');
  }, [setPhone]);

  const handleOTPSubmit = useCallback(async (code: string) => {
    setLoadingAuth(true);
    try {
      // Login with phone_number and OTP code verified on server
      const res = await api.post('/auth/login', { phone_number: phoneNumber, otp_code: code });
      const tokens = res.data?.tokens;
      if (tokens?.access_token) {
        localStorage.setItem('token', tokens.access_token);
        if (tokens.refresh_token) localStorage.setItem('refreshToken', tokens.refresh_token);
      }
      await fetchAndSetUser();
      setIsNewUser(false);
      onAuthDone();
      setAuthStep('done');
    } catch (err: any) {
      if (err?.response?.status === 404) {
        // Account not found — new user, go to profile setup
        setIsNewUser(true);
        setAuthStep('profile');
      } else {
        const message = getApiErrorMessage(err, t('toast.verificationFailed'));
        showToast(message, 'error', t('toast.verificationFailedTitle'));
        throw err;
      }
    } finally {
      setLoadingAuth(false);
    }
  }, [getApiErrorMessage, phoneNumber, setIsNewUser, showToast, onAuthDone]);

  const handleResendOTP = useCallback(async () => {
    try {
      await api.post('/auth/resend-otp', { phone_number: phoneNumber });
      showToast(t('toast.otpResent'), 'success');
    } catch {
      showToast(t('toast.otpResendFailed'), 'error');
    }
  }, [phoneNumber, showToast, t]);

  const handleProfileSubmit = useCallback(async (data: { name: string; email?: string }) => {
    setLoadingAuth(true);
    try {
      const res = await api.post('/auth/register', {
        phone_number: phoneNumber,
        display_name: data.name,
        email_address: data.email || undefined,
      });
      const tokens = res.data?.tokens;
      if (tokens?.access_token) {
        localStorage.setItem('token', tokens.access_token);
        if (tokens.refresh_token) localStorage.setItem('refreshToken', tokens.refresh_token);
      }
      await fetchAndSetUser();
      setIsNewUser(false);
      onAuthDone();
      setAuthStep('done');
      showToast(t('toast.profileSaved'), 'success');
    } catch (err: any) {
      const msg = getApiErrorMessage(err, t('toast.profileFailed'));
      showToast(msg, 'error');
    } finally {
      setLoadingAuth(false);
    }
  }, [phoneNumber, setIsNewUser, showToast, onAuthDone, getApiErrorMessage, t]);

  const handleProfileSkip = useCallback(async () => {
    // Can't skip if account doesn't exist — require at least name
    showToast(t('auth.nameRequired'), 'warning');
  }, [showToast, t]);

  if (authStep === 'splash') return <SplashScreen onFinish={handleSplashFinish} />;

  return (
    <div className="flex-1 flex flex-col bg-white h-full">
      <div className="flex-1 overflow-y-auto scroll-container">
        <AnimatePresence mode="wait">
          {authStep === 'phone' && (
            <motion.div key="phone" {...pageTransition(reducedMotion)} className="h-full bg-white text-text-primary">
              <PhoneInput onSubmit={handlePhoneSubmit} />
            </motion.div>
          )}
          {authStep === 'otp' && (
            <motion.div key="otp" {...pageTransition(reducedMotion)} className="h-full bg-white text-text-primary">
              <OTPInput
                phone={phoneNumber}
                onSubmit={handleOTPSubmit}
                onResend={handleResendOTP}
                initialRetryAfterSeconds={0}
                onBack={() => setAuthStep('phone')}
              />
            </motion.div>
          )}
          {authStep === 'profile' && (
            <motion.div key="profile" {...pageTransition(reducedMotion)} className="h-full bg-white text-text-primary">
              <ProfileSetup
                phone={phoneNumber}
                onSubmit={handleProfileSubmit}
                onSkip={handleProfileSkip}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {loadingAuth && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reducedMotion ? { duration: 0 } : undefined}
            className="absolute inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50"
          >
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-text-muted mt-3">{t('common.pleaseWait')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
