"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { BRANDING } from "@/lib/constants";

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
    if (typeof window === "undefined") return;
    if (loadedRef.current) return;

    fetch("/api/admin/config?prefix=branding", { credentials: "include" })
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((json) => {
        const items = json && typeof json === "object" && "data" in json ? json.data : json;
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
