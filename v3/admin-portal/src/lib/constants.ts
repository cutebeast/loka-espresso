export const STORAGE_KEYS = {
  ADMIN_EMAIL: "adminEmail",
} as const;

export const ROUTES = {
  LOGIN: "/login",
  HOME: "/",
} as const;

export const API = {
  DEFAULT_TIMEOUT_MS: 30000,
};

export const BRANDING = {
  DEFAULT_BRAND_NAME: "LOKA Espresso",
} as const;

export const VERSION_URLS = {
  staff: process.env.NEXT_PUBLIC_STAFF_VERSION_URL || "",
  customer: process.env.NEXT_PUBLIC_CUSTOMER_VERSION_URL || "",
} as const;
