'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Calendar, Search, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useTranslation } from '@/hooks/useTranslation';
import api from '@/lib/api';

interface LegalSection {
  heading: string;
  body: string;
  items?: string[];
}

interface LegalContent {
  id: number;
  title: string;
  long_description: string | null;
  sections: LegalSection[] | null;
  content_type: string;
  updated_at: string | null;
}

interface LegalPageProps {
  legalKey?: 'terms' | 'privacy';
}

export default function LegalPage({ legalKey }: LegalPageProps) {
  const { t } = useTranslation();
  const { setPage, pageParams } = useUIStore();
  const key = legalKey || (pageParams.legalKey as 'terms' | 'privacy') || 'terms';
  const backTo = (pageParams.backTo as 'profile' | 'settings') || 'profile';
  const [content, setContent] = useState<LegalContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const tocRef = useRef<HTMLDivElement>(null);

  const loadContent = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/content/legal/${key}`);
      setContent(res.data);
      // Auto-expand all sections
      if (res.data?.sections?.length) {
        setExpanded(new Set(res.data.sections.map((_: any, i: number) => i)));
      }
    } catch {
      setError(`Unable to load ${key === 'terms' ? 'Terms of Service' : 'Privacy Policy'} right now.`);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  const toggleSection = (idx: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const scrollToSection = (idx: number) => {
    document.getElementById(`legal-section-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const sections: LegalSection[] = content?.sections?.length
    ? content.sections
    : content?.long_description
      ? [{ heading: content.title, body: content.long_description }]
      : [];

  const filtered = search.trim()
    ? sections.map(s => ({
        ...s,
        _match: s.heading.toLowerCase().includes(search.toLowerCase()) ||
                s.body.toLowerCase().includes(search.toLowerCase()),
      })).filter(s => s._match)
    : sections;

  const title = content?.title || (key === 'terms' ? 'Terms of Service' : 'Privacy Policy');
  const updatedAt = content?.updated_at
    ? new Date(content.updated_at).toLocaleDateString('en-MY', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  const filteredIdx = (i: number) => filtered.indexOf(sections[i]);

  return (
    <div className="legal-screen">
      <div className="legal-header">
        <button className="legal-back-btn" onClick={() => setPage(backTo)} aria-label={t('common.back')}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="legal-page-title">{title}</h1>
      </div>

      <div className="legal-content">
        {loading ? (
          <div className="legal-skeleton-list">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className={`skeleton legal-skeleton-line ${i === 1 ? '' : 'w-2_3'}`} />
            ))}
          </div>
        ) : error ? (
          <div className="legal-error">{error}</div>
        ) : (
          <>
            {/* Updated banner */}
            {updatedAt && (
              <div className="legal-updated-banner">
                <div className="legal-updated-icon">
                  <Calendar size={16} color="#fff" />
                </div>
                <div>
                  <div className="legal-updated-label">{t('common.lastUpdated')}</div>
                  <div className="legal-updated-date">{updatedAt}</div>
                </div>
              </div>
            )}

            {/* Search bar */}
            <div className="legal-search-bar">
              <Search size={16} className="legal-search-icon" />
              <input
                type="text"
                placeholder={`Search in ${title}...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Table of Contents — only show when no search filter active */}
            {!search.trim() && sections.length > 0 && (
              <div className="legal-toc-card" ref={tocRef}>
                <div className="legal-toc-title">{t('legal.tableOfContents')}</div>
                {sections.map((s, i) => (
                  <button key={i} className="legal-toc-item" onClick={() => scrollToSection(i)}>
                    <span className="legal-toc-num">{i + 1}</span>
                    <span className="legal-toc-text">{s.heading}</span>
                    <ChevronRight size={12} className="legal-toc-arrow" />
                  </button>
                ))}
              </div>
            )}

            {/* Collapsible sections */}
            {filtered.map((s: any, i: number) => {
              const actualIdx = sections.indexOf(filtered[i]);
              const isExpanded = expanded.has(actualIdx);
              return (
                <div key={actualIdx} className="legal-section" id={`legal-section-${actualIdx}`}>
                  <button className="legal-section-header" onClick={() => toggleSection(actualIdx)}>
                    <span className="legal-section-num">{actualIdx + 1}</span>
                    <span className="legal-section-title">{s.heading}</span>
                    {isExpanded ? (
                      <ChevronUp size={14} className="legal-section-chevron" />
                    ) : (
                      <ChevronDown size={14} className="legal-section-chevron" />
                    )}
                  </button>
                  {isExpanded && (
                    <div className="legal-section-body">
                      <p>{s.body}</p>
                      {s.items?.length ? (
                        <ul>
                          {s.items.map((item: string, j: number) => (
                            <li key={j}>{item}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="legal-footer">
              Made with care by Loka Espresso
            </div>
          </>
        )}
      </div>
    </div>
  );
}
