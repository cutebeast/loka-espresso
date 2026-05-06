'use client';

import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

import TypePill from './TypePill';
import { resolveAssetUrl, LOKA } from '@/lib/tokens';
import { useTranslation } from '@/hooks/useTranslation';

interface HeroBannerProps {
  imageUrl?: string | null;
  tag?: { text: string; variant?: 'offer' | 'survey' | 'limited' | 'system' };
  onBack?: () => void;
  aspectRatio?: number;
}

export default function HeroBanner({ imageUrl, tag, onBack, aspectRatio = 16 / 9 }: HeroBannerProps) {
  const { t } = useTranslation();
  return (
    <div className="hb-slide" style={{ aspectRatio: String(aspectRatio) }}>
      <div
        className="hb-bg"
        style={imageUrl
          ? { backgroundImage: `url(${resolveAssetUrl(imageUrl)})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : { background: `linear-gradient(135deg, ${LOKA.cream} 0%, rgba(209,142,56,0.3) 100%)` }
        }
      />
      <div className="hb-overlay" />
      {onBack && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onBack}
          className="hb-back-btn"
          aria-label={t('common.back')}
        >
          <ArrowLeft size={22} color={LOKA.primary} />
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
