'use client';

import React from 'react';
import LoginScreen from '@/components/LoginScreen';

interface AuthGuardProps {
  token: string;
  onLogin: () => void;
  children: React.ReactNode;
}

export default function AuthGuard({ token, onLogin, children }: AuthGuardProps) {
  if (!token) {
    return <LoginScreen onLogin={onLogin} />;
  }
  return <>{children}</>;
}
