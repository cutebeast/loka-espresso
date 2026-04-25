'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { motion } from 'framer-motion';

interface VoucherRevealBlockProps {
  code: string;
  onCopy?: (code: string) => void;
}

export default function VoucherRevealBlock({ code, onCopy }: VoucherRevealBlockProps) {
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
        Your code
      </p>
      <p className="vrb-code">
        {code}
      </p>
      <button
        onClick={handleCopy}
        className="vrb-copy-btn"
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
        {copied ? 'Copied!' : 'Copy code'}
      </button>
      <p className="vrb-hint">
        Show this code to the barista
      </p>
    </motion.div>
  );
}
