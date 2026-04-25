'use client';

import { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { Category } from '@/lib/api';
import { getCategoryIcon } from '@/lib/categoryIcons';

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
    <div ref={navRef} className="category-nav">
      <div className="scroll-x category-nav-scroll">
        {allCats.map((cat) => {
          const isActive = activeId === cat.id;
          return (
            <motion.button
              key={cat.id ?? 'all'}
              whileTap={{ scale: 0.95 }}
              onClick={() => scrollToCategory(cat.id)}
              className={`category-nav-btn ${isActive ? 'active' : ''}`}
            >
              <span className="category-nav-icon">{cat.icon}</span>
              <span className="category-nav-label">{cat.name}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
