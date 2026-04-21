'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Coffee, Loader2, Phone } from 'lucide-react';
import { normalizePhone } from '@/lib/phone';

interface PhoneInputProps {
  onSubmit: (phone: string) => Promise<void>;
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
  bg: '#FFFFFF',
} as const;

export function PhoneInput({ onSubmit }: PhoneInputProps) {
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const formatPhone = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 10);
    // Format: 12 345 6789 / 123 456 7890
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
    if (digits.length <= 9)
      return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhone(e.target.value));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = phone.replace(/\D/g, '');

    if (!digits || digits.length < 9) {
      setError('Please enter a valid phone number');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const normalized = normalizePhone(phone);
      await onSubmit(normalized);
    } catch {
      setError('Failed to send OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const digitCount = phone.replace(/\D/g, '').length;
  const isDisabled = isLoading || digitCount < 9;
  const borderColor = error
    ? LOKA.danger
    : isFocused
      ? LOKA.primary
      : LOKA.border;

  return (
    <div
      className="w-full h-full flex flex-col overflow-y-auto"
      style={{ background: LOKA.bg }}
    >
      <div
        className="flex flex-col h-full"
        style={{ padding: '56px 24px 32px' }}
      >
        {/* Brand mark */}
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
          <Coffee size={28} style={{ color: LOKA.copper }} strokeWidth={1.8} />
        </motion.div>

        {/* Header */}
        <motion.div
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          style={{ marginBottom: 32 }}
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
            Welcome back
          </h2>
          <p
            style={{
              marginTop: 10,
              fontSize: 15,
              color: LOKA.textMuted,
              lineHeight: 1.5,
            }}
          >
            Enter your mobile number to continue
          </p>
        </motion.div>

        {/* Form */}
        <motion.form
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          onSubmit={handleSubmit}
          className="flex flex-col"
        >
          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: LOKA.textPrimary,
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                letterSpacing: '0.01em',
              }}
            >
              <Phone size={13} style={{ color: LOKA.textMuted }} />
              Phone number
            </label>
            <div
              className="phone-wrapper"
              style={{
                display: 'flex',
                alignItems: 'center',
                border: `1.5px solid ${borderColor}`,
                borderRadius: 16,
                padding: '4px 16px 4px 14px',
                background: LOKA.bg,
                transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                boxShadow: isFocused
                  ? `0 0 0 4px rgba(56,75,22,0.08)`
                  : 'none',
              }}
            >
              {/* Country selector (visual) */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  paddingRight: 10,
                  marginRight: 10,
                  borderRight: `1px solid ${LOKA.borderSubtle}`,
                }}
              >
                <span style={{ fontSize: 18 }} role="img" aria-label="Malaysia">
                  🇲🇾
                </span>
                <span
                  style={{
                    fontWeight: 600,
                    color: LOKA.textPrimary,
                    fontSize: 15,
                  }}
                >
                  +60
                </span>
              </div>
              <input
                type="tel"
                value={phone}
                onChange={handleChange}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="12 345 6789"
                autoFocus
                inputMode="tel"
                autoComplete="tel-national"
                style={{
                  border: 'none',
                  padding: '16px 0',
                  fontSize: 17,
                  fontWeight: 500,
                  width: '100%',
                  outline: 'none',
                  background: 'transparent',
                  color: LOKA.textPrimary,
                  letterSpacing: '0.01em',
                }}
              />
            </div>
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                color: LOKA.danger,
                fontSize: 13,
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {error}
            </motion.p>
          )}

          <motion.button
            type="submit"
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
              marginTop: 8,
              border: 'none',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              boxShadow: isDisabled
                ? 'none'
                : '0 10px 24px -10px rgba(42,57,16,0.5)',
              transition:
                'background-color 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease',
              letterSpacing: '0.01em',
            }}
          >
            {isLoading ? (
              <Loader2
                className="animate-spin"
                style={{ width: 20, height: 20, margin: '0 auto' }}
              />
            ) : (
              'Send OTP'
            )}
          </motion.button>

          {/* Helper / character counter */}
          <div
            style={{
              marginTop: 10,
              textAlign: 'center',
              fontSize: 12,
              color: LOKA.textMuted,
              minHeight: 16,
            }}
          >
            {digitCount > 0 && digitCount < 9
              ? `${9 - digitCount} more digit${9 - digitCount === 1 ? '' : 's'}`
              : ''}
          </div>
        </motion.form>

        <div style={{ flex: 1 }} />

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          style={{
            textAlign: 'center',
            marginTop: 24,
            fontSize: 12,
            color: LOKA.textMuted,
            lineHeight: 1.5,
          }}
        >
          By continuing you agree to our{' '}
          <a
            href="#"
            style={{
              color: LOKA.primary,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Terms of Service
          </a>{' '}
          &{' '}
          <a
            href="#"
            style={{
              color: LOKA.primary,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Privacy Policy
          </a>
        </motion.p>
      </div>
    </div>
  );
}
