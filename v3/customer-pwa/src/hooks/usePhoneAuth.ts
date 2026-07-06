'use client';

import { useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useWalletStore } from '@/stores/walletStore';
import { normalizePhone } from '@/lib/phone';
import api from '@/lib/api';
import type { UserProfile } from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';

export type AuthStep = 'phone' | 'otp' | 'profile';

async function fetchAndSetUser() {
  try {
    const me = await api.get('/me');
    const raw = me.data as { profile?: UserProfile; addresses?: UserProfile['addresses']; referral_code?: string } | UserProfile;
    const profile = ('profile' in raw && raw.profile) ? raw.profile : raw as UserProfile;
    const addresses = ('addresses' in raw && raw.addresses) ? raw.addresses : profile.addresses;
    useAuthStore.getState().setUser({
      ...profile,
      addresses: addresses || [],
      referral_code: ('referral_code' in raw && raw.referral_code) ? raw.referral_code : (profile.referral_code || ''),
    });
  } catch (err) { console.error("Failed to fetch user profile:", err); }
}

export function usePhoneAuth() {
  const { t } = useTranslation();
  const { setIsNewUser, setPhone: setStorePhone, setAuthDone } = useAuthStore();
  const { showToast, setIsGuest } = useUIStore();
  const { refreshWallet } = useWalletStore();

  const [step, setStep] = useState<AuthStep>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryCode, setCountryCode] = useState('+60');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const getApiErrorMessage = useCallback((err: unknown, fallback: string) => {
    const detail = (err as { response?: { data?: { detail?: unknown; message?: string } } })?.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
    return fallback;
  }, []);

  const handleSendOtp = useCallback(async (rawPhone: string, dialCode?: string): Promise<boolean> => {
    const code = dialCode || countryCode;
    const digits = rawPhone.replace(/\D/g, '');
    if (digits.length < 7) {
      setError(t('auth.phoneInvalid'));
      return false;
    }
    const normalized = normalizePhone(rawPhone, code);
    setPhoneNumber(normalized);
    setStorePhone(normalized);
    setLoading(true);
    setError('');
    let success = false;
    try {
      await api.post('/auth/send-otp', { phone_number: normalized });
      setStep('otp');
      success = true;
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, t('auth.sendOtpFailed')), 'error');
    } finally {
      setLoading(false);
    }
    return success;
  }, [countryCode, setStorePhone, showToast, t, getApiErrorMessage]);

  const handleVerifyOtp = useCallback(async (code: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/login', { phone_number: phoneNumber, otp_code: code });
      await fetchAndSetUser();
      const isNew = res.data?.is_new_user ?? false;
      if (isNew) {
        setIsNewUser(true);
        setStep('profile');
        return false;
      }
      setIsNewUser(false);
      return true;
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, t('auth.otpInvalidError')));
      return false;
    } finally {
      setLoading(false);
    }
  }, [phoneNumber, setIsNewUser, t, getApiErrorMessage]);

  const handleProfileSetup = useCallback(async (name: string, email?: string) => {
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/register', {
        phone_number: phoneNumber,
        display_name: name,
        email_address: email || undefined,
      });
      await fetchAndSetUser();
      setIsNewUser(false);
      return true;
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, t('auth.saveProfileFailed')));
      return false;
    } finally {
      setLoading(false);
    }
  }, [phoneNumber, setIsNewUser, t, getApiErrorMessage]);

  const finishAuth = useCallback(() => {
    setIsGuest(false);
    setAuthDone(true);
    refreshWallet();
  }, [setIsGuest, setAuthDone, refreshWallet]);

  const reset = useCallback(() => {
    setStep('phone');
    setPhoneNumber('');
    setCountryCode('+60');
    setLoading(false);
    setError('');
  }, []);

  return {
    phoneNumber, setPhoneNumber,
    countryCode, setCountryCode,
    handleSendOtp,
    handleVerifyOtp,
    handleProfileSetup,
    finishAuth,
    step, setStep,
    error, setError,
    loading,
    getApiErrorMessage,
    reset,
  };
}
