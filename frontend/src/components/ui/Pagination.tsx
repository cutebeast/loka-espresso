'use client';

import { THEME } from '@/lib/theme';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
}

/**
 * Shared pagination component with page number buttons.
 * Shows up to 5 page numbers centered around the current page,
 * plus Previous/Next navigation buttons.
 */
export function Pagination({ page, totalPages, onPageChange, loading }: PaginationProps) {
  if (totalPages <= 1) return null;

  const canPrev = page > 1 && !loading;
  const canNext = page < totalPages && !loading;

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 12,
      marginTop: 20,
      padding: '12px',
      background: THEME.bgCard,
      borderRadius: THEME.radius.md,
      border: `1px solid ${THEME.border}`,
    }}>
      <button
        className="btn btn-sm"
        disabled={!canPrev}
        onClick={() => onPageChange(page - 1)}
        style={{
          padding: '8px 16px',
          borderRadius: THEME.radius.md,
          border: `1px solid ${THEME.border}`,
          background: !canPrev ? THEME.bgMuted : THEME.bgCard,
          color: !canPrev ? THEME.textMuted : THEME.textPrimary,
          cursor: !canPrev ? 'not-allowed' : 'pointer',
          opacity: !canPrev ? 0.6 : 1,
        }}
      >
        <i className="fas fa-chevron-left"></i> Previous
      </button>

      <div style={{ display: 'flex', gap: 4 }}>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          let pageNum: number;
          if (totalPages <= 5) {
            pageNum = i + 1;
          } else if (page <= 3) {
            pageNum = i + 1;
          } else if (page >= totalPages - 2) {
            pageNum = totalPages - 4 + i;
          } else {
            pageNum = page - 2 + i;
          }

          const isActive = page === pageNum;
          return (
            <button
              key={pageNum}
              onClick={() => onPageChange(pageNum)}
              style={{
                width: 36,
                height: 36,
                borderRadius: THEME.radius.md,
                border: `1px solid ${isActive ? THEME.primary : THEME.border}`,
                background: isActive ? THEME.primary : THEME.bgCard,
                color: isActive ? THEME.textLight : THEME.textPrimary,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {pageNum}
            </button>
          );
        })}
      </div>

      <button
        className="btn btn-sm"
        disabled={!canNext}
        onClick={() => onPageChange(page + 1)}
        style={{
          padding: '8px 16px',
          borderRadius: THEME.radius.md,
          border: `1px solid ${THEME.border}`,
          background: !canNext ? THEME.bgMuted : THEME.bgCard,
          color: !canNext ? THEME.textMuted : THEME.textPrimary,
          cursor: !canNext ? 'not-allowed' : 'pointer',
          opacity: !canNext ? 0.6 : 1,
        }}
      >
        Next <i className="fas fa-chevron-right"></i>
      </button>
    </div>
  );
}
