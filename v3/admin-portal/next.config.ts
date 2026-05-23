import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "admin.loyaltysystem.uk" },
      { protocol: "https", hostname: "app.loyaltysystem.uk" },
      { protocol: "https", hostname: "staff.loyaltysystem.uk" },
      ...(process.env.NODE_ENV === "development"
        ? [{ protocol: "http" as const, hostname: "localhost" }]
        : []),
    ],
  },
};

export default nextConfig;
