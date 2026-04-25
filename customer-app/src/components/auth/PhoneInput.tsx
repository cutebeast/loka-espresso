'use client';

import { useCallback, useState } from 'react';
import { normalizePhone } from '@/lib/phone';
import api from '@/lib/api';
import { BottomSheet } from '@/components/ui';
import { useUIStore } from '@/stores/uiStore';

interface PhoneInputProps {
  onSubmit: (phone: string) => Promise<void>;
}

interface LegalContent {
  id: number;
  title: string;
  long_description: string | null;
  content_type: string;
}

type LegalKey = 'terms' | 'privacy';

function formatPhone(raw: string) {
  let digits = raw.replace(/\D/g, '');

  if (digits.startsWith('60') && digits.length > 2) {
    digits = digits.slice(2);
  }

  if (digits.startsWith('0') && digits.length > 1) {
    digits = digits.slice(1);
  }

  digits = digits.slice(0, 10);

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

export function PhoneInput({ onSubmit }: PhoneInputProps) {
  const { setPage } = useUIStore();
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeLegalKey, setActiveLegalKey] = useState<LegalKey | null>(null);
  const [legalContent, setLegalContent] = useState<LegalContent | null>(null);
  const [legalLoading, setLegalLoading] = useState(false);
  const [legalError, setLegalError] = useState('');

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

  const closeLegalSheet = useCallback(() => {
    setActiveLegalKey(null);
    setLegalContent(null);
    setLegalError('');
    setLegalLoading(false);
  }, []);

  const openLegalSheet = useCallback(async (key: LegalKey) => {
    setActiveLegalKey(key);
    setLegalLoading(true);
    setLegalError('');
    setLegalContent(null);

    try {
      const res = await api.get<LegalContent>(`/content/legal/${key}`);
      setLegalContent(res.data);
    } catch {
      setLegalError(
        `Unable to load ${key === 'terms' ? 'Terms of Service' : 'Privacy Policy'} right now.`,
      );
    } finally {
      setLegalLoading(false);
    }
  }, []);

  return (
    <>
      <div className="auth-page">
        <h2 className="auth-heading">Welcome back</h2>
        <p className="auth-subheading">Sign in with your phone number to continue</p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div className="auth-label">Phone number</div>

          <div className="phone-wrapper">
            <span className="phone-prefix">+60</span>
            <span className="phone-divider">|</span>
            <input
              type="tel"
              value={phone}
              onChange={handleChange}
              placeholder="12 345 6789"
              autoFocus
              inputMode="tel"
              autoComplete="tel-national"
              className="phone-input"
            />
          </div>

          <p className="phone-hint">We&apos;ll send a verification code to this number</p>

          {error && (
            <p style={{ color: '#C75050', fontSize: '12px', marginTop: '8px' }}>{error}</p>
          )}

          <button type="submit" disabled={isDisabled} className="auth-btn">
            {isLoading ? <div className="auth-btn-spinner" /> : 'Send OTP'}
          </button>

          <p className="auth-legal">
            By continuing you agree to our<br />
            <button type="button" className="auth-legal-link" onClick={() => void openLegalSheet('terms')}>
              Terms of Service
            </button>
            {' '}and{' '}
            <button type="button" className="auth-legal-link" onClick={() => void openLegalSheet('privacy')}>
              Privacy Policy
            </button>
          </p>

          <div style={{ flex: 1 }} />
        </form>
      </div>

      <BottomSheet
        isOpen={activeLegalKey !== null}
        onClose={closeLegalSheet}
        title={legalContent?.title || (activeLegalKey === 'terms' ? 'Terms of Service' : 'Privacy Policy')}
      >
        {legalLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ height: '16px', width: '66%', background: '#E4EAEF', borderRadius: '4px' }} />
            <div style={{ height: '16px', width: '100%', background: '#E4EAEF', borderRadius: '4px' }} />
            <div style={{ height: '16px', width: '100%', background: '#E4EAEF', borderRadius: '4px' }} />
            <div style={{ height: '16px', width: '83%', background: '#E4EAEF', borderRadius: '4px' }} />
            <div style={{ height: '16px', width: '100%', background: '#E4EAEF', borderRadius: '4px' }} />
          </div>
        ) : legalError ? (
          <div style={{ borderRadius: '16px', border: '1px solid rgba(199,80,80,0.2)', background: '#FFEBEE', padding: '12px 16px', fontSize: '14px', color: '#C75050' }}>
            {legalError}
          </div>
        ) : (
          <>
            <div className="sheet-body">
              {legalContent?.long_description || 'No content available.'}
            </div>
            <button
              onClick={() => { closeLegalSheet(); setPage('legal', { legalKey: activeLegalKey || 'terms' }); }}
              style={{
                width: '100%',
                marginTop: 16,
                padding: '10px 0',
                background: 'none',
                border: 'none',
                color: '#384B16',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              View full page →
            </button>
          </>
        )}
      </BottomSheet>
    </>
  );
}
