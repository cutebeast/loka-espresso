import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "admin.loyaltysystem.uk" },
      { protocol: "https", hostname: "app.loyaltysystem.uk" },
      { protocol: "https", hostname: "staff.loyaltysystem.uk" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
};

export default nextConfig;
