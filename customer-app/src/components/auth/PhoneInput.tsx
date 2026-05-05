'use client';

import { useCallback, useState, useMemo } from 'react';
import { Search, X, ChevronDown, Calendar } from 'lucide-react';
import { normalizePhone, formatPhoneForDisplay } from '@/lib/phone';
import { DEFAULT_COUNTRY, ALL_COUNTRIES, searchCountries, flagUrl } from '@/lib/countries';
import type { Country } from '@/lib/countries';
import api from '@/lib/api';
import { BottomSheet } from '@/components/ui';
import { useUIStore } from '@/stores/uiStore';
import { AuthStepIndicator } from './AuthStepIndicator';
import { useTranslation } from '@/hooks/useTranslation';

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
  const { t } = useTranslation();
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
      setError(t('auth.phoneInvalid'));
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const normalized = normalizePhone(phone, selectedCountry.dialCode);
      await onSubmit(normalized);
    } catch {
      setError(t('auth.sendOtpFailed'));
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
        t('auth.legalLoadFailed', { document: key === 'terms' ? t('auth.terms') : t('auth.privacy') }),
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

        <h2 className="auth-heading">{t('auth.phoneTitle')}</h2>
        <p className="auth-subheading">{t('auth.phoneSubtitleContinue')}</p>

        <form onSubmit={handleSubmit} className="pi-form">
          <div className="phone-wrapper">
            {/* Country selector — tappable, flag from flagcdn.com */}
            <button
              type="button"
              className="country-selector"
              onClick={() => setShowCountryPicker(true)}
              aria-label={t('auth.countrySelectorAriaLabel', { name: selectedCountry.name, dialCode: selectedCountry.dialCode })}
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
              <ChevronDown color="#8A8078" size={10} className="country-selector-chevron" />
            </button>

            <span className="phone-divider" />

            <input
              type="tel"
              value={phone}
              onChange={handleChange}
              placeholder={t('auth.phonePlaceholder')}
              autoFocus
              inputMode="tel"
              autoComplete="tel-national"
              className="phone-input"
            />
          </div>

          {error && (
            <p id="phone-error" className="pi-error">{error}</p>
          )}

          <button type="submit" disabled={isDisabled} className="auth-btn">
            {isLoading ? <div className="auth-btn-spinner" /> : t('auth.sendOtp')}
          </button>

          <p className="auth-legal">
            {t('auth.termsPrefixShort')}<br />
            <button type="button" className="auth-legal-link" onClick={() => void openLegalSheet('terms')}>
              {t('auth.terms')}
            </button>
            {' '}{t('common.and')}{' '}
            <button type="button" className="auth-legal-link" onClick={() => void openLegalSheet('privacy')}>
              {t('auth.privacy')}
            </button>
          </p>

          <div className="pi-divider">
            <span className="pi-divider-line" />
            <span className="pi-divider-text">{t('common.or')}</span>
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
            {t('auth.guestBrowse')}
          </button>

          <div className="pi-spacer" />
        </form>
      </div>

      {/* ── Country Picker Bottom Sheet ── */}
      <BottomSheet
        isOpen={showCountryPicker}
        onClose={closeCountryPicker}
        title={t('common.selectCountry')}
      >
        <div className="country-picker-body">
          {/* Search input */}
          <div className="country-search-wrap">
            <div className="country-search-inner">
              <Search color="#8A8078" size={14} className="country-search-icon" />
              <input
                type="text"
                className="country-search-input"
                placeholder={t('auth.countrySearch')}
                value={countrySearch}
                onChange={(e) => setCountrySearch(e.target.value)}
                autoFocus
              />
              {countrySearch && (
                <button
                  type="button"
                  className="country-search-clear"
                  onClick={() => setCountrySearch('')}
                  aria-label={t('common.clear')}
                >
                  <X color="#8A8078" size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Country list */}
          <div className="country-list">
            {!countrySearch && (
              <div className="country-section-label">{t('common.popular')}</div>
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
                {t('auth.noCountriesFound', { search: countrySearch })}
              </div>
            )}
          </div>
        </div>
      </BottomSheet>

      {/* ── Legal Content Bottom Sheet ── */}
      <BottomSheet
        isOpen={activeLegalKey !== null}
        onClose={closeLegalSheet}
        title={legalContent?.title || (activeLegalKey === 'terms' ? t('auth.terms') : t('auth.privacy'))}
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
                    <Calendar color="#4A4038" size={16} />
                  </div>
                  <div>
                    <div className="legal-updated-label">{t('common.lastUpdated')}</div>
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
                      <p className="legal-paragraph">{section.body}</p>
                    )}
                    {section.list && section.list.length > 0 && (
                      <ul className="legal-list">
                        {section.list.map((item, j) => (
                          <li key={j}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))
              ) : (
                <p className="legal-paragraph">
                  {legalContent?.long_description || t('common.noContentAvailable')}
                </p>
              )}
            </div>
          </div>
        )}
      </BottomSheet>
    </>
  );
}
