'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from '@/hooks/useTranslation';

interface VoucherRevealBlockProps {
  code: string;
  onCopy?: (code: string) => void;
}

export default function VoucherRevealBlock({ code, onCopy }: VoucherRevealBlockProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      onCopy?.(code);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="vrb-card"
    >
      <p className="vrb-label">
        {t('common.yourCode')}
      </p>
      <p className="vrb-code">
        {code}
      </p>
      <button
        onClick={handleCopy}
        className="vrb-copy-btn"
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
        {copied ? t('common.copied') : t('common.copy')}
      </button>
      <p className="vrb-hint">
        {t('voucher.showToBarista')}
      </p>
    </motion.div>
  );
}
