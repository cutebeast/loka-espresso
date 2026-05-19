"use client";

import { useState, useEffect } from "react";

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
    return () => window.removeEventListener("storage", check);
  }, []);

  return isAdmin;
}
