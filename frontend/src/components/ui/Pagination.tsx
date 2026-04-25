'use client';

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
    <div className="p-0">
      <button
        className={`p-btn ${!canPrev ? 'p-btn-disabled' : 'p-btn-enabled'}`}
        disabled={!canPrev}
        onClick={() => onPageChange(page - 1)}
      >
        <i className="fas fa-chevron-left"></i> Previous
      </button>

      <div className="p-1">
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
              className={`p-page-btn ${isActive ? 'p-page-btn-active' : 'p-page-btn-normal'}`}
            >
              {pageNum}
            </button>
          );
        })}
      </div>

      <button
        className={`p-btn ${!canNext ? 'p-btn-disabled' : 'p-btn-enabled'}`}
        disabled={!canNext}
        onClick={() => onPageChange(page + 1)}
      >
        Next <i className="fas fa-chevron-right"></i>
      </button>
    </div>
  );
}
