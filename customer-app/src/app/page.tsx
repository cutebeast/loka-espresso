'use client';

import AppShell from '@/components/AppShell';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

export default function CustomerApp() {
  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}
