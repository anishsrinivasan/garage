import type { MetadataRoute } from "next";
import { getGarages } from "@/app/lib/garages";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const base: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/garages`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
  ];
  try {
    const garages = await getGarages();
    for (const g of garages) {
      base.push({
        url: `${SITE_URL}/garages/${g.slug}`,
        lastModified: now,
        changeFrequency: "daily",
        priority: 0.6,
      });
    }
  } catch {
    // If DB is unreachable at build time, return the static entries only.
  }
  return base;
}
