'use client';

import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

import TypePill from './TypePill';
import { resolveAssetUrl } from '@/lib/tokens';

interface HeroBannerProps {
  imageUrl?: string | null;
  tag?: { text: string; variant?: 'offer' | 'survey' | 'limited' | 'system' };
  onBack?: () => void;
  aspectRatio?: number;
}

export default function HeroBanner({ imageUrl, tag, onBack, aspectRatio = 16 / 9 }: HeroBannerProps) {
  return (
    <div className="hb-slide" style={{ aspectRatio: String(aspectRatio) }}>
      <div
        className="hb-bg"
        style={imageUrl
          ? { backgroundImage: `url(${resolveAssetUrl(imageUrl)})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : { background: 'linear-gradient(135deg, #F3EEE5 0%, rgba(209,142,56,0.3) 100%)' }
        }
      />
      <div className="hb-overlay" />
      {onBack && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onBack}
          className="hb-back-btn"
          aria-label="Go back"
        >
          <ArrowLeft size={22} color="#384B16" />
        </motion.button>
      )}
      {tag && (
        <div className="hb-tag-wrap">
          <TypePill variant={tag.variant}>{tag.text}</TypePill>
        </div>
      )}
    </div>
  );
}
