'use client';

import { QrCode } from 'lucide-react';
import { motion } from 'framer-motion';

interface ScanFABProps {
  onClick: () => void;
  label?: string;
}

export function ScanFAB({ onClick, label = 'Scan table' }: ScanFABProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      className="fixed bottom-24 right-4 z-40 flex items-center gap-2 px-4 py-3 rounded-2xl bg-primary text-white shadow-lg shadow-primary/25 cursor-pointer"
      style={{ boxShadow: '0 8px 24px rgba(56,75,22,0.35)' }}
      aria-label={label}
    >
      <QrCode size={18} strokeWidth={2.2} />
      <span className="text-sm font-semibold">{label}</span>
    </motion.button>
  );
}
