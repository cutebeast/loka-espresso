'use client';

import { useEffect } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface SplashScreenProps {
  onFinish: () => void;
}

export function SplashScreen({ onFinish }: SplashScreenProps) {
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const timer = setTimeout(onFinish, reducedMotion ? 800 : 3000);
    return () => clearTimeout(timer);
  }, [onFinish, reducedMotion]);

  return (
    <div className="splash-page-v2">
      <div className="splash-page-inner-v2">
        {/* Turkish Coffee Cup with Smoke */}
        <div className={`splash-logo-v2 ${reducedMotion ? '' : 'animate-fade-scale'}`}>
          <svg width="80" height="100" viewBox="0 0 80 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Smoke wisps */}
            {!reducedMotion && (
              <>
                <path
                  className="smoke-wisp smoke-wisp-1"
                  d="M32 18c0-4 2-8 4-10s2-6 0-8"
                  stroke="#D18E38"
                  strokeWidth="2"
                  strokeLinecap="round"
                  fill="none"
                  opacity="0.6"
                />
                <path
                  className="smoke-wisp smoke-wisp-2"
                  d="M40 16c0-5 3-9 2-13s-1-7 2-9"
                  stroke="#D18E38"
                  strokeWidth="2"
                  strokeLinecap="round"
                  fill="none"
                  opacity="0.5"
                />
                <path
                  className="smoke-wisp smoke-wisp-3"
                  d="M48 18c0-3 1-7 3-9s3-5 1-7"
                  stroke="#D18E38"
                  strokeWidth="2"
                  strokeLinecap="round"
                  fill="none"
                  opacity="0.4"
                />
              </>
            )}
            {/* Cup body */}
            <path
              d="M20 32c0-2 2-4 4-4h32c2 0 4 2 4 4v4c0 14-8 26-20 26S20 50 20 36v-4z"
              fill="#57280D"
            />
            {/* Cup rim */}
            <ellipse cx="40" cy="32" rx="20" ry="4" fill="#7A4A2E" />
            {/* Coffee surface */}
            <ellipse cx="40" cy="33" rx="16" ry="3" fill="#3D2517" />
            {/* Handle */}
            <path
              d="M58 38c6 0 10 4 10 10s-4 10-10 10"
              stroke="#57280D"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
            />
            {/* Saucer */}
            <ellipse cx="40" cy="64" rx="24" ry="6" fill="#D4C4B0" />
            <ellipse cx="40" cy="63" rx="16" ry="4" fill="#C4B4A0" />
          </svg>
        </div>

        <div className={`splash-title-v2 ${reducedMotion ? '' : 'animate-fade-up-1'}`}>
          LOKA
        </div>
        <div className={`splash-tagline-v2 ${reducedMotion ? '' : 'animate-fade-up-2'}`}>
          Espresso · since 2026
        </div>

        <div className={`splash-progress-wrap ${reducedMotion ? '' : 'animate-fade-up-3'}`}>
          <div className={`splash-progress-track ${reducedMotion ? '' : 'animate-fill-progress'}`} />
        </div>
      </div>
    </div>
  );
}
