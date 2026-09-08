/**
 * OLX Chennai.
 *
 * Three things were wrong here and each on its own was fatal, which is why this
 * adapter had never returned a single listing:
 *
 *  1. The location id was 4058528. That is Kadiri, in Andhra Pradesh — every
 *     page came back titled "Used Cars in Kadiri". Chennai is 4059162.
 *  2. The search URL was built as `/cars_c84?filter=city_eq_<slug>`. OLX puts
 *     the location in the path: `/chennai_g4059162/cars_c84`.
 *  3. The browser launched headless, and OLX sits behind Akamai Bot Manager,
 *     which kills the HTTP/2 stream for a headless client before any response.
 *     curl and headless Chromium both fail; headful Chromium gets HTTP 200.
 *
 * The third means this cannot run on a machine without a display. In the cron
 * container it needs xvfb — see apps/cron/Dockerfile.
 */

export const OLX_LOCATION = {
  city: "Chennai",
  /** Verified against the live site: the title reads "… in Chennai". */
  slug: "chennai_g4059162",
} as const;

const SHARED = {
  name: "olx",
  baseUrl: "https://www.olx.in",
  maxPages: 5,
  rateLimit: { requestsPerMinute: 6 },
  pageLoadTimeoutMs: 45000,
  navigationTimeoutMs: 20000,
} as const;

export const OLX_CONFIG = {
  ...SHARED,
  city: OLX_LOCATION.city,
  categoryPath: "cars_c84",
  /** Kept for the search URL builder; the location lives in the path. */
  locationSlug: OLX_LOCATION.slug,
} as const;

export const OLX_RENTALS_CONFIG = {
  ...SHARED,
  name: "olx-rentals",
  city: OLX_LOCATION.city,
  categoryPath: "for-rent-houses-apartments_c1723",
  locationSlug: OLX_LOCATION.slug,
} as const;

/** `https://www.olx.in/chennai_g4059162/cars_c84?page=2` */
export function olxSearchUrl(
  config: { baseUrl: string; locationSlug: string; categoryPath: string },
  page = 1,
): string {
  const base = `${config.baseUrl}/${config.locationSlug}/${config.categoryPath}`;
  return page > 1 ? `${base}?page=${page}` : base;
}

/**
 * Launch options that get past the bot check. Headful is not optional: with
 * `headless: true` every request dies with ERR_HTTP2_PROTOCOL_ERROR.
 */
export function olxLaunchOptions(): { headless: boolean; args: string[] } {
  return {
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  };
}
