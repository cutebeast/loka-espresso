'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Gift, Tag, Calendar, Clock } from 'lucide-react';
import { resolveAssetUrl, LOKA } from '@/lib/tokens';
import TypePill from './TypePill';

interface ListCardProps {
  title: string;
  subtitle?: string;
  imageUrl?: string | null;
  tag?: { text: string; variant?: 'offer' | 'survey' | 'limited' | 'system' };
  date?: string | null;
  daysLeft?: string | null;
  meta?: string;
  pointsCost?: number;
  onPress?: () => void;
  disabled?: boolean;
}

export default function ListCard({
  title,
  subtitle,
  imageUrl,
  tag,
  date,
  daysLeft,
  meta,
  pointsCost,
  onPress,
  disabled,
}: ListCardProps) {
  const [imageError, setImageError] = useState(false);

  return (
    <motion.button
      whileTap={{ scale: disabled ? 1 : 0.98, opacity: disabled ? 0.7 : 1 }}
      onClick={disabled ? undefined : onPress}
      disabled={disabled}
      className={`lc-card ${disabled ? 'lc-card-disabled' : ''}`}
    >
      <div
        className="lc-thumb"
        style={{
          background: imageUrl && !imageError
            ? undefined
            : `linear-gradient(135deg, ${LOKA.cream} 0%, ${LOKA.copper}30 100%)`,
        }}
      >
        {imageUrl && !imageError ? (
          <img
            src={resolveAssetUrl(imageUrl) ?? undefined}
            alt={title}
            onError={() => setImageError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <Gift size={28} color={LOKA.brown} strokeWidth={1.5} />
        )}
      </div>
      <div className="lc-body">
        <div className="lc-row">
          <div className="lc-col">
            <div className="lc-meta-row">
              {tag && <TypePill variant={tag.variant}>{tag.text}</TypePill>}
              {date && (
                <span className="lc-date">
                  <Calendar size={10} /> {date}
                </span>
              )}
              {daysLeft && (
                <span className="lc-days">
                  <Clock size={10} /> {daysLeft}
                </span>
              )}
            </div>
            <p className="lc-title">
              {title}
            </p>
            {subtitle && (
              <p className="lc-subtitle">
                {subtitle}
              </p>
            )}
            {meta && (
              <p className="lc-meta-text">{meta}</p>
            )}
            {pointsCost != null && (
              <span className="lc-points">
                <Tag size={11} /> {pointsCost} pts
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.button>
  );
}
