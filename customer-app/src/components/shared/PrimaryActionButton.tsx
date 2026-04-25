'use client';

import { motion } from 'framer-motion';
import { ChevronRight, LucideIcon } from 'lucide-react';

interface PrimaryActionButtonProps {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  trailingIcon?: LucideIcon;
  showTrailingIcon?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}

export default function PrimaryActionButton({
  children,
  onPress,
  disabled,
  loading,
  trailingIcon: TrailingIcon,
  showTrailingIcon = true,
  type = 'button',
  className = '',
}: PrimaryActionButtonProps) {
  return (
    <motion.button
      type={type}
      whileTap={{ scale: disabled || loading ? 1 : 0.97 }}
      onClick={disabled || loading ? undefined : onPress}
      disabled={disabled || loading}
      className={[
        'w-full bg-primary hover:bg-primary-dark disabled:bg-primary-30 text-white font-semibold',
        'py-3.5 px-6 rounded-xl text-base tracking-wide transition-colors',
        'flex items-center justify-center gap-2',
        className,
      ].join(' ')}
    >
      {loading ? (
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      ) : (
        <>
          <span>{children}</span>
          {showTrailingIcon && (TrailingIcon ? <TrailingIcon size={18} /> : <ChevronRight size={18} />)}
        </>
      )}
    </motion.button>
  );
}
