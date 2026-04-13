'use client';

import { AppProvider } from '../lib/app-context';
import AppShell from '../components/AppShell';

export default function CustomerApp() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
