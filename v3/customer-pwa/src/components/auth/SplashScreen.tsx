'use client';

import { useEffect, useState } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTranslation } from '@/hooks/useTranslation';
import api from '@/lib/api';
import { resolveAssetUrl } from '@/lib/tokens';

interface SplashScreenProps {
  onFinish: () => void;
}

interface SplashData {
  image_url: string;
  title?: string;
  subtitle?: string;
  cta_text?: string;
  cta_url?: string;
}

export function SplashScreen({ onFinish }: SplashScreenProps) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const [splashData, setSplashData] = useState<SplashData | null>(null);

  useEffect(() => {
    api.get('/splash')
      .then((res: unknown) => {
        const axiosRes = res as { data?: SplashData };
        const d = axiosRes?.data || (res as SplashData);
        if (d?.image_url) {
          setSplashData({
            image_url: resolveAssetUrl(d.image_url) || d.image_url,
            title: d.title,
            subtitle: d.subtitle,
            cta_text: d.cta_text,
            cta_url: d.cta_url,
          });
        }
      })
      .catch((err) => console.error('[Splash] Content fetch failed:', err));
  }, []);

  useEffect(() => {
    const timer = setTimeout(onFinish, reducedMotion ? 800 : 3000);
    return () => clearTimeout(timer);
  }, [onFinish, reducedMotion]);

  const SvgLogo = () => (
    <div className={`splash-logo-v2 ${reducedMotion ? '' : 'animate-fade-scale'}`}>
      <svg width="80" height="100" viewBox="0 0 80 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        {!reducedMotion && (
          <>
            <path className="smoke-wisp smoke-wisp-1" d="M32 18c0-4 2-8 4-10s2-6 0-8" stroke="#C4893A" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.6" />
            <path className="smoke-wisp smoke-wisp-2" d="M40 16c0-5 3-9 2-13s-1-7 2-9" stroke="#C4893A" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.5" />
            <path className="smoke-wisp smoke-wisp-3" d="M48 18c0-3 1-7 3-9s3-5 1-7" stroke="#C4893A" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.4" />
          </>
        )}
        <path d="M20 32c0-2 2-4 4-4h32c2 0 4 2 4 4v4c0 14-8 26-20 26S20 50 20 36v-4z" fill="#4A2210" />
        <ellipse cx="40" cy="32" rx="20" ry="4" fill="#7A4A2E" />
        <ellipse cx="40" cy="33" rx="16" ry="3" fill="#3D2517" />
        <path d="M58 38c6 0 10 4 10 10s-4 10-10 10" stroke="#4A2210" strokeWidth="4" strokeLinecap="round" fill="none" />
        <ellipse cx="40" cy="64" rx="24" ry="6" fill="#D4C4B0" />
        <ellipse cx="40" cy="63" rx="16" ry="4" fill="#C4B4A0" />
      </svg>
    </div>
  );

  // Admin-managed splash with image
  if (splashData) {
    return (
      <div className="splash-page-v2">
        <div className="splash-page-inner-v2" style={{ gap: 8 }}>
          <div className={`splash-logo-v2 ${reducedMotion ? '' : 'animate-fade-scale'}`} style={{ width: '100%', maxWidth: 280, height: 280 }}>
            <img
              src={splashData.image_url}
              alt={splashData.title || 'Welcome'}
              style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 16 }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
          {splashData.title && (
            <div className={`splash-title-v2 ${reducedMotion ? '' : 'animate-fade-up-1'}`}>
              {splashData.title}
            </div>
          )}
          {splashData.subtitle && (
            <div className={`splash-tagline-v2 ${reducedMotion ? '' : 'animate-fade-up-2'}`}>
              {splashData.subtitle}
            </div>
          )}
          <div className={`splash-progress-wrap ${reducedMotion ? '' : 'animate-fade-up-3'}`}>
            <div className={`splash-progress-track ${reducedMotion ? '' : 'animate-fill-progress'}`} />
          </div>
        </div>
      </div>
    );
  }

  // Fallback: branded SVG logo
  return (
    <div className="splash-page-v2">
      <div className="splash-page-inner-v2">
        <SvgLogo />
        <div className={`splash-title-v2 ${reducedMotion ? '' : 'animate-fade-up-1'}`}>
          {t('auth.splashTitle')}
        </div>
        <div className={`splash-tagline-v2 ${reducedMotion ? '' : 'animate-fade-up-2'}`}>
          {t('auth.splashTagline')}
        </div>
        <div className={`splash-progress-wrap ${reducedMotion ? '' : 'animate-fade-up-3'}`}>
          <div className={`splash-progress-track ${reducedMotion ? '' : 'animate-fill-progress'}`} />
        </div>
      </div>
    </div>
  );
}
