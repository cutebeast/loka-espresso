export const STORAGE_KEYS = {
  TOKEN: "token",
  REFRESH_TOKEN: "refreshToken",
  ADMIN_EMAIL: "adminEmail",
  AUTH_COOKIE: "admin_auth",
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
  staff: process.env.NEXT_PUBLIC_STAFF_VERSION_URL || "https://staff.loyaltysystem.uk/version.json",
  customer: process.env.NEXT_PUBLIC_CUSTOMER_VERSION_URL || "https://app.loyaltysystem.uk/version.json",
} as const;
