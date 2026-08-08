import type { NextConfig } from "next";

const API_PROXY = process.env.API_PROXY_URL || "http://127.0.0.1:13800/api";
const UPLOADS_PROXY = process.env.UPLOADS_PROXY_URL || "http://127.0.0.1:13800";

const nextConfig: NextConfig = {
  // output: 'standalone', // disabled for 'next start' compatibility
  // BUILD_DIST_DIR lets scripts/rebuild-portal.sh build to a fresh directory
  // and swap it in atomically — building in place wipes .next under the
  // running server (the cause of past 502/crash-loop incidents).
  distDir: process.env.BUILD_DIST_DIR || ".next",
  images: {
    unoptimized: true,
  },

  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/uploads/:path*",
        destination: `${UPLOADS_PROXY}/uploads/:path*`,
      },
      {
        source: "/api/:path*",
          destination: `${API_PROXY}/:path*`,
        },
      ],
    };
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          ...(process.env.NODE_ENV === "production"
            ? [{
                key: "Strict-Transport-Security",
                value: "max-age=31536000; includeSubDomains",
              }]
            : []),
          {
            key: "Content-Security-Policy",
            value:               "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://api.stripe.com https://r.stripe.com https://m.stripe.network https://q.stripe.com https://errors.stripe.com" +
            (process.env.NODE_ENV === "development" ? " http://localhost:13800 http://127.0.0.1:13800" : "") + "; frame-src 'self' https://js.stripe.com https://hooks.stripe.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://*.stripe.com;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
