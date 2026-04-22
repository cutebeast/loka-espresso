'use client';

import { motion } from 'framer-motion';
import { Plus, Coffee } from 'lucide-react';
import type { MenuItem } from '@/lib/api';
import { cacheBust } from '@/lib/api';

const LOKA = {
  primary: '#384B16',
  copper: '#D18E38',
  copperSoft: 'rgba(209,142,56,0.12)',
  cream: '#F3EEE5',
  brown: '#57280D',
  textPrimary: '#1B2023',
  textSecondary: '#3A4A5A',
  textMuted: '#6A7A8A',
  borderSubtle: '#E4EAEF',
  surface: '#F5F7FA',
  white: '#FFFFFF',
} as const;

interface ItemCardProps {
  item: MenuItem;
  onPress: () => void;
  onAdd: () => void;
}

function formatPrice(val: number | string): string {
  return `RM ${Number(val).toFixed(2)}`;
}

export default function ItemCard({ item, onPress, onAdd }: ItemCardProps) {
  const imgSrc = item.image_url
    ? cacheBust(item.image_url.startsWith('http')
      ? item.image_url
      : `https://admin.loyaltysystem.uk${item.image_url}`)
    : null;

  return (
    <motion.button
      whileTap={{ scale: 0.985 }}
      onClick={onPress}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        background: LOKA.white,
        borderRadius: 16,
        border: `1px solid ${LOKA.borderSubtle}`,
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        height: 64,
        opacity: item.is_available ? 1 : 0.5,
        position: 'relative',
      }}
    >
      <div style={{
        width: 56, height: 56, flexShrink: 0, borderRadius: 14, overflow: 'hidden',
        background: imgSrc ? '#EFEAE0' : `linear-gradient(135deg, #F2F6EA 0%, ${LOKA.cream} 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
      }}>
        {imgSrc ? (
          <img src={imgSrc} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          <Coffee size={22} style={{ color: LOKA.brown }} strokeWidth={1.5} />
        )}
        {item.is_featured && (
          <div style={{ position: 'absolute', top: 0, right: 0, width: 0, height: 0, borderStyle: 'solid', borderWidth: '0 22px 22px 0', borderColor: `transparent ${LOKA.copper} transparent transparent` }} />
        )}
        {item.is_featured && (
          <div style={{ position: 'absolute', top: 3, right: 3, width: 5, height: 5, borderRadius: 999, background: LOKA.white }} />
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: LOKA.textPrimary, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', lineHeight: 1.3 }}>
            {item.name}
          </span>
        </div>
        {item.description && (
          <div style={{ fontSize: 11, color: LOKA.textMuted, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', marginTop: 2, lineHeight: 1.3 }}>
            {item.description}
          </div>
        )}
        <div style={{ fontSize: 13, fontWeight: 800, color: LOKA.primary, marginTop: 4 }}>
          {formatPrice(item.base_price)}
        </div>
      </div>

      {!item.is_available && (
        <div style={{ position: 'absolute', top: 6, right: 46, padding: '2px 6px', borderRadius: 999, background: 'rgba(0,0,0,0.6)', color: '#FFFFFF', fontSize: 9, fontWeight: 700 }}>
          Sold out
        </div>
      )}

      {item.is_available && (
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={(e) => { e.stopPropagation(); onAdd(); }}
          style={{
            width: 32, height: 32, flexShrink: 0, borderRadius: 999,
            background: LOKA.primary, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Plus size={15} color={LOKA.white} strokeWidth={2.5} />
        </motion.button>
      )}
    </motion.button>
  );
}