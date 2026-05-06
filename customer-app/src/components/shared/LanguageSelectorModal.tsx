'use client';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Globe } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { getSupportedLocales } from '@/lib/i18n';

interface LanguageSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LanguageSelectorModal({ isOpen, onClose }: LanguageSelectorModalProps) {
  const { t, locale, setLocale } = useTranslation();

  const handleSelect = (code: string) => {
    setLocale(code);
    onClose();
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={t('settings.language')}>
      <div className="language-sheet-list">
        {getSupportedLocales().map((code) => (
          <button
            key={code}
            className={`language-sheet-item${locale === code ? ' selected' : ''}`}
            onClick={() => handleSelect(code)}
          >
            <div className="language-sheet-icon">
              <Globe size={20} />
            </div>
            <span className="language-sheet-label">
              {t(`settings.languages.${code}`)}
            </span>
            {locale === code && (
              <span className="language-sheet-check">✓</span>
            )}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
