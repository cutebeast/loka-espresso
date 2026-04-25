'use client';

import { motion } from 'framer-motion';
import { Gift, Tag, Calendar, Clock } from 'lucide-react';
import { resolveAssetUrl } from '@/lib/tokens';
import TypePill from './TypePill';

const LOKA = {
  primary: '#384B16',
  copper: '#D18E38',
  cream: '#F3EEE5',
  brown: '#57280D',
  textPrimary: '#1B2023',
  textSecondary: '#3A4A5A',
  textMuted: '#6A7A8A',
  borderSubtle: '#E4EAEF',
  white: '#FFFFFF',
} as const;

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
      style={{
        display: 'flex',
        width: '100%',
        background: LOKA.white,
        border: `1px solid ${LOKA.borderSubtle}`,
        borderRadius: 24,
        overflow: 'hidden',
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
        textAlign: 'left',
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <div
        onError={handleImageError}
        style={{
          width: 100,
          height: 100,
          flexShrink: 0,
          background: imageUrl
            ? `url(${resolveAssetUrl(imageUrl)}) center/cover`
            : `linear-gradient(135deg, ${LOKA.cream} 0%, ${LOKA.copper}30 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {!imageUrl && <Gift size={28} color={LOKA.brown} strokeWidth={1.5} />}
      </div>
      <div style={{ flex: 1, padding: '14px 16px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
              {tag && <TypePill variant={tag.variant}>{tag.text}</TypePill>}
              {date && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: LOKA.textMuted }}>
                  <Calendar size={10} /> {date}
                </span>
              )}
              {daysLeft && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: LOKA.copper, fontWeight: 600 }}>
                  <Clock size={10} /> {daysLeft}
                </span>
              )}
            </div>
            <p
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: LOKA.textPrimary,
                letterSpacing: '-0.01em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {title}
            </p>
            {subtitle && (
              <p
                style={{
                  fontSize: 12,
                  color: LOKA.textSecondary,
                  marginTop: 2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {subtitle}
              </p>
            )}
            {meta && (
              <p style={{ fontSize: 12, color: LOKA.textMuted, marginTop: 4 }}>{meta}</p>
            )}
            {pointsCost != null && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  marginTop: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  color: LOKA.copper,
                }}
              >
                <Tag size={11} /> {pointsCost} pts
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.button>
  );
}