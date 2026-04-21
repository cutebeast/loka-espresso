'use client';

import { motion } from 'framer-motion';
import { ChevronRight, LucideIcon } from 'lucide-react';

const LOKA = {
  primary: '#384B16',
  white: '#FFFFFF',
  copperLight: '#E5A559',
} as const;

interface PrimaryActionButtonProps {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  trailingIcon?: LucideIcon;
}

export default function PrimaryActionButton({ children, onPress, disabled, loading, trailingIcon: TrailingIcon }: PrimaryActionButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: disabled || loading ? 1 : 0.97 }}
      onClick={disabled || loading ? undefined : onPress}
      disabled={disabled || loading}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: '100%',
        padding: '16px 24px',
        borderRadius: 999,
        background: disabled ? '#9CA3AF' : LOKA.primary,
        color: LOKA.white,
        fontSize: 15,
        fontWeight: 700,
        border: 'none',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        boxShadow: disabled ? 'none' : '0 8px 16px rgba(56,75,22,0.25)',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {loading ? (
        <div
          style={{
            width: 20,
            height: 20,
            border: '2px solid rgba(255,255,255,0.3)',
            borderTopColor: LOKA.white,
            borderRadius: 999,
            animation: 'spin 0.8s linear infinite',
          }}
        />
      ) : (
        <>
          <span style={{ flex: 1, textAlign: 'center' }}>{children}</span>
          {TrailingIcon ? <TrailingIcon size={18} /> : <ChevronRight size={18} />}
        </>
      )}
    </motion.button>
  );
}