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
  // apollo.olx.in was missing when OLX was wired up, so every OLX card
  // rendered blank — the optimiser rejects a host it was not told about.
  const hosts = ["media.cars24.com", "images10.gaadi.com", "apollo.olx.in"];

  const base = process.env.R2_PUBLIC_BASE_URL;
  if (base) {
    try {
      hosts.push(new URL(base).hostname);
      return hosts;
    } catch {
      console.warn(`[next.config] R2_PUBLIC_BASE_URL is not a URL: ${base}`);
    }
  }

  // Fall back to the R2 development domain rather than serving a catalogue with
  // no photographs. This value is read at BUILD time, and the web app never
  // needed it before — the old config allowed every host on the internet — so a
  // deployment that has not had the variable added yet would otherwise lose
  // every listing image the moment this ships. Still far narrower than `**`,
  // and it disappears as soon as the variable is set.
  console.warn(
    "[next.config] R2_PUBLIC_BASE_URL is unset — falling back to *.r2.dev for " +
      "listing images. Set it to the bucket's public base URL; r2.dev is " +
      "rate-limited and Cloudflare documents it as non-production.",
  );
  hosts.push("*.r2.dev");
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
