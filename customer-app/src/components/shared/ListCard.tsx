'use client';

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
  const handleImageError = (e: React.SyntheticEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    target.style.background = `linear-gradient(135deg, ${LOKA.cream} 0%, ${LOKA.copper}30 100%)`;
    target.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="${LOKA.brown}" stroke-width="1.5"><path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg></div>`;
  };

  return (
    <motion.button
      whileTap={{ scale: disabled ? 1 : 0.98, opacity: disabled ? 0.7 : 1 }}
      onClick={disabled ? undefined : onPress}
      disabled={disabled}
      className={`lc-card ${disabled ? 'lc-card-disabled' : ''}`}
    >
      <div
        onError={handleImageError}
        className="lc-thumb"
        style={{
          background: imageUrl
            ? `url(${resolveAssetUrl(imageUrl)}) center/cover`
            : `linear-gradient(135deg, ${LOKA.cream} 0%, ${LOKA.copper}30 100%)`,
        }}
      >
        {!imageUrl && <Gift size={28} color={LOKA.brown} strokeWidth={1.5} />}
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
