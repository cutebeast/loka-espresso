'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, FileText, Shield, ChevronRight, Coffee, Globe } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useTranslation } from '@/hooks/useTranslation';
import { LanguageSelectorModal } from '@/components/shared/LanguageSelectorModal';
import api from '@/lib/api';

export default function SettingsPage() {
  const { setPage } = useUIStore();
  const { t, locale } = useTranslation();
  const [showLangSheet, setShowLangSheet] = useState(false);
  const [aboutText, setAboutText] = useState('');

  useEffect(() => {
    api.get('/content/legal/about')
      .then((res) => {
        // v3 returns array of content blocks; find the "about" or "system" type
        const data = res.data;
        let desc = null;
        if (Array.isArray(data)) {
          const aboutBlock = data.find((b: any) => 
            b.content_type === 'system' || b.block_key === 'about' || b.block_name?.toLowerCase().includes('about')
          );
          desc = aboutBlock?.long_description || aboutBlock?.body_text || aboutBlock?.short_description;
        } else if (data && typeof data === 'object') {
          desc = data.long_description || data.body_text;
        }
        if (desc) setAboutText(desc);
        else setAboutText(t('settings.aboutFallback'));
      })
      .catch(() => { setAboutText(t('settings.aboutFallback')); });
  }, []);

  return (
    <div className="settings-screen">
      <div className="sub-page-header">
        <div className="sub-header-left">
          <button className="sub-back-btn" onClick={() => setPage('profile')} aria-label={t('common.back')}>
            <ArrowLeft size={20} />
          </button>
          <h1 className="sub-page-title">{t('settings.title')}</h1>
        </div>
        <div className="ad-spacer" />
      </div>

      <div className="settings-content-scroll">
        {/* Language */}
        <div className="settings-section-title">{t('settings.language')}</div>
        <div className="settings-menu-card">
          <button
            className="settings-menu-item"
            onClick={() => setShowLangSheet(true)}
          >
            <div className="settings-menu-icon settings-icon-language">
              <Globe size={18} />
            </div>
            <span className="settings-menu-label">
              {t(`settings.languages.${locale}`)}
            </span>
            <ChevronRight size={16} className="settings-menu-arrow" />
          </button>
        </div>

        {/* Privacy & Legal */}
        <div className="settings-section-title">{t('settings.privacyLegal')}</div>
        <div className="settings-menu-card">
          <button className="settings-menu-item" onClick={() => setPage('legal', { legalKey: 'terms', backTo: 'settings' })}>
            <div className="settings-menu-icon settings-icon-terms">
              <FileText size={18} />
            </div>
            <span className="settings-menu-label">{t('settings.termsOfService')}</span>
            <ChevronRight size={16} className="settings-menu-arrow" />
          </button>
          <button className="settings-menu-item" onClick={() => setPage('legal', { legalKey: 'privacy', backTo: 'settings' })}>
            <div className="settings-menu-icon settings-icon-privacy">
              <Shield size={18} />
            </div>
            <span className="settings-menu-label">{t('settings.privacyPolicy')}</span>
            <ChevronRight size={16} className="settings-menu-arrow" />
          </button>
        </div>

        {/* About — fetched dynamically from admin system content */}
        <div className="settings-section-title">{t('settings.about')}</div>
        <div className="settings-about-section">
          <div className="settings-about-brand">
            <div className="settings-about-dot">
              <Coffee size={12} color="#fff" />
            </div>
            <h3 className="settings-about-title">LOKA Espresso</h3>
          </div>
          <p className="settings-about-desc">{aboutText}</p>
        </div>

        {/* App Info */}
        <div className="settings-app-info">
          <div className="settings-version">{t('settings.version')} 1.0.0</div>
          <div className="settings-attribution">{t('settings.attribution')}</div>
        </div>
      </div>

      <LanguageSelectorModal
        isOpen={showLangSheet}
        onClose={() => setShowLangSheet(false)}
      />
    </div>
  );
}
