import type { NextConfig } from "next";

const API_PROXY = process.env.API_PROXY_URL || "http://127.0.0.1:13800/api";

const nextConfig: NextConfig = {
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
