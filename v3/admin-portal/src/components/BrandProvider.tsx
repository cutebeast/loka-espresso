"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { STORAGE_KEYS, BRANDING } from "@/lib/constants";
import { api } from "@/lib/api";

interface BrandConfig {
  brandName: string;
  faviconUrl: string;
}

const BrandContext = createContext<BrandConfig>({
  brandName: BRANDING.DEFAULT_BRAND_NAME,
  faviconUrl: "",
});

export function useBrand() {
  return useContext(BrandContext);
}

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [brandName, setBrandName] = useState(BRANDING.DEFAULT_BRAND_NAME);
  const [faviconUrl, setFaviconUrl] = useState("");
  const loadedRef = useRef(false);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEYS.TOKEN) : "";
    if (!token) return;
    if (loadedRef.current) return;

    api.getRaw<any>("/admin/config?prefix=branding")
      .then((items) => {
        if (!Array.isArray(items)) return;
        const nameItem = items.find((i: { config_key: string }) => i.config_key === "branding.brand_name");
        const favItem = items.find((i: { config_key: string }) => i.config_key === "branding.admin_favicon_url");
        if (nameItem?.config_value) setBrandName(nameItem.config_value);
        if (favItem?.config_value) setFaviconUrl(favItem.config_value);
        loadedRef.current = true;
      })
      .catch((e) => {
        console.error('branding config:', e);
      });
  }, [pathname]);

  return (
    <BrandContext.Provider value={{ brandName, faviconUrl }}>
      {children}
    </BrandContext.Provider>
  );
}
