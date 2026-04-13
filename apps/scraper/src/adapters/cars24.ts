import * as cheerio from "cheerio";
import type {
  ScraperAdapter,
  ScraperConfig,
  ScrapeResult,
  ScrapeError,
  NormalizedListing,
} from "@preowned-cars/shared";
import { CARS24_CONFIG } from "./cars24-config";

type Cars24ListingUrl = {
  name: string;
  url: string;
  image?: string;
};

type Cars24CarJsonLd = {
  "@type"?: string;
  name?: string;
  brand?: { "@type"?: string; name?: string };
  model?: string;
  vehicleModelDate?: number | string;
  bodyType?: string;
  fuelType?: string;
  vehicleTransmission?: string;
  color?: string;
  numberOfForwardGears?: number;
  offers?: {
    "@type"?: string;
    priceCurrency?: string;
    price?: number | string;
    url?: string;
  };
  mileageFromOdometer?: {
    "@type"?: string;
    value?: number | string;
    unitCode?: string;
  };
  image?: string | string[];
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchWithHeaders(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-IN,en;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Referer: `${CARS24_CONFIG.baseUrl}/buy-used-cars-${CARS24_CONFIG.citySlug}/`,
    },
    signal: AbortSignal.timeout(CARS24_CONFIG.requestTimeoutMs),
  });
}

function extractListingUrlsFromHtml(html: string): Cars24ListingUrl[] {
  const $ = cheerio.load(html);
  const urls: Cars24ListingUrl[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      const graph: any[] = data?.["@graph"] ?? [];
      for (const item of graph) {
        if (item?.["@type"] === "ListItem" && item.url) {
          urls.push({
            name: item.name ?? "",
            url: item.url,
            image: item.image,
          });
        }
      }
    } catch {
      // malformed JSON-LD
    }
  });

  return urls;
}

function parseCarFromJsonLd(
  html: string,
  pageUrl: string
): NormalizedListing | null {
  const $ = cheerio.load(html);
  let car: Cars24CarJsonLd | null = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item?.["@type"] === "Car") {
          car = item;
          return false;
        }
      }
    } catch {
      // malformed JSON-LD
    }
  });

  if (!car) return null;
  const c = car as Cars24CarJsonLd;

  const make = c.brand?.name ?? "";
  const model = c.model ?? "";
  const year =
    typeof c.vehicleModelDate === "string"
      ? parseInt(c.vehicleModelDate, 10)
      : (c.vehicleModelDate ?? 0);
  const price =
    typeof c.offers?.price === "string"
      ? parseFloat(c.offers.price)
      : (c.offers?.price ?? 0);

  if (!make || !model || !year || !price) return null;

  const kmValue = c.mileageFromOdometer?.value;
  const kmDriven =
    typeof kmValue === "string"
      ? parseInt(kmValue, 10)
      : (kmValue ?? undefined);

  const images = Array.isArray(c.image) ? c.image : c.image ? [c.image] : [];

  const nameParts = (c.name ?? "").replace(`${year}`, "").trim();
  const variant =
    nameParts.replace(make, "").replace(model, "").trim() || undefined;

  const idMatch = pageUrl.match(/-(\d{8,})\/?$/);

  return {
    make: make.trim(),
    model: model.trim(),
    variant,
    year,
    price,
    kmDriven: kmDriven && !isNaN(kmDriven) ? kmDriven : undefined,
    fuelType: c.fuelType ?? undefined,
    transmission: c.vehicleTransmission ?? undefined,
    color: c.color ?? undefined,
    bodyType: c.bodyType ?? undefined,
    city: CARS24_CONFIG.city,
    sourcePlatform: "cars24",
    sourceUrl: pageUrl,
    sourceListingId: idMatch?.[1],
    sellerType: "dealer",
    photos: images,
  };
}

export function createCars24Adapter(): ScraperAdapter {
  const config: ScraperConfig = {
    name: CARS24_CONFIG.name,
    baseUrl: CARS24_CONFIG.baseUrl,
    city: CARS24_CONFIG.city,
    maxPages: CARS24_CONFIG.maxPages,
    rateLimit: CARS24_CONFIG.rateLimit,
  };

  return {
    name: "cars24",
    config,

    async scrape(): Promise<ScrapeResult> {
      const startTime = Date.now();
      const allListings: NormalizedListing[] = [];
      const errors: ScrapeError[] = [];
      const seenUrls = new Set<string>();

      const delayMs = 60000 / CARS24_CONFIG.rateLimit.requestsPerMinute;

      console.log("[cars24] Fetching listing index page...");
      const indexUrl = `${CARS24_CONFIG.baseUrl}/buy-used-cars-${CARS24_CONFIG.citySlug}/`;

      let listingUrls: Cars24ListingUrl[] = [];
      try {
        const response = await fetchWithHeaders(indexUrl);
        if (!response.ok) {
          throw new Error(`Cars24 returned ${response.status}: ${response.statusText}`);
        }
        const html = await response.text();
        listingUrls = extractListingUrlsFromHtml(html);
        console.log(`[cars24] Found ${listingUrls.length} listing URLs from index page`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[cars24] Failed to fetch index: ${message}`);
        errors.push({ url: indexUrl, message, retryable: true });
        return {
          listings: [],
          errors,
          metadata: { pagesScraped: 0, totalFound: 0, durationMs: Date.now() - startTime },
        };
      }

      for (let i = 0; i < listingUrls.length; i++) {
        const item = listingUrls[i]!;
        if (seenUrls.has(item.url)) continue;
        seenUrls.add(item.url);

        try {
          console.log(`[cars24] Fetching detail ${i + 1}/${listingUrls.length}: ${item.name}`);
          const response = await fetchWithHeaders(item.url);
          if (!response.ok) {
            throw new Error(`Cars24 returned ${response.status}`);
          }
          const html = await response.text();
          const listing = parseCarFromJsonLd(html, item.url);

          if (listing) {
            allListings.push(listing);
            console.log(
              `[cars24] Parsed: ${listing.make} ${listing.model} ${listing.year} - ₹${listing.price}`
            );
          } else {
            console.log(`[cars24] Could not parse listing from ${item.url}`);
          }

          if (i < listingUrls.length - 1) {
            await delay(delayMs);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[cars24] Detail page failed: ${message}`);
          errors.push({
            url: item.url,
            message,
            retryable: !message.includes("403") && !message.includes("401"),
          });

          if (message.includes("403") || message.includes("429")) {
            console.error("[cars24] Rate-limited or blocked, stopping.");
            break;
          }
        }
      }

      return {
        listings: allListings,
        errors,
        metadata: {
          pagesScraped: 1,
          totalFound: listingUrls.length,
          durationMs: Date.now() - startTime,
        },
      };
    },

    async healthCheck(): Promise<boolean> {
      try {
        const url = `${CARS24_CONFIG.baseUrl}/buy-used-cars-${CARS24_CONFIG.citySlug}/`;
        const response = await fetchWithHeaders(url);
        if (!response.ok) return false;
        const html = await response.text();
        return extractListingUrlsFromHtml(html).length > 0;
      } catch {
        return false;
      }
    },
  };
}
