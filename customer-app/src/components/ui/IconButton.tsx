'use client';

import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface IconButtonProps {
  icon: LucideIcon;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'ghost' | 'subtle';
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

export function IconButton({
  icon: Icon,
  onClick,
  variant = 'default',
  size = 'md',
  label,
  className = '',
}: IconButtonProps) {
  const variants = {
    default: 'bg-bg-light text-text-primary hover:bg-border-subtle',
    primary: 'bg-copper-soft text-copper border border-copper-30 hover:bg-copper-mid',
    ghost:   'bg-transparent text-text-primary hover:bg-bg-light',
    subtle:  'bg-surface text-text-primary hover:bg-border-subtle',
  };

  const sizes = {
    sm: 'w-10 h-10 rounded-[10px]',
    md: 'w-10 h-10 rounded-xl',
    lg: 'w-12 h-12 rounded-xl',
  };

  const iconSizes = { sm: 16, md: 18, lg: 20 };

  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex items-center justify-center cursor-pointer ${variants[variant]} ${sizes[size]} ${className}`}
    >
      <Icon size={iconSizes[size]} strokeWidth={variant === 'primary' ? 2.2 : 1.8} />
    </motion.button>
  );
}
