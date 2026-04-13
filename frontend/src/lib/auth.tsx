"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { User } from "./types";
import * as api from "./api";

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (phone: string) => Promise<void>;
  verifyOTP: (phone: string, code: string) => Promise<void>;
  register: (name: string, email: string, phone: string, password: string) => Promise<void>;
  loginPassword: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    try {
      const me = await api.users.getMe();
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("fnb_token") : null;
    if (token) {
      loadUser();
    } else {
      setLoading(false);
    }
  }, [loadUser]);

  const login = useCallback(async (phone: string) => {
    await api.auth.sendOTP(phone);
  }, []);

  const verifyOTP = useCallback(async (phone: string, code: string) => {
    const tokens = await api.auth.verifyOTP(phone, code);
    api.setTokens(tokens);
    await loadUser();
  }, [loadUser]);

  const register = useCallback(async (name: string, email: string, phone: string, password: string) => {
    const tokens = await api.auth.register(name, email, phone, password);
    api.setTokens(tokens);
    await loadUser();
  }, [loadUser]);

  const loginPassword = useCallback(async (email: string, password: string) => {
    const tokens = await api.auth.loginPassword(email, password);
    api.setTokens(tokens);
    await loadUser();
  }, [loadUser]);

  const logout = useCallback(() => {
    api.clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        loading,
        login,
        verifyOTP,
        register,
        loginPassword,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
