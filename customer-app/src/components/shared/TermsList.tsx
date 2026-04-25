'use client';

interface TermsListProps {
  terms?: string[] | null;
  title?: string;
}

export default function TermsList({ terms, title = 'Terms & conditions' }: TermsListProps) {
  if (!terms || terms.length === 0) return null;

  return (
    <div className="tl-list">
      <h4 className="tl-title">
        {title}
      </h4>
      <ul className="tl-items">
        {terms.map((term, i) => (
          <li
            key={i}
            className={`tl-item ${i < terms.length - 1 ? 'tl-item-bordered' : ''}`}
          >
            <span className="tl-bullet" />
            {term}
          </li>
        ))}
      </ul>
    </div>
  );
}
