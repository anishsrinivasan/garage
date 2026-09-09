/**
 * The rest of a listing's photographs, from its own page.
 *
 * A result card carries exactly one image, so a scrape that reads only the
 * results grid stores one photo per listing however many the seller uploaded —
 * which is what OLX listings looked like here: a single blurred thumbnail
 * against Instagram listings with six or eight.
 *
 * The gallery is only on the item page, and the item page is only reachable
 * through the same headful browser as everything else — Akamai refuses a plain
 * fetch outright (the connection is reset, not 403'd). So this costs one
 * navigation per listing. That is the price of having photographs.
 */
import type { Page } from "playwright";
import { fullSizeOlxImage } from "./olx-cards";

/** Beyond this a listing is padding; the detail page shows a handful anyway. */
const MAX_IMAGES = 10;

/**
 * Collects every listing photograph on an item page.
 *
 * Keyed on the CDN path rather than on any class name: OLX's markup is
 * build-hashed and has already been redesigned once under this scraper, but
 * every listing photo is served from `apollo.olx.in/v1/files/`. Badges and
 * seller avatars live under an `alias-` path and are excluded, the same rule
 * the card reader uses.
 *
 * Distinct images are identified by object id, not by URL, because the same
 * photo appears at several transforms on one page — a thumbnail in the strip
 * and a larger one in the viewer — and comparing URLs would store both.
 */
export async function extractOlxGallery(page: Page, itemUrl: string): Promise<string[]> {
  try {
    await page.goto(itemUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1500);

    const raw = await page.evaluate(() => {
      const urls = new Set<string>();
      for (const img of Array.from(document.querySelectorAll("img"))) {
        const candidates = [
          img.getAttribute("src"),
          img.getAttribute("data-src"),
          img.getAttribute("srcset")?.split(",").pop()?.trim().split(" ")[0],
        ];
        for (const candidate of candidates) {
          if (candidate?.includes("/v1/files/") && !candidate.includes("alias-")) {
            urls.add(candidate);
          }
        }
      }
      return Array.from(urls);
    });

    const byObject = new Map<string, string>();
    for (const url of raw) {
      const id = url.match(/\/v1\/files\/([^/;?]+)/)?.[1];
      if (id && !byObject.has(id)) byObject.set(id, fullSizeOlxImage(url));
    }
    return Array.from(byObject.values()).slice(0, MAX_IMAGES);
  } catch (err) {
    // One unreachable listing must not take the run down; the card image we
    // already have is a worse listing, not a broken one.
    console.warn(`[olx] gallery failed for ${itemUrl}: ${(err as Error).message}`);
    return [];
  }
}
