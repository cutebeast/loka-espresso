"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

export function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const check = () => {
      const raw = localStorage.getItem("isAdmin");
      setIsAdmin(raw === "true");
    };
    check();
    window.addEventListener("storage", check);

    let aborted = false;
    api.get<{ is_admin?: boolean; roles?: string[] }>("/staff/auth/me")
      .then((d) => {
        if (aborted) return;
        const admin = !!(d?.is_admin || d?.roles?.includes("admin"));
        setIsAdmin(admin);
        if (localStorage.getItem("isAdmin") !== String(admin)) {
          localStorage.setItem("isAdmin", String(admin));
        }
      })
      .catch(() => {
        if (aborted) return;
        setIsAdmin(false);
      });

    return () => {
      aborted = true;
      window.removeEventListener("storage", check);
    };
  }, []);

  return isAdmin;
}
