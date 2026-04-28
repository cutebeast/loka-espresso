'use client';

interface SkeletonPageProps {
  variant?: 'default' | 'table' | 'cards' | 'form';
}

export default function SkeletonPage({ variant = 'default' }: SkeletonPageProps) {
  if (variant === 'table') {
    return (
      <div className="sk-page">
        <div className="skeleton skeleton-text sk-title" />
        <div className="sk-toolbar">
          <div className="skeleton sk-toolbar-btn" />
          <div className="skeleton sk-toolbar-btn" />
          <div className="skeleton sk-toolbar-btn" />
        </div>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="skeleton sk-table-row" />
        ))}
      </div>
    );
  }

  if (variant === 'cards') {
    return (
      <div className="sk-page">
        <div className="skeleton skeleton-text sk-title" />
        <div className="sk-cards-grid">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="skeleton sk-card" />
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'form') {
    return (
      <div className="sk-page">
        <div className="skeleton skeleton-text sk-title" />
        {[1, 2, 3].map(i => (
          <div key={i} className="sk-form-field">
            <div className="skeleton skeleton-text sk-form-label" />
            <div className="skeleton sk-form-input" />
          </div>
        ))}
        <div className="skeleton sk-form-submit" />
      </div>
    );
  }

  return (
    <div className="sk-page">
      <div className="skeleton skeleton-text sk-title" />
      <div className="sk-default-grid">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="skeleton skeleton-card" />
        ))}
      </div>
      {[1, 2, 3].map(i => (
        <div key={i} className="skeleton skeleton-text" style={{ width: `${80 - i * 15}%` }} />
      ))}
    </div>
  );
}
