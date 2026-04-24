'use client';

import { motion } from 'framer-motion';

interface Tab {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  activeId: string;
  onChange: (id: string) => void;
  variant?: 'pill' | 'underline';
  className?: string;
}

export function Tabs({ tabs, activeId, onChange, variant = 'pill', className = '' }: TabsProps) {
  if (variant === 'underline') {
    return (
      <div className={`flex border-b border-border-subtle ${className}`}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`
                relative flex-1 py-3 text-sm font-semibold text-center transition-colors
                ${isActive ? 'text-primary' : 'text-text-muted hover:text-text-secondary'}
              `}
            >
              {tab.label}
              {isActive && (
                <motion.div
                  layoutId="tab-underline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`flex gap-1 p-1 bg-bg-light rounded-xl ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`
              relative flex-1 py-2 text-xs font-bold text-center rounded-lg transition-colors
              ${isActive ? 'text-primary' : 'text-text-muted hover:text-text-secondary'}
            `}
          >
            {isActive && (
              <motion.div
                layoutId="tab-pill"
                className="absolute inset-0 bg-white rounded-lg shadow-sm"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
              />
            )}
            <span className="relative z-10">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
