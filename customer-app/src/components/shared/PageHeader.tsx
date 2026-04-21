'use client';

import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

const LOKA = {
  primary: '#384B16',
  borderSubtle: '#E4EAEF',
  textPrimary: '#1B2023',
} as const;

interface PageHeaderProps {
  title: string;
  onBack?: () => void;
}

export default function PageHeader({ title, onBack }: PageHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '16px 20px',
        borderBottom: `1px solid ${LOKA.borderSubtle}`,
        background: '#FFFFFF',
        gap: 12,
      }}
    >
      {onBack && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onBack}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: LOKA.borderSubtle,
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
          aria-label="Go back"
        >
          <ArrowLeft size={20} color={LOKA.primary} />
        </motion.button>
      )}
      <h1
        style={{
          flex: 1,
          fontSize: 18,
          fontWeight: 800,
          color: LOKA.textPrimary,
          letterSpacing: '-0.01em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {title}
      </h1>
    </div>
  );
}