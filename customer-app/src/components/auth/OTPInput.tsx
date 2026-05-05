'use client';

import { useState, useRef, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { AuthStepIndicator } from './AuthStepIndicator';

interface OTPInputProps {
  phone: string;
  onSubmit: (otp: string) => Promise<void>;
  onResend: () => Promise<void>;
  initialRetryAfterSeconds?: number;
  onBack: () => void;
}

export function OTPInput({ phone, onSubmit, onResend, initialRetryAfterSeconds = 60, onBack }: OTPInputProps) {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(initialRetryAfterSeconds);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { inputRefs.current[0]?.focus(); }, []);

  useEffect(() => { setResendTimer(initialRetryAfterSeconds); }, [initialRetryAfterSeconds]);

  useEffect(() => {
    if (resendTimer <= 0) return undefined;
    const interval = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    setError('');

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, 6);
    if (!/^\d+$/.test(pastedData)) return;
    const newOtp = [...otp];
    pastedData.split('').forEach((char, i) => { if (i < 6) newOtp[i] = char; });
    setOtp(newOtp);
    const lastFilledIndex = Math.min(pastedData.length - 1, 5);
    inputRefs.current[lastFilledIndex]?.focus();
  };

  const handleVerify = async () => {
    const code = otp.join('');
    if (code.length !== 6) { setError('Please enter the complete 6-digit code'); return; }
    setIsLoading(true);
    setError('');
    try {
      await onSubmit(code);
    } catch {
      setError('Invalid OTP. Please try again.');
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;
    try {
      await onResend();
      setResendTimer(60);
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch {
      setError('Failed to resend OTP.');
    }
  };

  // Auto-submit when 6 digits are entered
  useEffect(() => {
    if (otp.every((d) => d) && !isLoading) {
      handleVerify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp.join('')]);

  const displayPhone = (() => {
    const d = phone.replace(/\D/g, '');
    if (d.length < 11) return phone;
    return `+${d.slice(0, 2)} ${d.slice(2, 4)}-${d.slice(4, 7)} ${d.slice(7)}`;
  })();

  const filledCount = otp.filter((d) => d).length;
  const autoFillPercent = (filledCount / 6) * 100;

  return (
    <div className="auth-page">
      <AuthStepIndicator currentStep={2} />

      <button onClick={onBack} className="auth-back-btn">
        <ArrowLeft size={16} />
        Back
      </button>

      <h2 className="auth-heading">Enter code</h2>
      <p className="auth-subheading">
        We sent a 6‑digit code to <strong className="otp-phone">{displayPhone}</strong>
      </p>

      <div className="otp-grid" onPaste={handlePaste}>
        {otp.map((digit, index) => (
          <input
            key={index}
            ref={(el) => { inputRefs.current[index] = el; }}
            type="text"
            inputMode="numeric"
            pattern="\d"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            aria-label={`Digit ${index + 1}`}
            className={`otp-box ${digit ? 'filled' : ''} ${index === filledCount && !digit ? 'active-border' : ''}`}
            onFocus={(e) => e.currentTarget.select()}
          />
        ))}
      </div>

      {/* Auto-submit progress line */}
      <div className="otp-auto-line">
        <div
          className={`otp-auto-fill ${filledCount > 0 ? `otp-auto-fill-${filledCount}` : ''}`}
        />
      </div>

      <div className="otp-resend-row">
        <span className="otp-resend-text">Didn&apos;t receive the code?</span>
        <span
          className={`otp-resend-timer ${resendTimer > 0 ? 'disabled' : ''}`}
          onClick={resendTimer > 0 ? undefined : handleResend}
        >
          {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend code'}
        </span>
      </div>

      {error && (
        <p id="otp-error" className="otp-error">{error}</p>
      )}

      <button onClick={handleVerify} disabled={isLoading || otp.some((d) => !d)} className="auth-btn">
        {isLoading ? <div className="auth-btn-spinner" /> : 'Verify & Continue'}
      </button>

      <div className="otp-spacer" />
    </div>
  );
}
