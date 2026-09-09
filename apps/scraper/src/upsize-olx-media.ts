/**
 * Rewrites stored OLX image URLs to ask the CDN for a full-size image.
 *
 * Result cards hand out `;s=150x0;q=50` — a 1.6 KB thumbnail for a 150px slot —
 * and every OLX listing scraped before this stored that verbatim, so the cards
 * and the preview dialog were upscaling a blur. The transform is ours to
 * choose and the object id does not change, so this is a pure URL rewrite: no
 * re-scrape, no new requests to OLX, nothing downloaded.
 *
 * It cannot recover photographs that were never collected. Listings scraped
 * before the gallery reader still hold one image; a fresh scrape fixes those.
 *
 *   bun run src/upsize-olx-media.ts          # report only
 *   bun run src/upsize-olx-media.ts --apply  # write
 */
import { eq } from "drizzle-orm";
import { db, listings } from "@classifieds/db";
import { fullSizeOlxImage } from "./adapters/olx-cards";

/** The media column's own element type, so a rewrite type-checks as a write. */
type MediaItem = NonNullable<typeof listings.$inferSelect.media>[number];

const APPLY = process.argv.includes("--apply");

async function main() {
  const rows = await db
    .select({
      id: listings.id,
      media: listings.media,
      heroMediaUrl: listings.heroMediaUrl,
    })
    .from(listings);

  let scanned = 0;
  let changed = 0;
  let urlsRewritten = 0;

  for (const row of rows) {
    const media: MediaItem[] = row.media ?? [];
    const touchesOlx =
      media.some((m) => typeof m.url === "string" && m.url.includes("apollo.olx.in")) ||
      (row.heroMediaUrl?.includes("apollo.olx.in") ?? false);
    if (!touchesOlx) continue;
    scanned += 1;

    const nextMedia: MediaItem[] = media.map((item) => {
      if (typeof item.url !== "string" || !item.url.includes("apollo.olx.in")) return item;
      const url = fullSizeOlxImage(item.url);
      if (url !== item.url) urlsRewritten += 1;
      return { ...item, url };
    });
    const nextHero = row.heroMediaUrl?.includes("apollo.olx.in")
      ? fullSizeOlxImage(row.heroMediaUrl)
      : row.heroMediaUrl;

    const mediaChanged = JSON.stringify(nextMedia) !== JSON.stringify(media);
    const heroChanged = nextHero !== row.heroMediaUrl;
    if (!mediaChanged && !heroChanged) continue;
    changed += 1;

    if (APPLY) {
      await db
        .update(listings)
        .set({ media: nextMedia, heroMediaUrl: nextHero })
        .where(eq(listings.id, row.id));
    }
  }

  console.log(
    `${scanned} OLX listing(s) scanned, ${changed} would change ` +
      `(${urlsRewritten} URL(s) rewritten)`,
  );
  console.log(APPLY ? "Applied." : "Dry run — pass --apply to write.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
