import type { NextConfig } from "next";

/**
 * Hosts the image optimiser is allowed to fetch from.
 *
 * This was `hostname: "**"`, which turns `/_next/image` into an open proxy:
 * anyone can pass `?url=<any image on the internet>` and have this deployment
 * fetch, optimise and serve it, billed to us. Verified before the change — a
 * request for an unrelated third-party image came back 200 with an optimised
 * JPEG.
 *
 * The R2 host is read from the environment so that pointing the bucket at a
 * custom domain stays a config change rather than a code change.
 */
function imageHosts(): string[] {
  // Marketplace listings hot-link their own CDNs; only Instagram media is
  // copied into R2, because those URLs are signed and expire within days.
  const hosts = ["media.cars24.com", "images10.gaadi.com"];

  const base = process.env.R2_PUBLIC_BASE_URL;
  if (base) {
    try {
      hosts.push(new URL(base).hostname);
    } catch {
      console.warn(`[next.config] R2_PUBLIC_BASE_URL is not a URL: ${base}`);
    }
  } else {
    console.warn(
      "[next.config] R2_PUBLIC_BASE_URL unset — listing images will not render",
    );
  }
  return hosts;
}

const nextConfig: NextConfig = {
  transpilePackages: ["@classifieds/db", "@classifieds/shared"],
  images: {
    remotePatterns: imageHosts().map((hostname) => ({
      protocol: "https" as const,
      hostname,
    })),
  },
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
