'use client';

import { Crown } from 'lucide-react';

interface TierBadgeProps {
  tier?: string | null;
}

export function TierBadge({ tier }: TierBadgeProps) {
  const label = (tier || 'Bronze').toUpperCase();
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-copper-10 text-copper text-[10px] font-bold tracking-wider border border-copper-25">
      <Crown size={10} strokeWidth={2.5} />
      {label}
    </span>
  );
}
