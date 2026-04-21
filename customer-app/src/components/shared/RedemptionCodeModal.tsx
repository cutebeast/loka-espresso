'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import VoucherRevealBlock from './VoucherRevealBlock';

const LOKA = {
  primary: '#384B16',
  borderSubtle: '#E4EAEF',
  textPrimary: '#1B2023',
  white: '#FFFFFF',
} as const;

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
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            background: 'rgba(15,19,23,0.6)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 380,
              background: LOKA.white,
              borderRadius: 28,
              padding: 24,
              position: 'relative',
            }}
          >
            <button
              onClick={onClose}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                width: 32,
                height: 32,
                borderRadius: 999,
                background: LOKA.borderSubtle,
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              aria-label="Close"
            >
              <X size={16} color={LOKA.textPrimary} />
            </button>
            <h3
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: LOKA.textPrimary,
                marginBottom: 20,
                paddingRight: 32,
              }}
            >
              {title}
            </h3>
            <VoucherRevealBlock code={code} onCopy={onCopy} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}