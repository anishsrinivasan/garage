import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@preowned-cars/db", "@preowned-cars/shared"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
