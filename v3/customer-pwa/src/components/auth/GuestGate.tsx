'use client';

import { ReactNode } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { LogIn } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

interface GuestGateProps {
  children: ReactNode;
  message?: string;
  fallback?: ReactNode;
}

export function GuestGate({ children, message, fallback }: GuestGateProps) {
  const { t } = useTranslation();
  const isGuest = useUIStore((s) => s.isGuest);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (isAuthenticated) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="w-14 h-14 rounded-full bg-primary-50 flex items-center justify-center mb-4">
        <LogIn size={24} className="text-primary" strokeWidth={1.5} />
      </div>
      <h3 className="text-lg font-bold text-text-primary mb-1">{t('auth.signInToAccess')}</h3>
      <p className="text-sm text-text-secondary mb-6 max-w-xs">
        {message || t('auth.signInToAccessDescription')}
      </p>
      <button
        className="btn btn-primary h-11 px-6 rounded-xl text-sm font-semibold"
          onClick={() => useUIStore.getState().triggerSignIn()}
      >
        {t('auth.signIn')}
      </button>
    </div>
  );
}
