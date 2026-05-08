'use client';

import { useState } from 'react';
import { Globe } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { LanguageSelectorModal } from '@/components/shared/LanguageSelectorModal';

export function AuthLangButton() {
  const { t, locale } = useTranslation();
  const [show, setShow] = useState(false);

  return (
    <>
      <div style={{
        display: 'flex', justifyContent: 'flex-end',
        padding: '0 0 8px',
      }}>
        <button
          onClick={() => setShow(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 12px', borderRadius: 14,
            background: '#F2EEE6', border: '1px solid #e0dcd0',
            fontSize: 12, fontWeight: 600, color: '#1E1B18',
            cursor: 'pointer',
          }}
          aria-label={t('settings.language')}
        >
          <Globe size={13} />
          {locale.toUpperCase()}
        </button>
      </div>
      <LanguageSelectorModal isOpen={show} onClose={() => setShow(false)} />
    </>
  );
}
