'use client';

import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface FABProps {
  icon: LucideIcon;
  onClick: () => void;
  label?: string;
  className?: string;
}

export function FAB({ icon: Icon, onClick, label, className = '' }: FABProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      aria-label={label}
      className={`
        fixed bottom-24 right-5 z-40
        w-14 h-14 rounded-full
        bg-primary text-white
        shadow-primary
        flex items-center justify-center
        cursor-pointer
        ${className}
      `}
    >
      <Icon size={24} strokeWidth={2} />
    </motion.button>
  );
}
