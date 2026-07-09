"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

export function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let aborted = false;
    api.get<{ is_admin?: boolean; roles?: string[] }>("/staff/auth/me")
      .then((d) => {
        if (aborted) return;
        const admin = !!(d?.is_admin || d?.roles?.includes("admin"));
        setIsAdmin(admin);
      })
      .catch(() => {
        if (aborted) return;
        setIsAdmin(false);
      });

    return () => {
      aborted = true;
    };
  }, []);

  return isAdmin;
}
