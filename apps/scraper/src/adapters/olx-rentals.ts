/**
 * OLX Chennai rentals.
 *
 * Separate from the cars adapter because the two share a site and nothing else:
 * a car card carries "2024 - 24,000 km" and a rental "2 BHK - 2 Bathroom -
 * 800 sqft", and the fields they map onto have no overlap. What they do share —
 * finding the cards, and getting past the bot check — lives in olx-config and
 * the shared card reader.
 *
 * Unlike the Instagram rentals path this does not call a model. OLX presents
 * bedrooms, area and rent as discrete fields; running an extraction over a
 * caption we do not have would invent detail rather than read it. Deposit,
 * furnishing and the rest stay null when OLX does not say, which is the honest
 * answer and lets the review queue surface them.
 */

import { chromium, type Browser } from "playwright";
import type {
  ScraperAdapter,
  ScraperConfig,
  ScrapeResult,
  ScrapeError,
  NormalizedListing,
} from "@classifieds/shared";
import type { RentalAttrs } from "@classifieds/verticals";
import { rentalsVertical } from "@classifieds/verticals";
import {
  OLX_RENTALS_CONFIG,
  olxLaunchOptions,
  olxSearchUrl,
} from "./olx-config";
import { extractOlxCards, type OlxListingCard } from "./olx-cards";
import { extractOlxGallery } from "./olx-gallery";

/** "2 BHK - 2 Bathroom - 800 sqft" */
function parseRentalMeta(meta: string): {
  bhk: number | null;
  carpetAreaSqft: number | null;
} {
  const bhk = meta.match(/(\d+)\s*BHK/i);
  const area = meta.match(/([\d,]+)\s*(?:sq\.?\s*ft|sqft)/i);
  return {
    bhk: bhk ? Number(bhk[1]) : null,
    carpetAreaSqft: area ? Number(area[1]!.replace(/,/g, "")) : null,
  };
}

