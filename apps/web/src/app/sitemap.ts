import type { MetadataRoute } from "next";
import { getGarages } from "@/app/lib/garages";
import { getSitemapListings } from "@/app/lib/queries";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Regenerated hourly rather than baked at build time.
 *
 * As a fully static route this was generated once on the build machine, so a
 * build that couldn't reach the database shipped a sitemap containing only the
 * three static URLs — permanently, and silently, because both lookups swallow
 * their errors. Revalidating means the catalogue's own URLs appear as soon as
 * the next regeneration succeeds, and the warnings below make a failure
 * visible in the logs instead of invisible in the output.
 */
// Generated per request like everything else. It was `revalidate = 3600` to
// avoid re-querying, but an ISR entry on Workers is filled behind the response
// using the request's own database connection, which the runtime forbids.
export const dynamic = "force-dynamic";

/**
 * The sitemap previously listed only `/`, `/garages` and the garage pages —
 * every one of the 500 listing detail pages, which are the actual indexable
 * content, was missing.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const base: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/rent`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
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
  } catch (err) {
    console.warn(
      `[sitemap] could not list garages: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  try {
    const listings = await getSitemapListings();
    for (const listing of listings) {
      base.push({
        // Rentals live under /rent; cars under /listings.
        url: `${SITE_URL}/${listing.vertical === "rentals" ? "rent" : "listings"}/${listing.id}`,
        lastModified: listing.updatedAt,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
  } catch (err) {
    // Degrade to what we already have rather than failing the whole sitemap,
    // but say so — an empty listings section is otherwise indistinguishable
    // from an empty catalogue.
    console.warn(
      `[sitemap] could not list listings: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return base;
}
