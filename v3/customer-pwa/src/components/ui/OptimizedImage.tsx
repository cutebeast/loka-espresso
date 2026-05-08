'use client';

import { useState } from 'react';
import React from 'react';
import { resolveAssetUrl } from '@/lib/tokens';

interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  resolve?: boolean;
  fallback?: React.ReactNode;
}

export default function OptimizedImage({ resolve, fallback, onError, src, alt, ...props }: OptimizedImageProps) {
  const [error, setError] = useState(false);
  const resolvedSrc: string | undefined = resolve && typeof src === 'string' ? (resolveAssetUrl(src) ?? undefined) : (typeof src === 'string' ? src : undefined);
  const resolvedAlt = alt || '';

  if (error && fallback) return <>{fallback}</>;

  return (
    <img
      {...props}
      src={resolvedSrc}
      alt={alt || ''}
      loading="lazy"
      decoding="async"
      onError={(e) => { setError(true); onError?.(e); }}
    />
  );
}