/** "₹ 16,000" */
function parseRent(price: string): number | null {
  const digits = price.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "TRIPLICANE, CHENNAI" -> "Triplicane" */
function parseLocality(location: string): string | null {
  const head = location.split(",")[0]?.trim();
  if (!head || /^chennai$/i.test(head)) return null;
  return head
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Cover photo first, then the gallery, deduplicated by CDN object id. */
function galleryFor(card: OlxListingCard, photos: string[]): string[] {
  const objectId = (url: string) => url.match(/\/v1\/files\/([^/;?]+)/)?.[1] ?? url;
  const ordered = card.imageUrl ? [card.imageUrl, ...photos] : photos;
  const seen = new Set<string>();
  return ordered.filter((url) => {
    const id = objectId(url);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function toListing(card: OlxListingCard, photos: string[] = []): NormalizedListing | null {
  const rent = parseRent(card.price);
  const { bhk, carpetAreaSqft } = parseRentalMeta(card.meta);
  const locality = parseLocality(card.location);

  // Without a rent there is nothing to rank or filter on, and OLX always shows
  // one — a card missing it is a malformed read, not a listing worth keeping.
  if (!rent) return null;

  const attrs: RentalAttrs = rentalsVertical.normalize({
    bhk,
    propertyType: null,
    carpetAreaSqft,
    floor: null,
    totalFloors: null,
    rent,
    deposit: null,
    maintenance: null,
    maintenanceIncluded: null,
    furnishing: null,
    tenantPreference: null,
    parking: null,
    availableFrom: null,
    amenities: [],
  } as RentalAttrs) as RentalAttrs;

  const locationText = locality ?? OLX_RENTALS_CONFIG.city;

  return {
    vertical: "rentals",
    attrs,
    price: rent,
    pricePeriod: "month",
    locationText,
    location: locationText,
    city: OLX_RENTALS_CONFIG.city,

    // The core row keeps make/model/year for the shared upsert path; for a
    // rental they are a label, not vehicle data. Same convention as Instagram.
    make: rentalsVertical.title(
      { city: OLX_RENTALS_CONFIG.city, locationText } as never,
      attrs,
    ),
    model: locationText,
    year: new Date().getFullYear(),

    sourcePlatform: "olx-rentals",
    sourceUrl: card.url,
    sourceListingId: card.url.match(/iid-(\d+)/)?.[1],
    sellerType: "owner",

    // The card image first — it is the one the seller chose as the cover —
    // then the rest of the gallery, minus that same photo arriving again.
    media: galleryFor(card, photos).map((url) => ({
      url,
      type: "image" as const,
      mimeType: "image/jpeg",
      posterUrl: null,
      source: "marketplace" as const,
      width: null,
      height: null,
      score: null,
      scoreReason: null,
    })),
    description: card.title || undefined,
  } as NormalizedListing;
}

export function createOlxRentalsAdapter(): ScraperAdapter {
  const config: ScraperConfig = {
    name: OLX_RENTALS_CONFIG.name,
    baseUrl: OLX_RENTALS_CONFIG.baseUrl,
    city: OLX_RENTALS_CONFIG.city,
    maxPages: OLX_RENTALS_CONFIG.maxPages,
    rateLimit: OLX_RENTALS_CONFIG.rateLimit,
  };

  return {
    name: "olx-rentals",
    config,

    async scrape(): Promise<ScrapeResult> {
      const startTime = Date.now();
      const listings: NormalizedListing[] = [];
      const errors: ScrapeError[] = [];
      let pagesScraped = 0;
      let browser: Browser | null = null;

      try {
        browser = await chromium.launch(olxLaunchOptions());
        const context = await browser.newContext({
          userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          viewport: { width: 1366, height: 768 },
          locale: "en-IN",
          timezoneId: "Asia/Kolkata",
        });
        const page = await context.newPage();
        page.setDefaultTimeout(OLX_RENTALS_CONFIG.pageLoadTimeoutMs);

        for (let n = 1; n <= OLX_RENTALS_CONFIG.maxPages; n++) {
          const url = olxSearchUrl(OLX_RENTALS_CONFIG, n);
          console.log(`[olx-rentals] page ${n}: ${url}`);
          try {
            await page.goto(url, { waitUntil: "domcontentloaded" });
            await page.waitForTimeout(4000);

            // OLX only loads a card's photo once it scrolls into view, so
            // reading the page straight after navigation gave 15 images for 74
            // listings. Walking to the bottom and back lets every card render
            // its own image before anything is extracted.
            await page.evaluate(async () => {
              const step = window.innerHeight;
              for (let y = 0; y < document.body.scrollHeight; y += step) {
                window.scrollTo(0, y);
                await new Promise((r) => setTimeout(r, 400));
              }
              window.scrollTo(0, 0);
            });
            await page.waitForTimeout(2500);
            pagesScraped += 1;
            const cards = await extractOlxCards(page);
            if (cards.length === 0) break;

            // Each gallery costs a navigation, so this walks the cards after
            // the grid has been read rather than during — the grid is already
            // in memory and the next loop turn navigates to page n+1 anyway.
            let withGallery = 0;
            for (const card of cards) {
              const photos = await extractOlxGallery(page, card.url);
              if (photos.length > 1) withGallery += 1;
              const listing = toListing(card, photos);
              if (listing) listings.push(listing);
            }
            console.log(
              `[olx-rentals] page ${n}: ${cards.length} card(s), ` +
                `${withGallery} with a full gallery, ${listings.length} kept so far`,
            );
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[olx-rentals] page ${n} failed: ${message}`);
            errors.push({ url, message, retryable: true });
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ url: OLX_RENTALS_CONFIG.baseUrl, message, retryable: true });
      } finally {
        await browser?.close();
      }

      return {
        listings,
        errors,
        metadata: {
          pagesScraped,
          totalFound: listings.length,
          durationMs: Date.now() - startTime,
        },
      };
    },

    /** Loads one page: the useful question is whether the bot wall let us in. */
    async healthCheck(): Promise<boolean> {
      let browser: Browser | null = null;
      try {
        browser = await chromium.launch(olxLaunchOptions());
        const page = await browser.newPage();
        const res = await page.goto(olxSearchUrl(OLX_RENTALS_CONFIG), {
          waitUntil: "domcontentloaded",
          timeout: OLX_RENTALS_CONFIG.pageLoadTimeoutMs,
        });
        return res?.status() === 200;
      } catch {
        return false;
      } finally {
        await browser?.close();
      }
    },
  };
}
