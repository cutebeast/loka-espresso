"use client";

import { createContext, useContext, useEffect, useState } from "react";

interface BrandConfig {
  brandName: string;
  faviconUrl: string;
}

const BrandContext = createContext<BrandConfig>({
  brandName: "LOKA Espresso",
  faviconUrl: "",
});

export function useBrand() {
  return useContext(BrandContext);
}

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const [brandName, setBrandName] = useState("LOKA Espresso");
  const [faviconUrl, setFaviconUrl] = useState("");

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : "";
    if (!token) return;

    fetch("/api/v1/admin/config?prefix=branding", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        const items = d.data || [];
        const nameItem = items.find((i: { config_key: string }) => i.config_key === "branding.brand_name");
        const favItem = items.find((i: { config_key: string }) => i.config_key === "branding.admin_favicon_url");
        if (nameItem?.config_value) setBrandName(nameItem.config_value);
        if (favItem?.config_value) setFaviconUrl(favItem.config_value);
      })
      .catch(() => {
        // fallback already set
      });
  }, []);

  return (
    <BrandContext.Provider value={{ brandName, faviconUrl }}>
      {children}
    </BrandContext.Provider>
  );
}
