import type { NextConfig } from "next";

const API_PROXY = process.env.API_PROXY_URL || "http://127.0.0.1:13800/api";

const nextConfig: NextConfig = {
  // BUILD_DIST_DIR lets scripts/rebuild-portal.sh build to a fresh directory
  // and swap it in atomically — building in place wipes .next under the
  // running server (the cause of past 502/crash-loop incidents).
  distDir: process.env.BUILD_DIST_DIR || ".next",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_PROXY}/:path*`,
      },
    ];
  },
};

export default nextConfig;
