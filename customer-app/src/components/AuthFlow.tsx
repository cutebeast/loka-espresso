'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { normalizePhone } from '@/lib/phone';
import api from '@/lib/api';
import { SplashScreen } from '@/components/auth/SplashScreen';
import { PhoneInput } from '@/components/auth/PhoneInput';
import { OTPInput } from '@/components/auth/OTPInput';
import { ProfileSetup } from '@/components/auth/ProfileSetup';
import { useReducedMotion } from '@/hooks/useReducedMotion';

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
  const { token, isAuthenticated, setToken, setRefreshToken, setIsNewUser, setPhone, logout } = useAuthStore();
  const { showToast } = useUIStore();
  const reducedMotion = useReducedMotion();

  const [authStep, setAuthStep] = useState<AuthStep>('splash');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [otpSessionId, setOtpSessionId] = useState<string | null>(null);
  const [otpRetryAfter, setOtpRetryAfter] = useState(60);

  const getApiErrorMessage = useCallback((error: unknown, fallback: string) => {
    const detail = (error as { response?: { data?: { detail?: unknown; message?: string } } })?.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
    if (typeof message === 'string' && message.trim()) return message;
    return fallback;
  }, []);

  const handleSplashFinish = useCallback(() => {
    if (token && isAuthenticated) { onAuthDone(); setAuthStep('done'); }
    else setAuthStep('phone');
  }, [token, isAuthenticated, onAuthDone]);

  const handlePhoneSubmit = useCallback(async (phoneValue: string) => {
    setLoadingAuth(true);
    try {
      const normalized = normalizePhone(phoneValue);
      const res = await api.post('/auth/send-otp', { phone: normalized });
      const nextPhone = res.data?.phone || normalized;
      setPhoneNumber(nextPhone);
      setPhone(nextPhone);
      setOtpSessionId(res.data?.session_id ?? null);
      setOtpRetryAfter(Number(res.data?.retry_after_seconds ?? 60));
      setAuthStep('otp');
    } catch (error) {
      showToast(getApiErrorMessage(error, 'Failed to send OTP. Please try again.'), 'error');
    } finally {
      setLoadingAuth(false);
    }
  }, [getApiErrorMessage, setPhone, showToast]);

  const handleOTPSubmit = useCallback(async (code: string) => {
    setLoadingAuth(true);
    try {
      const res = await api.post('/auth/verify-otp', { phone: phoneNumber, code, session_id: otpSessionId });
      const { access_token, refresh_token, is_new_user } = res.data;
      setToken(access_token);
      setRefreshToken(refresh_token ?? null);
      if (is_new_user) { setIsNewUser(true); setAuthStep('profile'); }
      else { setIsNewUser(false); onAuthDone(); setAuthStep('done'); }
    } catch (error) {
      const message = getApiErrorMessage(error, 'Invalid OTP. Please try again.');
      showToast(message, 'error');
      throw new Error(message);
    } finally {
      setLoadingAuth(false);
    }
  }, [getApiErrorMessage, otpSessionId, phoneNumber, setIsNewUser, setRefreshToken, setToken, showToast, onAuthDone]);

  const handleResendOTP = useCallback(async () => {
    try {
      const res = await api.post('/auth/send-otp', { phone: phoneNumber });
      setOtpSessionId(res.data?.session_id ?? otpSessionId);
      setOtpRetryAfter(Number(res.data?.retry_after_seconds ?? 60));
      showToast('OTP resent successfully', 'success');
    } catch (error) {
      const message = getApiErrorMessage(error, 'Failed to resend OTP');
      showToast(message, 'error');
      throw new Error(message);
    }
  }, [getApiErrorMessage, otpSessionId, phoneNumber, showToast]);

  const handleProfileSubmit = useCallback(async (data: { name: string; email?: string }) => {
    setLoadingAuth(true);
    try {
      await api.post('/auth/register', { name: data.name, email: data.email }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setIsNewUser(false);
      onAuthDone();
      setAuthStep('done');
      showToast('Welcome to Loka Espresso!', 'success');
    } catch {
      showToast('Failed to save profile. Please try again.', 'error');
    } finally {
      setLoadingAuth(false);
    }
  }, [token, setIsNewUser, showToast, onAuthDone]);

  const handleProfileSkip = useCallback(() => {
    setIsNewUser(false);
    onAuthDone();
    setAuthStep('done');
  }, [setIsNewUser, onAuthDone]);

  if (authStep === 'splash') return <SplashScreen onFinish={handleSplashFinish} />;

  return (
    <div className="flex-1 flex flex-col bg-white h-full">
      <div className="flex-1 overflow-y-auto scroll-container">
        <AnimatePresence mode="wait">
          {authStep === 'phone' && (
            <motion.div key="phone" {...pageTransition(reducedMotion)} className="h-full bg-white text-[#1B2023]">
              <PhoneInput onSubmit={handlePhoneSubmit} />
            </motion.div>
          )}
          {authStep === 'otp' && (
            <motion.div key="otp" {...pageTransition(reducedMotion)} className="h-full bg-white text-[#1B2023]">
              <OTPInput
                phone={phoneNumber}
                onSubmit={handleOTPSubmit}
                onResend={handleResendOTP}
                initialRetryAfterSeconds={otpRetryAfter}
                onBack={() => setAuthStep('phone')}
              />
            </motion.div>
          )}
          {authStep === 'profile' && (
            <motion.div key="profile" {...pageTransition(reducedMotion)} className="h-full bg-white text-[#1B2023]">
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
            <div className="bg-white rounded-2xl px-8 py-6 shadow-xl">
              <div className="w-8 h-8 border-3 border-[#384B16] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-[#6A7A8A] mt-3">Please wait...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
