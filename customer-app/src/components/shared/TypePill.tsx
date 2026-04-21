'use client';

const LOKA = {
  copper: '#D18E38',
  copperSoft: 'rgba(209,142,56,0.12)',
  brown: '#57280D',
  textMuted: '#6A7A8A',
  surface: '#F5F7FA',
} as const;

type PillVariant = 'offer' | 'survey' | 'limited' | 'system';

const variantStyles: Record<PillVariant, { bg: string; color: string }> = {
  offer: { bg: '#e7ddd2', color: '#3a2e26' },
  survey: { bg: '#d4e0d8', color: '#1a4e3a' },
  limited: { bg: String(LOKA.copperSoft), color: LOKA.brown },
  system: { bg: LOKA.surface, color: LOKA.textMuted },
};

interface TypePillProps {
  variant?: PillVariant;
  children: React.ReactNode;
}

export default function TypePill({ variant = 'system', children }: TypePillProps) {
  const style = variantStyles[variant];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        borderRadius: 999,
        background: style.bg,
        color: style.color,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </span>
  );
}