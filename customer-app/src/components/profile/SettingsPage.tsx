'use client';

import { ArrowLeft, FileText, Shield, ChevronRight } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';

export default function SettingsPage() {
  const { setPage } = useUIStore();

  return (
    <div className="settings-screen">
      <div className="sub-page-header">
        <div className="sub-header-left">
          <button className="sub-back-btn" onClick={() => setPage('profile')} aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <h1 className="sub-page-title">Settings</h1>
        </div>
        <div style={{ width: 36 }} />
      </div>

      <div className="settings-content-scroll">
        <div>
          <div className="settings-section-title">Privacy & Legal</div>
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
        </div>

        <div>
          <div className="settings-section-title">App Info</div>
          <div className="settings-app-info">
            <div className="settings-version">Version 1.0.0</div>
            <div className="settings-love">Made with ❤️ by Loka Espresso</div>
          </div>
        </div>
      </div>
    </div>
  );
}
