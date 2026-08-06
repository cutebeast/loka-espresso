'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import api from '@/lib/api';
import { getLocale } from '@/stores/localeStore';
import { resolveAssetUrl } from '@/lib/tokens';
import { useTranslation } from '@/hooks/useTranslation';

interface HomeBannerData {
  title?: string;
  subtitle?: string;
  image_url?: string;
  cta_text?: string;
  cta_url?: string;
  duration_ms?: number;
  dismissible?: boolean;
  active_from?: string;
  active_until?: string;
}

/** Post-login home banner — admin-managed via splash_screens
 * (screen_name = 'home_banner'), served by GET /api/home-banner.
 * Renders nothing when there is no active banner (200 with data: null)
 * or when the fetch fails. Hash CTA links (e.g. #menu) stay in-app via
 * the PWA's hash router; external links open in a new tab. */
export default function HomeBanner() {
  const { t } = useTranslation();
  const [banner, setBanner] = useState<HomeBannerData | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    api
      .get('/home-banner', { params: { locale: getLocale() }, signal: ac.signal })
      .then((res) => {
        const body = res?.data;
        const d = (
          body && typeof body === 'object' && 'data' in body ? body.data : body
        ) as HomeBannerData | null;
        if (d && (d.image_url || d.title)) setBanner(d);
      })
      .catch(() => {
        /* no active banner or offline — render nothing */
      });
    return () => ac.abort();
  }, []);

  if (!banner || dismissed) return null;

  const imageUrl = resolveAssetUrl(banner.image_url);
  const dismissible = banner.dismissible !== false;
  const hasCta = !!(banner.cta_text && banner.cta_url);
  const isHashLink = !!banner.cta_url?.startsWith('#');

  return (
    <div className="home-banner-card">
      {dismissible && (
        <button
          type="button"
          className="home-welcome-dismiss"
          onClick={() => setDismissed(true)}
          aria-label={t('common.close')}
        >
          <X size={14} />
        </button>
      )}
      {imageUrl && (
        <img
          src={imageUrl}
          alt={banner.title || ''}
          className="home-banner-img"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      )}
      {(banner.title || banner.subtitle) && (
        <div className="home-banner-overlay">
          {banner.title && <div className="home-banner-title">{banner.title}</div>}
          {banner.subtitle && <div className="home-banner-sub">{banner.subtitle}</div>}
        </div>
      )}
      {hasCta && (
        <a
          className="home-banner-cta"
          href={banner.cta_url}
          {...(!isHashLink ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {banner.cta_text}
        </a>
      )}
    </div>
  );
}
