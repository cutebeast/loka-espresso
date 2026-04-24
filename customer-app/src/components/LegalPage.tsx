'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import api from '@/lib/api';

interface LegalContent {
  id: number;
  title: string;
  long_description: string | null;
  content_type: string;
}

interface LegalPageProps {
  legalKey?: 'terms' | 'privacy';
}

export default function LegalPage({ legalKey }: LegalPageProps) {
  const { setPage, pageParams } = useUIStore();
  const key = legalKey || (pageParams.legalKey as 'terms' | 'privacy') || 'terms';
  const backTo = (pageParams.backTo as 'profile' | 'settings') || 'profile';
  const [content, setContent] = useState<LegalContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadContent = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<LegalContent>(`/content/legal/${key}`);
      setContent(res.data);
    } catch {
      setError(`Unable to load ${key === 'terms' ? 'Terms of Service' : 'Privacy Policy'} right now.`);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  const title = content?.title || (key === 'terms' ? 'Terms of Service' : 'Privacy Policy');

  return (
    <div className="legal-screen">
      <div className="legal-header">
        <button className="legal-back-btn" onClick={() => setPage(backTo)} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <h1 className="legal-page-title">{title}</h1>
      </div>

      <div className="legal-content">
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="skeleton" style={{ height: '16px', width: '66%', borderRadius: '4px' }} />
            <div className="skeleton" style={{ height: '16px', width: '100%', borderRadius: '4px' }} />
            <div className="skeleton" style={{ height: '16px', width: '100%', borderRadius: '4px' }} />
            <div className="skeleton" style={{ height: '16px', width: '83%', borderRadius: '4px' }} />
            <div className="skeleton" style={{ height: '16px', width: '100%', borderRadius: '4px' }} />
          </div>
        ) : error ? (
          <div style={{ borderRadius: '16px', border: '1px solid rgba(199,80,80,0.2)', background: '#FFEBEE', padding: '12px 16px', fontSize: '14px', color: '#C75050' }}>
            {error}
          </div>
        ) : (
          <>
            <div className="legal-body">
              {content?.long_description || 'No content available.'}
            </div>
            <p className="legal-last-updated">
              Last updated: 23 April 2026
            </p>
          </>
        )}
      </div>
    </div>
  );
}
