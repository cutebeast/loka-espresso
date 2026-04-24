'use client';

import { useState, useRef, useEffect, ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CarouselProps {
  children: ReactNode[];
  autoPlay?: boolean;
  interval?: number;
  showDots?: boolean;
  showArrows?: boolean;
  className?: string;
}

export function Carousel({
  children,
  autoPlay = false,
  interval = 4000,
  showDots = true,
  showArrows = false,
  className = '',
}: CarouselProps) {
  const [current, setCurrent] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const total = children.length;

  const goTo = (i: number) => {
    setCurrent(((i % total) + total) % total);
  };

  const next = () => goTo(current + 1);
  const prev = () => goTo(current - 1);

  useEffect(() => {
    if (autoPlay && total > 1) {
      timerRef.current = setInterval(next, interval);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
  }, [autoPlay, interval, current, total]);

  if (total === 0) return null;

  return (
    <div className={`relative overflow-hidden rounded-2xl ${className}`}>
      <div className="flex transition-transform duration-300 ease-out" style={{ transform: `translateX(-${current * 100}%)` }}>
        {children.map((child, i) => (
          <div key={i} className="w-full shrink-0">
            {child}
          </div>
        ))}
      </div>

      {showArrows && total > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow-sm active:scale-90 transition-transform"
          >
            <ChevronLeft size={18} className="text-text-primary" />
          </button>
          <button
            onClick={next}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow-sm active:scale-90 transition-transform"
          >
            <ChevronRight size={18} className="text-text-primary" />
          </button>
        </>
      )}

      {showDots && total > 1 && (
        <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-1.5">
          {children.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === current ? 'w-4 bg-white' : 'w-1.5 bg-white/50'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
