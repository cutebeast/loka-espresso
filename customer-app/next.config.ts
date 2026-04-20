import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: "https://admin.loyaltysystem.uk/api/v1/:path*",
      },
    ];
  },
};

export default nextConfig;
