'use client';

import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

import TypePill from './TypePill';
import { resolveAssetUrl } from '@/lib/tokens';

const LOKA = {
  primary: '#384B16',
  white: '#FFFFFF',
} as const;

interface HeroBannerProps {
  imageUrl?: string | null;
  tag?: { text: string; variant?: 'offer' | 'survey' | 'limited' | 'system' };
  onBack?: () => void;
  aspectRatio?: number;
}

export default function HeroBanner({ imageUrl, tag, onBack, aspectRatio = 16 / 9 }: HeroBannerProps) {
  const bgStyle = imageUrl
    ? {
        backgroundImage: `url(${resolveAssetUrl(imageUrl)})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : {
        background: 'linear-gradient(135deg, #F3EEE5 0%, rgba(209,142,56,0.3) 100%)',
      };

  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: String(aspectRatio), overflow: 'hidden' }}>
      <div style={{ ...bgStyle, position: 'absolute', inset: 0 }} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(0deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0) 50%)',
        }}
      />
      {onBack && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onBack}
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            width: 44,
            height: 44,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(4px)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          }}
          aria-label="Go back"
        >
          <ArrowLeft size={22} color={LOKA.primary} />
        </motion.button>
      )}
      {tag && (
        <div style={{ position: 'absolute', bottom: 16, left: 16 }}>
          <TypePill variant={tag.variant}>{tag.text}</TypePill>
        </div>
      )}
    </div>
  );
}