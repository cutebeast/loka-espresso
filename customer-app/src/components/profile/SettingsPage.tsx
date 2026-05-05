'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, FileText, Shield, ChevronRight, Coffee, Globe } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { localeStore } from '@/stores/localeStore';
import { getSupportedLocales } from '@/lib/i18n';
import api from '@/lib/api';

const FALLBACK_ABOUT = "Born from a passion for authentic Turkish coffee culture, Loka Espresso brings the warmth of centuries-old coffee traditions to every cup. Our beans are sourced from the finest regions — roasted in small batches to honour the craft.";

export default function SettingsPage() {
  const { setPage } = useUIStore();
  const [aboutText, setAboutText] = useState(FALLBACK_ABOUT);

  useEffect(() => {
    api.get('/content/legal/about')
      .then((res) => {
        const desc = res.data?.long_description;
        if (desc) setAboutText(desc);
      })
      .catch(() => {}); // Use fallback if card doesn't exist yet
  }, []);

  return (
    <div className="settings-screen">
      <div className="sub-page-header">
        <div className="sub-header-left">
          <button className="sub-back-btn" onClick={() => setPage('profile')} aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <h1 className="sub-page-title">Settings</h1>
        </div>
        <div className="ad-spacer" />
      </div>

      <div className="settings-content-scroll">
        {/* Language */}
        <div className="settings-section-title">Language</div>
        <div className="settings-menu-card">
          {getSupportedLocales().map((code) => (
            <button
              key={code}
              className="settings-menu-item"
              onClick={() => localeStore.getState().setLocale(code)}
            >
              <div className="settings-menu-icon settings-icon-language">
                <Globe size={18} />
              </div>
              <span className="settings-menu-label">
                {code === 'en' && 'English'}
                {code === 'ms' && 'Bahasa Malaysia'}
                {code === 'zh' && '中文 (简体)'}
                {code === 'ta' && 'தமிழ்'}
                {code === 'tr' && 'Türkçe'}
              </span>
              {localeStore.getState().locale === code && (
                <span className="settings-menu-check">✓</span>
              )}
            </button>
          ))}
        </div>

        {/* Privacy & Legal */}
        <div className="settings-section-title">Privacy &amp; Legal</div>
        <div className="settings-menu-card">
          <button className="settings-menu-item" onClick={() => setPage('legal', { legalKey: 'terms', backTo: 'settings' })}>
            <div className="settings-menu-icon settings-icon-terms">
              <FileText size={18} />
            </div>
            <span className="settings-menu-label">Terms of Service</span>
            <ChevronRight size={16} className="settings-menu-arrow" />
          </button>
          <button className="settings-menu-item" onClick={() => setPage('legal', { legalKey: 'privacy', backTo: 'settings' })}>
            <div className="settings-menu-icon settings-icon-privacy">
              <Shield size={18} />
            </div>
            <span className="settings-menu-label">Privacy Policy</span>
            <ChevronRight size={16} className="settings-menu-arrow" />
          </button>
        </div>

        {/* About — fetched dynamically from admin system content */}
        <div className="settings-section-title">About</div>
        <div className="settings-about-section">
          <div className="settings-about-brand">
            <div className="settings-about-dot">
              <Coffee size={12} color="#fff" />
            </div>
            <h3 className="settings-about-title">Loka Espresso</h3>
          </div>
          <p className="settings-about-desc">{aboutText}</p>
        </div>

        {/* App Info */}
        <div className="settings-app-info">
          <div className="settings-version">Version 1.0.0</div>
          <div className="settings-attribution">Made with care by Loka Espresso</div>
        </div>
      </div>
    </div>
  );
}
