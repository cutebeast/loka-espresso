import type { NextConfig } from "next";

const domains = [
  process.env.NEXT_PUBLIC_ADMIN_DOMAIN,
  process.env.NEXT_PUBLIC_APP_DOMAIN,
  process.env.NEXT_PUBLIC_STAFF_DOMAIN,
  ...(process.env.NEXT_PUBLIC_IMAGE_DOMAINS?.split(",").map((d) => d.trim()).filter(Boolean) || []),
].filter(Boolean) as string[];

function getBackendUrl(): string {
  const direct = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (direct && direct.startsWith("http")) return direct;
  if (process.env.NODE_ENV === "development") return "http://127.0.0.1:13800/api";
  throw new Error(
    "API_URL or NEXT_PUBLIC_API_URL must be set to a valid HTTP(S) URL in production"
  );
}

const backendUrl = getBackendUrl();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      ...domains.map((hostname) => ({ protocol: "https" as const, hostname })),
      ...(process.env.NODE_ENV === "development"
        ? [{ protocol: "http" as const, hostname: "localhost" }]
        : []),
    ],
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
