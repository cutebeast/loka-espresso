'use client';

import { motion } from 'framer-motion';
import { Plus, Coffee } from 'lucide-react';
import type { MenuItem } from '@/lib/api';
import { cacheBust } from '@/lib/api';
import { formatPrice, LOKA } from '@/lib/tokens';

interface ItemCardProps {
  item: MenuItem;
  onPress: () => void;
  onAdd: () => void;
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
      className="flex items-center gap-3 px-3.5 py-2.5 bg-white rounded-2xl border border-border-subtle cursor-pointer text-left w-full h-16 relative"
      style={{ opacity: item.is_available ? 1 : 0.5 }}
    >
      {/* Thumbnail */}
      <div
        className="w-14 h-14 shrink-0 rounded-[14px] overflow-hidden flex items-center justify-center relative"
        style={{
          background: imgSrc
            ? '#EFEAE0'
            : `linear-gradient(135deg, #F2F6EA 0%, ${LOKA.cream} 100%)`,
        }}
      >
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={item.name}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <Coffee size={22} color={LOKA.brown} strokeWidth={1.5} />
        )}
        {item.is_featured && (
          <>
            <div
              className="absolute top-0 right-0"
              style={{
                width: 0, height: 0,
                borderStyle: 'solid',
                borderWidth: '0 22px 22px 0',
                borderColor: `transparent ${LOKA.copper} transparent transparent`,
              }}
            />
            <div className="absolute top-[3px] right-[3px] w-[5px] h-[5px] rounded-full bg-white" />
          </>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-bold text-text-primary truncate leading-tight">
            {item.name}
          </span>
        </div>
        {item.description && (
          <div className="text-[11px] text-text-muted truncate mt-0.5 leading-tight">
            {item.description}
          </div>
        )}
        <div className="text-[13px] font-extrabold text-primary mt-1">
          {formatPrice(item.base_price)}
        </div>
      </div>

      {/* Sold out badge */}
      {!item.is_available && (
        <div className="absolute top-1.5 right-11.5 px-1.5 py-0.5 rounded-full bg-black/60 text-white text-[9px] font-bold">
          Sold out
        </div>
      )}

      {/* Add button */}
      {item.is_available && (
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={(e) => { e.stopPropagation(); onAdd(); }}
          className="w-8 h-8 shrink-0 rounded-full bg-primary border-none cursor-pointer flex items-center justify-center"
        >
          <Plus size={15} color={LOKA.white} strokeWidth={2.5} />
        </motion.button>
      )}
    </motion.button>
  );
}
