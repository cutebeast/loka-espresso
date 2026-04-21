'use client';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { PageId } from './merchant-types';

interface AdminContextType {
  token: string;
  setToken: (t: string) => void;
  refreshToken: string;
  setRefreshToken: (t: string) => void;
  currentUserRole: string;
  setCurrentUserRole: (r: string) => void;
  currentUserType: number;
  setCurrentUserType: (t: number) => void;

  page: PageId;
  setPage: (p: PageId) => void;

  selectedStore: string;
  setSelectedStore: (s: string) => void;
  stores: any[];
  setStores: (s: any[]) => void;

  dateRange: { from: string; to: string };
  setDateRange: (d: { from: string; to: string }) => void;

  loading: boolean;
  setLoading: (l: boolean) => void;

  logout: () => void;
}

const AdminContext = createContext<AdminContextType | null>(null);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [currentUserRole, setCurrentUserRole] = useState('Admin');
  const [currentUserType, setCurrentUserType] = useState<number>(1);
  const [page, setPage] = useState<PageId>('dashboard');
  const [selectedStore, setSelectedStore] = useState<string>('all');
  const [stores, setStores] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [loading, setLoading] = useState(false);

  const logout = useCallback(() => {
    setToken('');
    setRefreshToken('');
    localStorage.removeItem('fnb_token');
    localStorage.removeItem('fnb_refresh_token');
    localStorage.removeItem('fnb_role');
    localStorage.removeItem('fnb_user_type');
  }, []);

  useEffect(() => {
    const savedToken = localStorage.getItem('fnb_token') || '';
    const savedRefreshToken = localStorage.getItem('fnb_refresh_token') || '';
    const savedRole = localStorage.getItem('fnb_role') || 'Admin';
    const savedUserType = parseInt(localStorage.getItem('fnb_user_type') || '1');

    if (savedToken) {
      setToken(savedToken);
      setRefreshToken(savedRefreshToken);
      setCurrentUserRole(savedRole);
      setCurrentUserType(savedUserType);
    }
  }, []);

  return (
    <AdminContext.Provider value={{
      token, setToken,
      refreshToken, setRefreshToken,
      currentUserRole, setCurrentUserRole,
      currentUserType, setCurrentUserType,
      page, setPage,
      selectedStore, setSelectedStore,
      stores, setStores,
      dateRange, setDateRange,
      loading, setLoading,
      logout,
    }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider');
  return ctx;
}
