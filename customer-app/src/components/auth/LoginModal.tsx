'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { BottomSheet } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useWalletStore } from '@/stores/walletStore';
import { normalizePhone, formatPhoneForDisplay } from '@/lib/phone';
import { DEFAULT_COUNTRY, ALL_COUNTRIES, searchCountries, flagUrl } from '@/lib/countries';
import type { Country } from '@/lib/countries';
import api from '@/lib/api';
import type { UserProfile } from '@/lib/api';

type Step = 'phone' | 'otp' | 'profile';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthDone?: () => void;
}

export function LoginModal({ isOpen, onClose, onAuthDone }: LoginModalProps) {
  const { setUser, setIsNewUser, setPhone: setStorePhone, setAuthDone } = useAuthStore();
  const { showToast, setIsGuest } = useUIStore();
  const { refreshWallet } = useWalletStore();

  const [step, setStep] = useState<Step>('phone');
  const [phoneValue, setPhoneValue] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(60);
  const [otpSessionId, setOtpSessionId] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');

  const [profileName, setProfileName] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  const filteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return ALL_COUNTRIES;
    return searchCountries(countrySearch);
  }, [countrySearch]);

  useEffect(() => {
    if (isOpen) {
      setStep('phone'); setPhoneValue(''); setPhoneError(''); setPhoneLoading(false);
      setSelectedCountry(DEFAULT_COUNTRY);
      setOtp(['', '', '', '', '', '']); setOtpError(''); setOtpLoading(false);
      setResendTimer(60); setOtpSessionId(null); setPhoneNumber('');
      setProfileName(''); setProfileError(''); setProfileLoading(false);
      setCountrySearch('');
    }
  }, [isOpen]);

  useEffect(() => { if (isOpen && step === 'phone') setTimeout(() => phoneInputRef.current?.focus(), 400); }, [isOpen, step]);
  useEffect(() => { if (isOpen && step === 'otp') setTimeout(() => otpRefs.current[0]?.focus(), 400); }, [isOpen, step]);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => setResendTimer((prev) => { if (prev <= 1) { clearInterval(interval); return 0; } return prev - 1; }), 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  const apiError = useCallback((err: unknown, fallback: string) => {
    const detail = (err as any)?.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    const msg = (err as any)?.response?.data?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
    return fallback;
  }, []);

  // ── Country ──
  const selectCountry = useCallback((c: Country) => { setSelectedCountry(c); setShowCountryPicker(false); setCountrySearch(''); }, []);

  // ── Phone ──
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhoneValue(formatPhoneForDisplay(e.target.value, selectedCountry.dialCode));
    setPhoneError('');
  };

  const handleSendOtp = async () => {
    const digits = phoneValue.replace(/\D/g, '');
    if (digits.length < 7) { setPhoneError('Please enter a valid phone number'); return; }
    setPhoneLoading(true); setPhoneError('');
    try {
      const normalized = normalizePhone(phoneValue, selectedCountry.dialCode);
      const res = await api.post('/auth/send-otp', { phone: normalized });
      const nextPhone = res.data?.phone || normalized;
      setPhoneNumber(nextPhone); setStorePhone(nextPhone);
      setOtpSessionId(res.data?.session_id ?? null);
      setResendTimer(Number(res.data?.retry_after_seconds ?? 60));
      if (process.env.NEXT_PUBLIC_OTP_BYPASS === 'true') {
        await verifyOtp('000000');
      } else { setStep('otp'); }
    } catch (err) { showToast(apiError(err, 'Failed to send OTP.'), 'error'); }
    finally { setPhoneLoading(false); }
  };

  // ── OTP ──
  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp]; newOtp[index] = value.slice(-1);
    setOtp(newOtp); setOtpError('');
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').slice(0, 6);
    if (!/^\d+$/.test(pasted)) return;
    const newOtp = [...otp]; pasted.split('').forEach((ch, i) => { if (i < 6) newOtp[i] = ch; });
    setOtp(newOtp); otpRefs.current[Math.min(pasted.length - 1, 5)]?.focus();
  };

  const verifyOtp = async (code: string) => {
    const res = await api.post('/auth/verify-otp', { phone: phoneNumber, code, session_id: otpSessionId });
    const { is_new_user } = res.data;
    if (is_new_user) { setIsNewUser(true); setStep('profile'); }
    else { const me = await api.get('/users/me'); setUser(me.data as UserProfile); }
    return res.data;
  };

  const handleVerifyOtp = async () => {
    const code = otp.join('');
    if (code.length !== 6) { setOtpError('Please enter the complete 6-digit code'); return; }
    setOtpLoading(true); setOtpError('');
    try { const data = await verifyOtp(code); if (!data.is_new_user) finishAuth(); }
    catch (err) { showToast(apiError(err, 'Invalid OTP. Please try again.'), 'error'); setOtp(['', '', '', '', '', '']); otpRefs.current[0]?.focus(); }
    finally { setOtpLoading(false); }
  };

  // Auto-submit when 6 digits entered (with 600ms delay to let user see the code)
  useEffect(() => {
    if (step !== 'otp' || !otp.every((d) => d) || otpLoading) return;
    const timer = setTimeout(() => handleVerifyOtp(), 600);
    return () => clearTimeout(timer);
  }, [otp.join('')]);

  const handleResendOtp = async () => {
    if (resendTimer > 0) return;
    try {
      const res = await api.post('/auth/send-otp', { phone: phoneNumber });
      setOtpSessionId(res.data?.session_id ?? otpSessionId);
      setResendTimer(Number(res.data?.retry_after_seconds ?? 60));
      setOtp(['', '', '', '', '', '']); otpRefs.current[0]?.focus();
    } catch (err) { showToast(apiError(err, 'Failed to resend OTP.'), 'warning'); }
  };

  // ── Profile ──
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim()) { setProfileError('Please enter your name'); return; }
    setProfileLoading(true); setProfileError('');
    try {
      await api.post('/auth/register', { name: profileName.trim() });
      const me = await api.get('/users/me'); setUser(me.data as UserProfile);
      setIsNewUser(false);
      finishAuth();
    } catch { showToast('Failed to save profile.', 'error'); }
    finally { setProfileLoading(false); }
  };

  const handleProfileSkip = async () => {
    try { const me = await api.get('/users/me'); setUser(me.data as UserProfile); } catch {}
    setIsNewUser(false); finishAuth();
  };

  // ── Finish ──
  const finishAuth = useCallback(() => {
    setIsGuest(false); setAuthDone(true); refreshWallet(); onAuthDone?.(); onClose();
  }, [setIsGuest, setAuthDone, refreshWallet, onAuthDone, onClose]);

  const handleClose = () => { if (!useAuthStore.getState().isAuthenticated) useUIStore.getState().setIsGuest(true); onClose(); };

  // ── Render helpers ──
  const displayPhone = (() => {
    const d = phoneNumber.replace(/\D/g, '');
    if (d.length < 11) return phoneNumber;
    return `+${d.slice(0, 2)} ${d.slice(2, 4)}-${d.slice(4)}`;
  })();

  const stepProgressClass = step === 'phone' ? 'p1' : step === 'otp' ? 'p2' : 'p3';
  const stepLabelText = step === 'phone' ? 'Step 1 of 3 — Phone number' : step === 'otp' ? 'Step 2 of 3 — Verification' : 'Step 3 of 3 — Profile setup';
  const flag = flagUrl(selectedCountry.code);

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={
          step === 'phone' ? 'Welcome back' :
          step === 'otp' ? 'Enter code' :
          'Complete your profile'
        }
        meta={
          step === 'phone' ? 'Sign in with your phone number' :
          step === 'otp' ? `Sent to ${displayPhone}` :
          'Tell us a bit about yourself'
        }
        variant="bottom"
      >
        {/* Progress bar */}
        <div className="modal-progress-container">
          <div className={`modal-progress-fill ${stepProgressClass}`} />
        </div>
        <div className="modal-progress-label">{stepLabelText}</div>

        {/* ── Phone Step ── */}
        {step === 'phone' && (
          <form onSubmit={(e) => { e.preventDefault(); handleSendOtp(); }} className="flex flex-col gap-4">
            <div className="phone-wrapper">
              <button type="button" className="country-selector" onClick={() => setShowCountryPicker(true)}>
                <img className="country-selector-flag" src={flag} alt={selectedCountry.name} width="24" height="16" />
                <span className="country-selector-code">{selectedCountry.dialCode}</span>
                <svg className="country-selector-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none">
                  <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <span className="phone-divider" />
              <input ref={phoneInputRef} type="tel" value={phoneValue} onChange={handlePhoneChange}
                placeholder="12 345 6789" inputMode="tel" autoComplete="tel-national" className="phone-input" />
            </div>
            {phoneError && <p className="text-sm text-danger font-bold">{phoneError}</p>}
            <button type="submit" disabled={phoneLoading || phoneValue.replace(/\D/g, '').length < 7}
              className="btn btn-primary w-full h-12 rounded-xl text-base font-semibold mt-2">
              {phoneLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : 'Send Code'}
            </button>
            <button type="button" className="guest-link"
              onClick={() => { useUIStore.getState().setIsGuest(true); onClose(); }}>
              Continue as Guest
            </button>
          </form>
        )}
        {/* ── OTP Step ── */}
        {step === 'otp' && (
          <div className="flex flex-col gap-4">
            <div className="flex gap-2 justify-center" onPaste={handleOtpPaste}>
              {otp.map((digit, index) => (
                <input key={index} ref={(el) => { otpRefs.current[index] = el; }} type="text" inputMode="numeric"
                  pattern="\d" maxLength={1} value={digit}
                  onChange={(e) => handleOtpChange(index, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(index, e)}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label={`Digit ${index + 1}`}
                  className={`w-12 h-14 rounded-xl border-2 text-center text-xl font-bold outline-none transition-colors flex-shrink-0 ${digit ? 'border-primary bg-primary-50 text-primary' : 'border-border bg-bg-light text-text-primary'} focus:border-primary focus:ring-2 focus:ring-primary/15`} />
              ))}
            </div>
            <p className="text-sm text-text-secondary text-center">
              Didn&apos;t receive it?{' '}
              <button type="button" className="text-primary font-semibold disabled:text-text-muted"
                onClick={handleResendOtp} disabled={resendTimer > 0}>
                {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend code'}
              </button>
            </p>
            {otpError && <p className="text-sm text-danger font-bold text-center">{otpError}</p>}
            <button type="button" className="text-sm text-text-secondary text-center underline"
              onClick={() => setStep('phone')}>Change phone number</button>
            <button onClick={handleVerifyOtp} disabled={otpLoading || otp.some((d) => !d)}
              className="btn btn-primary w-full h-12 rounded-xl text-base font-semibold mt-1">
              {otpLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : 'Verify & Continue'}
            </button>
          </div>
        )}

        {/* ── Profile Step ── */}
        {step === 'profile' && (
          <form onSubmit={handleProfileSubmit} className="flex flex-col gap-4">
            <div className="flex items-center gap-4 mb-2">
              <div className={`lm-avatar ${profileName ? 'lm-avatar-filled' : ''}`}>
                {profileName ? profileName.trim()[0].toUpperCase() : '👤'}
              </div>
              <div>
                <p className="text-xs text-text-muted font-medium">Your account</p>
                <p className="text-sm font-semibold text-text-primary">
                  {profileName.trim() || 'Set up your Loka profile'}
                </p>
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Full name</div>
              <input type="text" value={profileName}
                onChange={(e) => { setProfileName(e.target.value); setProfileError(''); }}
                placeholder="Your name" autoFocus
                className="w-full bg-bg-light rounded-xl px-4 py-3 border border-border-subtle focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-base text-text-primary placeholder-text-muted transition-colors" />
            </div>
            {profileError && <p className="text-sm text-danger font-bold">{profileError}</p>}
            <button type="submit" disabled={profileLoading || !profileName.trim()}
              className="btn btn-primary w-full h-12 rounded-xl text-base font-semibold mt-2">
              {profileLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : 'Get Started'}
            </button>
            <button type="button" onClick={handleProfileSkip}
              className="text-sm text-text-secondary text-center underline w-full py-2">Skip for now</button>
          </form>
        )}
      </Modal>

      {/* Country picker bottom sheet */}
      <BottomSheet isOpen={showCountryPicker} onClose={() => { setShowCountryPicker(false); setCountrySearch(''); }} title="Select country">
        <div className="country-picker-body">
          <div className="country-search-wrap">
            <div className="country-search-inner">
              <svg className="country-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input type="text" className="country-search-input" placeholder="Search by name or code…"
                value={countrySearch} onChange={(e) => setCountrySearch(e.target.value)} autoFocus />
              {countrySearch && (
                <button type="button" className="country-search-clear" onClick={() => setCountrySearch('')}>
                  <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
          </div>
          <div className="country-list">
            {!countrySearch && <div className="country-section-label">All countries</div>}
            {filteredCountries.map((country) => (
              <button key={country.code} type="button"
                className={`country-item${country.code === selectedCountry.code ? ' country-item-selected' : ''}`}
                onClick={() => selectCountry(country)}>
                <img className="country-item-flag" src={flagUrl(country.code, 'h20')} alt={country.name} width="26" height="20" loading="lazy" />
                <span className="country-item-name">{country.name}</span>
                <span className="country-item-code">{country.dialCode}</span>
                {country.code === selectedCountry.code && (
                  <div className="country-item-check"><svg viewBox="0 0 24 24"><polyline points="20,6 9,17 4,12"/></svg></div>
                )}
              </button>
            ))}
            {filteredCountries.length === 0 && countrySearch && <div className="country-no-results">No countries found</div>}
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
