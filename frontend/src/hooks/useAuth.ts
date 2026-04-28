'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import { API_BASE_URL } from '@/lib/config';

export function useAuth() {
  const [token, setToken] = useState('');
  const [_refreshToken, setRefreshToken] = useState('');
  const [currentUserRole, setCurrentUserRole] = useState('Admin');
  const [currentUserType, setCurrentUserType] = useState<number>(1);
  const [currentUserName, setCurrentUserName] = useState('');
  const [currentUserPhone, setCurrentUserPhone] = useState('');
  const [currentUserEmail, setCurrentUserEmail] = useState('');

  const handleLogout = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Best effort
    }
    setToken('');
    setRefreshToken('');
    if (typeof window !== 'undefined') window.location.hash = 'dashboard';
  }, []);

  const fetchUserRole = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch('/users/me');
      if (res.ok) {
        const user = await res.json();
        setCurrentUserRole(user.role || 'Admin');
        setCurrentUserType(user.user_type_id || 1);
        setCurrentUserName(user.name || '');
        setCurrentUserPhone(user.phone || '');
        setCurrentUserEmail(user.email || '');
      } else if (res.status === 401) {
        handleLogout();
      }
    } catch (err) {
      console.error('Failed to fetch user role:', err);
      handleLogout();
    }
  }, [token, handleLogout]);

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/session`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated) {
            setToken('cookie-auth');
          }
        }
      } catch {
        // Not authenticated
      }
    }
    checkAuth();
  }, []);

  useEffect(() => {
    const onAuthExpired = () => handleLogout();
    window.addEventListener('merchant-auth-expired', onAuthExpired);
    return () => window.removeEventListener('merchant-auth-expired', onAuthExpired);
  }, [handleLogout]);

  return {
    token,
    setToken,
    currentUserRole,
    currentUserType,
    currentUserName,
    currentUserPhone,
    currentUserEmail,
    setCurrentUserName,
    setCurrentUserPhone,
    handleLogout,
    fetchUserRole,
  };
}
