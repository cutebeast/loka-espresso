'use client';

import { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { Category } from '@/lib/api';
import { getCategoryIcon } from '@/lib/categoryIcons';

const LOKA = {
  primary: '#384B16',
  primaryLight: '#4A6A1D',
  copper: '#D18E38',
  copperSoft: 'rgba(209,142,56,0.12)',
  cream: '#F3EEE5',
  textPrimary: '#1B2023',
  textMuted: '#6A7A8A',
  borderSubtle: '#E4EAEF',
  surface: '#F5F7FA',
  white: '#FFFFFF',
} as const;

interface CategoryNavProps {
  categories: Category[];
  activeCategoryId: number | null;
  onSelect: (categoryId: number | null) => void;
  sectionRefs: React.MutableRefObject<Map<number, HTMLElement | null>>;
}

export default function CategoryNav({
  categories,
  activeCategoryId,
  onSelect,
  sectionRefs,
}: CategoryNavProps) {
  const navRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<number | null>(activeCategoryId);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    const rafId = requestAnimationFrame(() => {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

          if (visible.length > 0) {
            const id = Number(visible[0].target.getAttribute('data-category-id'));
            setActiveId(id);
            onSelect(id);
          }
        },
        { rootMargin: '-20% 0px -70% 0px', threshold: [0, 0.5, 1] }
      );

      sectionRefs.current.forEach((el) => {
        if (el) observerRef.current?.observe(el);
      });
    });

    return () => {
      cancelAnimationFrame(rafId);
      observerRef.current?.disconnect();
    };
  }, [categories, sectionRefs, onSelect]);

  const scrollToCategory = (categoryId: number | null) => {
    if (categoryId === null) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      const el = sectionRefs.current.get(categoryId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    onSelect(categoryId);
    setActiveId(categoryId);
  };

  const allCats = [
    { id: null, name: 'All', slug: 'all', is_active: true, icon: '📋' },
    ...categories.map((c) => ({ ...c, icon: getCategoryIcon(c.slug).emoji })),
  ];

  return (
    <div ref={navRef} style={{
      position: 'sticky', top: 0, zIndex: 15, background: LOKA.white,
      borderBottom: `1px solid ${LOKA.borderSubtle}`, padding: '4px 0',
    }}>
      <div className="scroll-x" style={{
        display: 'flex', gap: 6, overflowX: 'auto', paddingLeft: 12, paddingRight: 12, paddingBottom: 2,
        WebkitOverflowScrolling: 'touch',
      }}>
        {allCats.map((cat) => {
          const isActive = activeId === cat.id;
          return (
            <motion.button
              key={cat.id ?? 'all'}
              whileTap={{ scale: 0.95 }}
              onClick={() => scrollToCategory(cat.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                gap: 6, padding: '4px 12px', minHeight: 36,
                borderRadius: 999, fontSize: 13, fontWeight: isActive ? 800 : 600,
                cursor: 'pointer', border: 'none', flexShrink: 0,
                background: isActive ? LOKA.primary : LOKA.surface,
                color: isActive ? LOKA.white : LOKA.textPrimary,
                transition: 'background 0.2s ease, color 0.2s ease',
                boxShadow: isActive ? '0 3px 8px -2px rgba(56,75,22,0.3)' : 'none',
              }}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>{cat.icon}</span>
              <span style={{ fontSize: 12, lineHeight: 1, whiteSpace: 'nowrap' }}>{cat.name}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}