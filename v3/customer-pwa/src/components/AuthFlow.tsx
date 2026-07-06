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
import { usePhoneAuth } from '@/hooks/usePhoneAuth';

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

export default function AuthFlow({ onAuthDone }: AuthFlowProps) {
  const { t } = useTranslation();
  const { isAuthenticated, isNewUser } = useAuthStore();
  const { showToast } = useUIStore();
  const reducedMotion = useReducedMotion();
  const {
    phoneNumber,
    handleSendOtp,
    handleVerifyOtp,
    handleProfileSetup,
    getApiErrorMessage,
  } = usePhoneAuth();

  const [authStep, setAuthStep] = useState<AuthStep>('splash');
  const [loadingAuth, setLoadingAuth] = useState(false);

  const handleSplashFinish = useCallback(() => {
    if (isAuthenticated) { onAuthDone(); setAuthStep('done'); }
    else setAuthStep('phone');
  }, [isAuthenticated, onAuthDone]);

  const handlePhoneSubmit = useCallback(async (phoneValue: string) => {
    const sent = await handleSendOtp(phoneValue);
    if (sent) setAuthStep('otp');
  }, [handleSendOtp]);

  const handleOTPSubmit = useCallback(async (code: string) => {
    setLoadingAuth(true);
    try {
      const success = await handleVerifyOtp(code);
      if (success) {
        onAuthDone();
        setAuthStep('done');
      } else if (isNewUser) {
        setAuthStep('profile');
        return;
      }
    } catch (err: unknown) {
      const message = getApiErrorMessage(err, t('toast.verificationFailed'));
      showToast(message, 'error', t('toast.verificationFailedTitle'));
    } finally {
      setLoadingAuth(false);
    }
  }, [handleVerifyOtp, onAuthDone, isNewUser, getApiErrorMessage, showToast, t]);

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
      const success = await handleProfileSetup(data.name, data.email);
      if (success) {
        onAuthDone();
        setAuthStep('done');
        showToast(t('toast.profileSaved'), 'success');
      }
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, t('toast.profileFailed'));
      showToast(msg, 'error');
    } finally {
      setLoadingAuth(false);
    }
  }, [handleProfileSetup, onAuthDone, getApiErrorMessage, showToast, t]);

  const handleProfileSkip = useCallback(async () => {
    showToast(t('auth.nameRequired'), 'warning');
  }, [showToast, t]);

  if (authStep === 'splash') return <SplashScreen onFinish={handleSplashFinish} />;

  return (
    <div className="flex-1 flex flex-col bg-white h-full" style={{ position: 'relative' }}>
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
                initialRetryAfterSeconds={60}
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
