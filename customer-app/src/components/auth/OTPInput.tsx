'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Check, Loader2, MessageSquare } from 'lucide-react';

interface OTPInputProps {
  phone: string;
  onSubmit: (otp: string) => Promise<void>;
  onResend: () => Promise<void>;
  initialRetryAfterSeconds?: number;
  onBack: () => void;
}

const LOKA = {
  primary: '#384B16',
  primaryDark: '#2A3910',
  primaryDisabled: '#6B7A4E',
  copper: '#D18E38',
  copperSoft: 'rgba(209,142,56,0.12)',
  textPrimary: '#1B2023',
  textMuted: '#6A7A8A',
  border: '#C4CED8',
  borderSubtle: '#E4EAEF',
  danger: '#C75050',
  success: '#5C8A3E',
  successSoft: '#EEF4E8',
  bg: '#FFFFFF',
} as const;

export function OTPInput({ phone, onSubmit, onResend, initialRetryAfterSeconds = 60, onBack }: OTPInputProps) {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(initialRetryAfterSeconds);
  const [showResentToast, setShowResentToast] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    setResendTimer(initialRetryAfterSeconds);
  }, [initialRetryAfterSeconds]);

  useEffect(() => {
    if (resendTimer <= 0) {
      return undefined;
    }
    const interval = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
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
    pastedData.split('').forEach((char, i) => {
      if (i < 6) newOtp[i] = char;
    });
    setOtp(newOtp);
    const lastFilledIndex = Math.min(pastedData.length - 1, 5);
    inputRefs.current[lastFilledIndex]?.focus();
  };

  const handleVerify = async () => {
    const code = otp.join('');
    if (code.length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }
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
      setShowResentToast(true);
      setTimeout(() => setShowResentToast(false), 2500);
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

  // Format +60123456789 → +60 12-345 6789
  const displayPhone = (() => {
    const d = phone.replace(/\D/g, '');
    if (d.length < 11) return phone;
    return `+${d.slice(0, 2)} ${d.slice(2, 4)}-${d.slice(4, 7)} ${d.slice(7)}`;
  })();

  const isDisabled = isLoading || otp.some((d) => !d);

  return (
    <div
      className="w-full h-full flex flex-col overflow-y-auto"
      style={{ background: LOKA.bg }}
    >
      <div
        className="flex flex-col h-full"
        style={{ padding: '20px 24px 32px' }}
      >
        {/* Top bar – back button */}
        <div style={{ marginBottom: 20 }}>
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onBack}
            aria-label="Back"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              borderRadius: 12,
              background: '#F5F7FA',
              border: 'none',
              cursor: 'pointer',
              color: LOKA.textPrimary,
            }}
          >
            <ArrowLeft size={18} />
          </motion.button>
        </div>

        {/* Brand accent */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.35 }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 56,
            height: 56,
            borderRadius: 18,
            background: LOKA.copperSoft,
            border: `1px solid rgba(209,142,56,0.25)`,
            marginBottom: 28,
          }}
        >
          <MessageSquare
            size={26}
            style={{ color: LOKA.copper }}
            strokeWidth={1.8}
          />
        </motion.div>

        {/* Header */}
        <motion.div
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          style={{ marginBottom: 28 }}
        >
          <h2
            style={{
              fontSize: 30,
              fontWeight: 800,
              lineHeight: 1.15,
              color: LOKA.textPrimary,
              letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            Enter verification code
          </h2>
          <p
            style={{
              marginTop: 10,
              fontSize: 15,
              color: LOKA.textMuted,
              lineHeight: 1.5,
            }}
          >
            We sent a 6-digit code to{' '}
            <span style={{ color: LOKA.textPrimary, fontWeight: 600 }}>
              {displayPhone}
            </span>
            <button
              onClick={onBack}
              style={{
                marginLeft: 6,
                color: LOKA.primary,
                background: 'transparent',
                border: 'none',
                padding: 0,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              edit
            </button>
          </p>
        </motion.div>

        {/* OTP inputs */}
        <motion.div
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          style={{ marginBottom: 24 }}
        >
          <div
            onPaste={handlePaste}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: 8,
            }}
          >
            {otp.map((digit, index) => {
              const isFocusedBox = focusedIndex === index;
              const borderColor = error
                ? LOKA.danger
                : isFocusedBox
                  ? LOKA.primary
                  : digit
                    ? LOKA.primary
                    : LOKA.border;
              return (
                <input
                  key={index}
                  ref={(el) => {
                    inputRefs.current[index] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  pattern="\d"
                  value={digit}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onFocus={() => setFocusedIndex(index)}
                  onBlur={() => setFocusedIndex(null)}
                  maxLength={1}
                  aria-label={`Digit ${index + 1}`}
                  style={{
                    width: '100%',
                    aspectRatio: '1 / 1.2',
                    textAlign: 'center',
                    fontSize: 26,
                    fontWeight: 700,
                    border: `1.5px solid ${borderColor}`,
                    borderRadius: 14,
                    outline: 'none',
                    background: digit ? '#FAFBF8' : '#FFFFFF',
                    color: LOKA.textPrimary,
                    transition: 'all 0.15s ease',
                    boxShadow: isFocusedBox
                      ? `0 0 0 4px rgba(56,75,22,0.08)`
                      : 'none',
                    caretColor: LOKA.primary,
                  }}
                />
              );
            })}
          </div>

          {/* OTP-sent confirmation pill */}
          <AnimatePresence mode="wait">
            {showResentToast ? (
              <motion.div
                key="resent"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 14,
                  padding: '6px 12px',
                  borderRadius: 999,
                  background: LOKA.successSoft,
                  color: LOKA.success,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <Check size={14} /> New code sent
              </motion.div>
            ) : (
              <motion.div
                key="sent"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 14,
                  padding: '6px 12px',
                  borderRadius: 999,
                  background: LOKA.successSoft,
                  color: LOKA.success,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <Check size={14} /> Code sent to your phone
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {error && (
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ color: LOKA.danger, fontSize: 13, marginBottom: 12 }}
          >
            {error}
          </motion.p>
        )}

        {/* Primary CTA */}
        <motion.button
          onClick={handleVerify}
          disabled={isDisabled}
          whileTap={isDisabled ? {} : { scale: 0.985 }}
          style={{
            background: isDisabled ? LOKA.primaryDisabled : LOKA.primary,
            color: '#FFFFFF',
            fontWeight: 600,
            fontSize: 16,
            padding: '17px 20px',
            borderRadius: 9999,
            width: '100%',
            marginTop: 4,
            border: 'none',
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            boxShadow: isDisabled
              ? 'none'
              : '0 10px 24px -10px rgba(42,57,16,0.5)',
            transition:
              'background-color 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease',
          }}
        >
          {isLoading ? (
            <Loader2
              className="animate-spin"
              style={{ width: 20, height: 20, margin: '0 auto' }}
            />
          ) : (
            'Verify & Continue'
          )}
        </motion.button>

        <div style={{ flex: 1 }} />

        {/* Resend */}
        <p
          style={{
            textAlign: 'center',
            marginTop: 24,
            fontSize: 14,
            color: LOKA.textMuted,
          }}
        >
          Didn&apos;t get a code?{' '}
          <button
            onClick={handleResend}
            disabled={resendTimer > 0}
            style={{
              color: resendTimer > 0 ? LOKA.textMuted : LOKA.primary,
              fontWeight: 600,
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: resendTimer > 0 ? 'not-allowed' : 'pointer',
              fontSize: 14,
              textDecoration: resendTimer > 0 ? 'none' : 'underline',
            }}
          >
            {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend code'}
          </button>
        </p>
      </div>
    </div>
  );
}
