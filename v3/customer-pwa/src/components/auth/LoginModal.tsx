'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Search, X, Check, ChevronDown, User } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { haptic } from '@/lib/haptics';
import { BottomSheet } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { formatPhoneForDisplay } from '@/lib/phone';
import { DEFAULT_COUNTRY, ALL_COUNTRIES, searchCountries, flagUrl } from '@/lib/countries';
import type { Country } from '@/lib/countries';
import { useTranslation } from '@/hooks/useTranslation';
import { usePhoneAuth } from '@/hooks/usePhoneAuth';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthDone?: () => void;
}

export function LoginModal({ isOpen, onClose, onAuthDone }: LoginModalProps) {
  const { t } = useTranslation();
  const { showToast } = useUIStore();
  const {
    phoneNumber,
    setCountryCode,
    handleSendOtp,
    handleVerifyOtp,
    handleProfileSetup,
    finishAuth,
    step, setStep,
    error,
    loading,
    reset,
  } = usePhoneAuth();

  const [phoneValue, setPhoneValue] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  const [profileName, setProfileName] = useState('');
  const [profileError, setProfileError] = useState('');

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const submittingOtpRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      reset();
      setPhoneValue('');
      setSelectedCountry(DEFAULT_COUNTRY);
      setOtp(['', '', '', '', '', '']);
      setOtpError('');
      setOtpLoading(false);
      setResendTimer(0);
      setProfileName('');
      setProfileError('');
      setCountrySearch('');
      setCountryCode(DEFAULT_COUNTRY.dialCode);
    }
  }, [isOpen, reset, setCountryCode]);

  useEffect(() => {
    if (isOpen) {
      setCountryCode(selectedCountry.dialCode);
    }
  }, [isOpen, selectedCountry.dialCode, setCountryCode]);

  useEffect(() => { if (isOpen && step === 'phone') { const t = setTimeout(() => phoneInputRef.current?.focus(), 400); return () => clearTimeout(t); } }, [isOpen, step]);
  useEffect(() => { if (isOpen && step === 'otp') { const t = setTimeout(() => otpRefs.current[0]?.focus(), 400); return () => clearTimeout(t); } }, [isOpen, step]);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => setResendTimer((prev) => { if (prev <= 1) { clearInterval(interval); return 0; } return prev - 1; }), 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  const selectCountry = useCallback((c: Country) => { setSelectedCountry(c); setShowCountryPicker(false); setCountrySearch(''); }, []);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhoneValue(formatPhoneForDisplay(e.target.value, selectedCountry.dialCode));
  };

  const handleSendOtpHandler = async () => {
    await handleSendOtp(phoneValue, selectedCountry.dialCode);
  };

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

  const handleVerifyOtpHandler = async () => {
    if (submittingOtpRef.current) return;
    const code = otp.join('');
    if (code.length !== 6) { setOtpError(t('auth.otpIncomplete')); return; }
    submittingOtpRef.current = true;
    setOtpLoading(true); setOtpError('');
    try {
      const success = await handleVerifyOtp(code);
      if (success) {
        haptic('success');
        finishAuth();
        onAuthDone?.();
        onClose();
      }
    } catch (err: unknown) {
      showToast((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('auth.otpInvalidError'), 'error');
      setOtp(['', '', '', '', '', '']); otpRefs.current[0]?.focus();
    } finally { setOtpLoading(false); submittingOtpRef.current = false; }
  };

  const handleVerifyOtpRef = useRef(handleVerifyOtpHandler);
  useEffect(() => { handleVerifyOtpRef.current = handleVerifyOtpHandler; });

  useEffect(() => {
    if (step !== 'otp' || !otp.every((d) => d) || otpLoading || submittingOtpRef.current) return;
    const timer = setTimeout(() => handleVerifyOtpRef.current(), 600);
    return () => clearTimeout(timer);
  }, [otp.join(''), step, otpLoading]);

  const handleResendOtp = async () => {
    if (resendTimer > 0) return;
    showToast(t('auth.otpResent'), 'info');
    setOtp(['', '', '', '', '', '']); otpRefs.current[0]?.focus();
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim()) { setProfileError(t('auth.nameRequired')); return; }
    setProfileError('');
    try {
      const success = await handleProfileSetup(profileName.trim());
      if (success) {
        finishAuth();
        onAuthDone?.();
        onClose();
      }
    } catch (err: unknown) {
      showToast((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('auth.saveProfileFailed'), 'error');
    }
  };

  const handleClose = () => { if (!useAuthStore.getState().isAuthenticated) useUIStore.getState().setIsGuest(true); onClose(); };

  const displayPhone = (() => {
    const d = phoneNumber.replace(/\D/g, '');
    if (d.length < 11) return phoneNumber;
    return `+${d.slice(0, 2)} ${d.slice(2, 4)}-${d.slice(4)}`;
  })();

  const stepProgressClass = step === 'phone' ? 'p1' : step === 'otp' ? 'p2' : 'p3';
  const stepLabelText = step === 'phone' ? t('auth.step1Label') : step === 'otp' ? t('auth.step2Label') : t('auth.step3Label');
  const flag = flagUrl(selectedCountry.code);
  const filteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return ALL_COUNTRIES;
    return searchCountries(countrySearch);
  }, [countrySearch]);

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={
          step === 'phone' ? t('auth.phoneTitle') :
          step === 'otp' ? t('auth.otpTitle') :
          t('auth.profileTitle')
        }
        meta={
          step === 'phone' ? t('auth.phoneSubtitle') :
          step === 'otp' ? t('auth.sentTo', { phone: displayPhone }) :
          t('auth.profileSubtitle')
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
          <form onSubmit={(e) => { e.preventDefault(); handleSendOtpHandler(); }} className="flex flex-col gap-4">
            <div className="phone-wrapper">
              <button type="button" className="country-selector" onClick={() => setShowCountryPicker(true)}>
                <img className="country-selector-flag" src={flag} alt={selectedCountry.name} width="24" height="16" />
                <span className="country-selector-code">{selectedCountry.dialCode}</span>
                <ChevronDown color="#8A8078" size={10} className="country-selector-chevron" />
              </button>
              <span className="phone-divider" />
              <input ref={phoneInputRef} type="tel" value={phoneValue} onChange={handlePhoneChange}
                placeholder="12 345 6789" inputMode="tel" autoComplete="tel-national" className="phone-input" aria-invalid={!!error} aria-describedby={error ? "phone-error" : undefined} />
            </div>
            {error && <p id="phone-error" className="text-sm text-danger font-bold">{error}</p>}
            <button type="submit" disabled={loading || phoneValue.replace(/\D/g, '').length < 7}
              className="btn btn-primary w-full h-12 rounded-xl text-base font-semibold mt-2">
              {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : t('auth.sendCode')}
            </button>
            <button type="button" className="guest-link"
              onClick={() => { useUIStore.getState().setIsGuest(true); onClose(); }}>
              {t('auth.continueAsGuest')}
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
                  aria-label={t('auth.digitAriaLabel', { index: index + 1 })}
                  className={`w-12 h-14 rounded-xl border-2 text-center text-xl font-bold outline-none transition-colors flex-shrink-0 ${digit ? 'border-primary bg-primary-50 text-primary' : 'border-border bg-bg-light text-text-primary'} focus:border-primary focus:ring-2 focus:ring-primary/15`} />
              ))}
            </div>
            <p className="text-sm text-text-secondary text-center">
              {t('auth.didntReceiveIt')}{' '}
              <button type="button" className="text-primary font-semibold disabled:text-text-muted"
                onClick={handleResendOtp} disabled={resendTimer > 0}>
                {resendTimer > 0 ? t('auth.resendIn', { seconds: resendTimer }) : t('auth.resendOtp')}
              </button>
            </p>
            {otpError && <p id="otp-error" className="text-sm text-danger font-bold text-center">{otpError}</p>}
            {error && <p className="text-sm text-danger font-bold text-center">{error}</p>}
            <button type="button" className="text-sm text-text-secondary text-center underline"
              onClick={() => setStep('phone')}>{t('auth.changePhoneNumber')}</button>
            <button onClick={handleVerifyOtpHandler} disabled={otpLoading || otp.some((d) => !d)}
              className="btn btn-primary w-full h-12 rounded-xl text-base font-semibold mt-1">
              {otpLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : t('auth.verify')}
            </button>
          </div>
        )}

        {/* ── Profile Step ── */}
        {step === 'profile' && (
          <form onSubmit={handleProfileSubmit} className="flex flex-col gap-4">
            <div className="flex items-center gap-4 mb-2">
              <div className={`lm-avatar ${profileName ? 'lm-avatar-filled' : ''}`}>
                {profileName ? (profileName.trim()[0] ?? '?').toUpperCase() : <User color="#8A8078" size={24} />}
              </div>
              <div>
                <p className="text-xs text-text-muted font-medium">{t('auth.yourAccount')}</p>
                <p className="text-sm font-semibold text-text-primary">
                  {profileName.trim() || t('auth.setupProfile')}
                </p>
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">{t('auth.fullName')}</div>
              <input type="text" value={profileName}
                onChange={(e) => { setProfileName(e.target.value); setProfileError(''); }}
                placeholder={t('auth.namePlaceholder')} autoFocus
                className="w-full bg-bg-light rounded-xl px-4 py-3 border border-border-subtle focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-base text-text-primary placeholder-text-muted transition-colors" aria-invalid={!!profileError} aria-describedby={profileError ? "profile-error" : undefined} />
            </div>
            {profileError && <p id="profile-error" className="text-sm text-danger font-bold">{profileError}</p>}
            {error && <p className="text-sm text-danger font-bold">{error}</p>}
            <button type="submit" disabled={loading || !profileName.trim()}
              className="btn btn-primary w-full h-12 rounded-xl text-base font-semibold mt-2">
              {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : t('auth.getStarted')}
            </button>
          </form>
        )}
      </Modal>

      {/* Country picker bottom sheet */}
      <BottomSheet isOpen={showCountryPicker} onClose={() => { setShowCountryPicker(false); setCountrySearch(''); }} title={t('common.selectCountry')}>
        <div className="country-picker-body">
          <div className="country-search-wrap">
            <div className="country-search-inner">
              <Search color="#8A8078" size={14} className="country-search-icon" />
              <input type="text" className="country-search-input" placeholder={t('auth.countrySearch')}
                value={countrySearch} onChange={(e) => setCountrySearch(e.target.value)} autoFocus />
              {countrySearch && (
                <button type="button" className="country-search-clear" onClick={() => setCountrySearch('')}>
                  <X color="#8A8078" size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="country-list">
            {!countrySearch && <div className="country-section-label">{t('common.allCountries')}</div>}
            {filteredCountries.map((country) => (
              <button key={country.code} type="button"
                className={`country-item${country.code === selectedCountry.code ? ' country-item-selected' : ''}`}
                onClick={() => selectCountry(country)}
                aria-label={country.name}>
                <img className="country-item-flag" src={flagUrl(country.code, 'h20')} alt={country.name} width="26" height="20" loading="lazy" />
                <span className="country-item-name">{country.name}</span>
                <span className="country-item-code">{country.dialCode}</span>
                {country.code === selectedCountry.code && (
                  <div className="country-item-check"><Check color="#3B4A1A" size={14} /></div>
                )}
              </button>
            ))}
            {filteredCountries.length === 0 && countrySearch && <div className="country-no-results">{t('common.noCountriesFound')}</div>}
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
