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
  // Never throw in production; fall back to the local backend.
  return "http://127.0.0.1:13800/api";
}

const backendUrl = getBackendUrl();

const nextConfig: NextConfig = {
  // BUILD_DIST_DIR lets scripts/rebuild-portal.sh build to a fresh directory
  // and swap it in atomically — building in place wipes .next under the
  // running server (the cause of past 502/crash-loop incidents).
  distDir: process.env.BUILD_DIST_DIR || ".next",
  images: {
    remotePatterns: [
      ...domains.map((hostname) => ({ protocol: "https" as const, hostname })),
      ...(process.env.NODE_ENV === "development"
        ? [{ protocol: "http" as const, hostname: "localhost" }]
        : []),
    ],
  },
  async rewrites() {
    const uploadsUrl = backendUrl.replace(/\/api\/?$/, "");
    return [
      {
        source: "/uploads/:path*",
        destination: `${uploadsUrl}/uploads/:path*`,
      },
      {
        source: "/api/:path*",
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
  // Legacy route moves (2026-07-25): events section unified under /events
  async redirects() {
    return [
      { source: "/menu/experiences", destination: "/events/workshops", permanent: true },
      { source: "/content/events", destination: "/events", permanent: true },
      { source: "/content/events/new", destination: "/events/new", permanent: true },
      { source: "/content/events/report", destination: "/events/report", permanent: true },
      { source: "/content/events/:id", destination: "/events/:id", permanent: true },
    ];
  },
};

export default nextConfig;
