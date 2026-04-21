'use client';

const LOKA = {
  copper: '#D18E38',
  textPrimary: '#1B2023',
  textMuted: '#6A7A8A',
} as const;

interface TermsListProps {
  terms?: string[] | null;
  title?: string;
}

export default function TermsList({ terms, title = 'Terms & conditions' }: TermsListProps) {
  if (!terms || terms.length === 0) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <h4
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: LOKA.textPrimary,
          marginBottom: 12,
          paddingBottom: 8,
          borderBottom: '1px solid rgba(0,0,0,0.06)',
        }}
      >
        {title}
      </h4>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {terms.map((term, i) => (
          <li
            key={i}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '8px 0',
              borderBottom: i < terms.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none',
              fontSize: 13,
              color: LOKA.textMuted,
              lineHeight: 1.5,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 4,
                height: 4,
                borderRadius: 999,
                background: LOKA.copper,
                marginTop: 6,
                flexShrink: 0,
              }}
            />
            {term}
          </li>
        ))}
      </ul>
    </div>
  );
}