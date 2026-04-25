'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import VoucherRevealBlock from './VoucherRevealBlock';

interface RedemptionCodeModalProps {
  code: string;
  title?: string;
  isOpen: boolean;
  onClose: () => void;
  onCopy?: (code: string) => void;
}

export default function RedemptionCodeModal({
  code,
  title = 'Redemption Code',
  isOpen,
  onClose,
  onCopy,
}: RedemptionCodeModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="rcm-overlay"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="rcm-sheet"
          >
            <button
              onClick={onClose}
              className="rcm-close"
              aria-label="Close"
            >
              <X size={16} color="#1B2023" />
            </button>
            <h3 className="rcm-title">
              {title}
            </h3>
            <VoucherRevealBlock code={code} onCopy={onCopy} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
