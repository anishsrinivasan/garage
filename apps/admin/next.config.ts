import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@classifieds/db",
    "@classifieds/shared",
    "@classifieds/scraper",
  ],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  // playwright is only reached by the Instagram onboarding action; bundling it
  // into the server build fails on its optional native deps.
  serverExternalPackages: ["postgres", "playwright"],
};

export default nextConfig;
