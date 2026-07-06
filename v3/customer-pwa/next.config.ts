import type { NextConfig } from "next";

const API_PROXY = process.env.API_PROXY_URL || (
  process.env.NODE_ENV === "development" ? "http://127.0.0.1:13800/api" : ""
);
if (!API_PROXY) {
  throw new Error("API_PROXY_URL must be set to a valid HTTP(S) URL in production");
}

const nextConfig: NextConfig = {
  // output: 'standalone', // disabled for 'next start' compatibility
  images: {
    unoptimized: true,
  },
  turbopack: {},
  async rewrites() {
    return {
      beforeFiles: [
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
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https: https://ip-api.com" +
            (process.env.NODE_ENV === "development" ? " http://localhost:13800 http://127.0.0.1:13800" : "") + "; frame-src 'self' https://js.stripe.com https://hooks.stripe.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self';",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
