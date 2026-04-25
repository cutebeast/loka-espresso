'use client';

type PillVariant = 'offer' | 'survey' | 'limited' | 'system';

const variantClass: Record<PillVariant, string> = {
  offer: 'tp-offer',
  survey: 'tp-survey',
  limited: 'tp-limited',
  system: 'tp-system',
};

interface TypePillProps {
  variant?: PillVariant;
  children: React.ReactNode;
}

export default function TypePill({ variant = 'system', children }: TypePillProps) {
  return (
    <span className={`tp-pill ${variantClass[variant]}`}>
      {children}
    </span>
  );
}
