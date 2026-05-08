'use client';

import { ReactNode } from 'react';
import { Loader2, AlertCircle, Inbox } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface StateAction {
  label: string;
  onClick: () => void;
}

interface StateLayoutProps {
  variant: 'empty' | 'loading' | 'error';
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: StateAction;
  children?: ReactNode;
  className?: string;
}

const variantConfig = {
  empty: {
    defaultIcon: Inbox,
    iconColor: 'text-text-muted',
    bgColor: 'bg-bg-light',
  },
  loading: {
    defaultIcon: Loader2,
    iconColor: 'text-primary',
    bgColor: 'bg-primary-50',
  },
  error: {
    defaultIcon: AlertCircle,
    iconColor: 'text-danger',
    bgColor: 'bg-danger-light',
  },
};

export function StateLayout({
  variant,
  icon: CustomIcon,
  title,
  description,
  action,
  children,
  className = '',
}: StateLayoutProps) {
  const config = variantConfig[variant];
  const Icon = CustomIcon || config.defaultIcon;
  const isLoading = variant === 'loading';

  return (
    <div className={`flex flex-col items-center justify-center h-full px-8 py-12 ${className}`}>
      <div className={`w-16 h-16 rounded-2xl ${config.bgColor} flex items-center justify-center mb-5`}>
        <Icon
          size={28}
          className={`${config.iconColor} ${isLoading ? 'animate-spin' : ''}`}
        />
      </div>

      <h3 className="text-lg font-extrabold text-text-primary text-center mb-2">
        {title}
      </h3>

      {description && (
        <p className="text-sm text-text-secondary text-center max-w-[260px] leading-relaxed">
          {description}
        </p>
      )}

      {action && (
        <button
          onClick={action.onClick}
          className="mt-6 px-6 py-3 bg-primary text-white font-semibold text-sm rounded-full hover:bg-primary-dark transition-colors active:scale-[0.97]"
        >
          {action.label}
        </button>
      )}

      {children}
    </div>
  );
}
