'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { motion } from 'framer-motion';

const LOKA = {
  primary: '#384B16',
  white: '#FFFFFF',
  copperSoft: 'rgba(209,142,56,0.12)',
} as const;

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
      style={{
        border: `1px dashed ${LOKA.primary}`,
        borderRadius: 16,
        background: '#E6F2E8',
        padding: '20px 24px',
        textAlign: 'center',
      }}
    >
      <p
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: LOKA.primary,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 12,
        }}
      >
        Your code
      </p>
      <p
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          fontSize: 28,
          fontWeight: 800,
          color: LOKA.primary,
          letterSpacing: '4px',
          marginBottom: 16,
        }}
      >
        {code}
      </p>
      <button
        onClick={handleCopy}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '10px 20px',
          borderRadius: 999,
          background: LOKA.white,
          border: `1px solid ${LOKA.primary}`,
          color: LOKA.primary,
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
        {copied ? 'Copied!' : 'Copy code'}
      </button>
      <p style={{ fontSize: 11, color: LOKA.primary, marginTop: 12, opacity: 0.7 }}>
        Show this code to the barista
      </p>
    </motion.div>
  );
}