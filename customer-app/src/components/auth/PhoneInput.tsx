'use client';

import { useCallback, useState, useMemo } from 'react';
import { normalizePhone, formatPhoneForDisplay } from '@/lib/phone';
import { DEFAULT_COUNTRY, ALL_COUNTRIES, searchCountries, flagUrl } from '@/lib/countries';
import type { Country } from '@/lib/countries';
import api from '@/lib/api';
import { BottomSheet } from '@/components/ui';
import { useUIStore } from '@/stores/uiStore';
import { AuthStepIndicator } from './AuthStepIndicator';

interface PhoneInputProps {
  onSubmit: (phone: string) => Promise<void>;
}

interface LegalSection {
  title?: string;
  body?: string;
  list?: string[];
}

interface LegalContent {
  id: number;
  title: string;
  long_description: string | null;
  sections: LegalSection[] | null;
  content_type: string;
  updated_at: string | null;
}

type LegalKey = 'terms' | 'privacy';

export function PhoneInput({ onSubmit }: PhoneInputProps) {
  const { setPage } = useUIStore();
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<Country>(DEFAULT_COUNTRY);

  // Country picker state
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  // Legal sheet state
  const [activeLegalKey, setActiveLegalKey] = useState<LegalKey | null>(null);
  const [legalContent, setLegalContent] = useState<LegalContent | null>(null);
  const [legalLoading, setLegalLoading] = useState(false);
  const [legalError, setLegalError] = useState('');

  // Filtered country list for the picker
  const filteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return ALL_COUNTRIES;
    return searchCountries(countrySearch);
  }, [countrySearch]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhoneForDisplay(e.target.value, selectedCountry.dialCode));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = phone.replace(/\D/g, '');

    if (!digits || digits.length < 7) {
      setError('Please enter a valid phone number');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const normalized = normalizePhone(phone, selectedCountry.dialCode);
      await onSubmit(normalized);
    } catch {
      setError('Failed to send OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const digitCount = phone.replace(/\D/g, '').length;
  const isDisabled = isLoading || digitCount < 7;

  // Country picker handlers
  const handleSelectCountry = useCallback((country: Country) => {
    setSelectedCountry(country);
    setShowCountryPicker(false);
    setCountrySearch('');
  }, []);

  const closeCountryPicker = useCallback(() => {
    setShowCountryPicker(false);
    setCountrySearch('');
  }, []);

  // Legal sheet handlers
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

  const flag = flagUrl(selectedCountry.code);

  return (
    <>
      <div className="auth-page">
        <AuthStepIndicator currentStep={1} />

        <h2 className="auth-heading">Welcome back</h2>
        <p className="auth-subheading">Sign in with your phone number to continue</p>

        <form onSubmit={handleSubmit} className="pi-form">
          <div className="phone-wrapper">
            {/* Country selector — tappable, flag from flagcdn.com */}
            <button
              type="button"
              className="country-selector"
              onClick={() => setShowCountryPicker(true)}
              aria-label={`Country: ${selectedCountry.name} ${selectedCountry.dialCode}`}
            >
              <img
                className="country-selector-flag"
                src={flag}
                alt={selectedCountry.name}
                width="24"
                height="16"
                loading="eager"
              />
              <span className="country-selector-code">{selectedCountry.dialCode}</span>
              <svg className="country-selector-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none">
                <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <span className="phone-divider" />

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

          {error && (
            <p className="pi-error">{error}</p>
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

          <div className="pi-divider">
            <span className="pi-divider-line" />
            <span className="pi-divider-text">or</span>
            <span className="pi-divider-line" />
          </div>

          <button
            type="button"
            className="pi-guest-btn"
            onClick={() => {
              const ui = useUIStore.getState();
              ui.setPage('home');
              ui.setIsGuest(true);
            }}
          >
            Browse as Guest
          </button>

          <div className="pi-spacer" />
        </form>
      </div>

      {/* ── Country Picker Bottom Sheet ── */}
      <BottomSheet
        isOpen={showCountryPicker}
        onClose={closeCountryPicker}
        title="Select country"
      >
        <div className="country-picker-body">
          {/* Search input */}
          <div className="country-search-wrap">
            <div className="country-search-inner">
              <svg className="country-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                className="country-search-input"
                placeholder="Search by name or code…"
                value={countrySearch}
                onChange={(e) => setCountrySearch(e.target.value)}
                autoFocus
              />
              {countrySearch && (
                <button
                  type="button"
                  className="country-search-clear"
                  onClick={() => setCountrySearch('')}
                  aria-label="Clear search"
                >
                  <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
          </div>

          {/* Country list */}
          <div className="country-list">
            {!countrySearch && (
              <div className="country-section-label">Popular</div>
            )}
            {filteredCountries.map((country) => (
              <button
                key={country.code}
                type="button"
                className={`country-item${country.code === selectedCountry.code ? ' country-item-selected' : ''}`}
                onClick={() => handleSelectCountry(country)}
              >
                <img
                  className="country-item-flag"
                  src={flagUrl(country.code, 'h20')}
                  alt={country.name}
                  width="26"
                  height="20"
                  loading="lazy"
                />
                <span className="country-item-name">{country.name}</span>
                <span className="country-item-code">{country.dialCode}</span>
                {country.code === selectedCountry.code && (
                  <div className="country-item-check">
                    <svg viewBox="0 0 24 24"><polyline points="20,6 9,17 4,12"/></svg>
                  </div>
                )}
              </button>
            ))}
            {filteredCountries.length === 0 && countrySearch && (
              <div className="country-no-results">
                No countries found for &ldquo;{countrySearch}&rdquo;
              </div>
            )}
          </div>
        </div>
      </BottomSheet>

      {/* ── Legal Content Bottom Sheet ── */}
      <BottomSheet
        isOpen={activeLegalKey !== null}
        onClose={closeLegalSheet}
        title={legalContent?.title || (activeLegalKey === 'terms' ? 'Terms of Service' : 'Privacy Policy')}
      >
        {legalLoading ? (
          <div className="pi-skeleton-list">
            <div className="skeleton pi-skeleton-line pi-skeleton-66" />
            <div className="skeleton pi-skeleton-line pi-skeleton-100" />
            <div className="skeleton pi-skeleton-line pi-skeleton-100" />
            <div className="skeleton pi-skeleton-line pi-skeleton-83" />
            <div className="skeleton pi-skeleton-line pi-skeleton-100" />
          </div>
        ) : legalError ? (
          <div className="pi-legal-error">
            {legalError}
          </div>
        ) : (
          <div className="legal-sheet-body">
            {/* Updated banner */}
            {legalContent?.updated_at && (
              <>
                <div className="legal-updated-banner">
                  <div className="legal-updated-icon">
                    <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  </div>
                  <div>
                    <div className="legal-updated-label">Last Updated</div>
                    <div className="legal-updated-date">
                      {new Date(legalContent.updated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                  </div>
                </div>
                <hr className="legal-divider" />
              </>
            )}

            {/* Content — structured sections or fallback plain text */}
            <div className="legal-content">
              {legalContent?.sections && legalContent.sections.length > 0 ? (
                legalContent.sections.map((section, i) => (
                  <div key={i}>
                    {section.title && <h3 className="legal-section-title">{section.title}</h3>}
                    {section.body && (
                      <p className="legal-paragraph" dangerouslySetInnerHTML={{ __html: section.body }} />
                    )}
                    {section.list && section.list.length > 0 && (
                      <ul className="legal-list">
                        {section.list.map((item, j) => (
                          <li key={j} dangerouslySetInnerHTML={{ __html: item }} />
                        ))}
                      </ul>
                    )}
                  </div>
                ))
              ) : (
                <p className="legal-paragraph">
                  {legalContent?.long_description || 'No content available.'}
                </p>
              )}
            </div>
          </div>
        )}
      </BottomSheet>
    </>
  );
}
