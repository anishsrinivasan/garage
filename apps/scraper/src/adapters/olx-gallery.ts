/**
 * The rest of a listing's photographs, from its own page.
 *
 * A result card carries exactly one image, so a scrape that reads only the
 * results grid stores one photo per listing however many the seller uploaded —
 * which is what OLX listings looked like here: a single thumbnail against
 * Instagram listings with six or eight.
 *
 * The item page is only reachable through the same headful browser as
 * everything else; Akamai resets a plain fetch outright rather than answering
 * 403. So this costs one navigation per listing.
 *
 * Reading the DOM is the wrong way to get the gallery, which is how the first
 * attempt put a red hatchback, a motorbike and a refrigerator in the gallery of
 * a flat in Kilpauk:
 *
 *   - the gallery is a carousel that mounts one slide at a time, so at most one
 *     of the listing's photos is ever an <img> in the document; and
 *   - the page also carries a rail of the seller's *other* listings, whose
 *     thumbnails are <img> elements and outnumber the real photo ten to one.
 *
 * The page embeds the listing's own image list as JSON instead, which is exact,
 * complete and in the seller's order. The rail's thumbnails come from a
 * different CDN namespace (`-PANAMERA`) than listing photos (`-IN`), which is a
 * useful sanity check but not what this keys on — the JSON array is scoped to
 * this listing, so nothing else can leak into it.
 */
import type { Page } from "playwright";
import { fullSizeOlxImage } from "./olx-cards";

/** Beyond this a listing is padding. */
const MAX_IMAGES = 12;

/**
 * Pulls the ids out of the page's own `"images":[...]` array.
 *
 * Bracket-matched rather than regexed as a whole, because the array is embedded
 * in a script with `/`-escaped URLs and no reliable terminator; walking to
 * the matching `]` is the only way to know where the listing's images stop and
 * the rest of the payload begins.
 */
function galleryIdsFrom(html: string): string[] {
  const key = '"images":[';
  const start = html.indexOf(key);
  if (start === -1) return [];

  let depth = 0;
  let end = -1;
  for (let i = start + key.length - 1; i < html.length; i++) {
    const c = html[i];
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return [];

  const slice = html.slice(start, end);
  const ids = [...slice.matchAll(/"external_id":"([A-Za-z0-9]+-[A-Z]+)"/g)].map((m) => m[1]!);
  return [...new Set(ids)];
}

/** Collects the listing's own photographs from its item page. */
export async function extractOlxGallery(page: Page, itemUrl: string): Promise<string[]> {
  try {
    await page.goto(itemUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const html = await page.content();

    return galleryIdsFrom(html)
      .slice(0, MAX_IMAGES)
      .map((id) => fullSizeOlxImage(`https://apollo.olx.in/v1/files/${id}/image`));
  } catch (err) {
    // One unreachable listing must not take the run down; the card image we
    // already have is a worse listing, not a broken one.
    console.warn(`[olx] gallery failed for ${itemUrl}: ${(err as Error).message}`);
    return [];
  }
}
