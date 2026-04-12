import * as cheerio from "cheerio";
import type {
  ScraperAdapter,
  ScraperConfig,
  ScrapeResult,
  ScrapeError,
  NormalizedListing,
} from "@preowned-cars/shared";
import { CARDEKHO_CONFIG } from "./cardekho-config";

type RawCardekhoListing = {
  make: string;
  model: string;
  variant?: string;
  year: number;
  price: number;
  kmDriven?: number;
  fuelType?: string;
  transmission?: string;
  ownerCount?: number;
  location?: string;
  sourceUrl: string;
  photos: string[];
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePrice(text: string): number | null {
  const cleaned = text.replace(/[₹,\s]/g, "");
  const lakhMatch = cleaned.match(/([\d.]+)\s*(?:lakh|lac)/i);
  if (lakhMatch) return Math.round(parseFloat(lakhMatch[1]!) * 100000);
  const croreMatch = cleaned.match(/([\d.]+)\s*(?:crore|cr)/i);
  if (croreMatch) return Math.round(parseFloat(croreMatch[1]!) * 10000000);
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseKm(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, "");
  const match = cleaned.match(/([\d.]+)/);
  if (!match) return null;
  const num = parseFloat(match[1]!);
  return isNaN(num) ? null : Math.round(num);
}

function parseOwnerCount(text: string): number | null {
  const match = text.match(/(\d+)/);
  return match ? parseInt(match[1]!, 10) : null;
}

function parseMakeModel(title: string): {
  make: string;
  model: string;
  variant?: string;
  year?: number;
} {
  const yearMatch = title.match(/\b(20\d{2})\b/);
  const year = yearMatch ? parseInt(yearMatch[1]!, 10) : undefined;
  const withoutYear = title.replace(/\b20\d{2}\b/, "").trim();
  const parts = withoutYear.split(/\s+/).filter(Boolean);
  const make = parts[0] ?? "";
  const model = parts[1] ?? "";
  const variant = parts.length > 2 ? parts.slice(2).join(" ") : undefined;
  return { make, model, variant, year };
}

function resolveUrl(href: string): string {
  if (href.startsWith("http")) return href;
  return `${CARDEKHO_CONFIG.baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;
}

function parseListingsFromHtml(html: string): RawCardekhoListing[] {
  const $ = cheerio.load(html);
  const listings: RawCardekhoListing[] = [];

  const jsonLdScripts = $('script[type="application/ld+json"]');
  jsonLdScripts.each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      const items = Array.isArray(data) ? data : data?.itemListElement ?? [data];
      for (const item of items) {
        const product = item?.item ?? item;
        if (product?.["@type"] !== "Car" && product?.["@type"] !== "Product") continue;

        const name = product.name ?? "";
        const { make, model, variant, year: parsedYear } = parseMakeModel(name);
        if (!make || !model) continue;

        const year =
          product.vehicleModelDate ??
          product.productionDate ??
          parsedYear ??
          new Date().getFullYear();

        const priceText =
          product.offers?.price ??
          product.offers?.lowPrice ??
          product.price ??
          "0";
        const price = typeof priceText === "number" ? priceText : parsePrice(String(priceText));
        if (!price) continue;

        const url = product.url ?? product.offers?.url ?? "";
        const image = product.image;
        const photos = Array.isArray(image)
          ? image.map(String)
          : image
            ? [String(image)]
            : [];

        listings.push({
          make,
          model,
          variant,
          year: typeof year === "string" ? parseInt(year, 10) : year,
          price,
          kmDriven: product.mileageFromOdometer?.value
            ? (parseKm(String(product.mileageFromOdometer.value)) ?? undefined)
            : undefined,
          fuelType: product.fuelType ?? undefined,
          transmission: product.vehicleTransmission ?? undefined,
          sourceUrl: resolveUrl(url),
          photos,
        });
      }
    } catch {
      // malformed JSON-LD, skip
    }
  });

  if (listings.length > 0) return listings;

  const selectors = [
    ".gsc_col-xs-12.gsc_col-sm-12.gsc_col-md-12.gsc_col-lg-12",
    '[data-tracking-section="used-car-listing"]',
    ".usedCarListing",
    ".carsGrid a[href*='/used-car-details/']",
    ".listingCard",
    "[class*='UsedListingCard']",
    "[class*='usedCarCard']",
    "a[href*='/used-car-details/']",
  ];

  let cardEls: ReturnType<typeof $> | null = null;
  for (const sel of selectors) {
    const found = $(sel);
    if (found.length > 0) {
      cardEls = found;
      break;
    }
  }

  if (!cardEls || cardEls.length === 0) return listings;

  cardEls.each((_, el) => {
    const card = $(el);
    const titleEl =
      card.find("h3").first().text() ||
      card.find("h2").first().text() ||
      card.find("[class*='title']").first().text() ||
      card.find("[class*='carName']").first().text();

    if (!titleEl) return;

    const { make, model, variant, year: parsedYear } = parseMakeModel(titleEl);
    if (!make || !model) return;

    const priceEl =
      card.find("[class*='price']").first().text() ||
      card.find("[class*='Price']").first().text() ||
      card.find(".Price").first().text();
    const price = parsePrice(priceEl);
    if (!price) return;

    const year = parsedYear ?? new Date().getFullYear();

    const detailsText = card.text();

    let kmDriven: number | undefined;
    const kmMatch = detailsText.match(/([\d,]+)\s*(?:kms?|km)/i);
    if (kmMatch) kmDriven = parseKm(kmMatch[1]!) ?? undefined;

    let fuelType: string | undefined;
    const fuelMatch = detailsText.match(/\b(petrol|diesel|cng|electric|hybrid|lpg)\b/i);
    if (fuelMatch) fuelType = fuelMatch[1]!.toLowerCase();

    let transmission: string | undefined;
    const transMatch = detailsText.match(/\b(manual|automatic|amt|cvt|dct|imt)\b/i);
    if (transMatch) {
      const raw = transMatch[1]!.toLowerCase();
      transmission = raw === "manual" ? "manual" : "automatic";
    }

    let ownerCount: number | undefined;
    const ownerMatch = detailsText.match(/(\d+)\s*(?:st|nd|rd|th)?\s*owner/i);
    if (ownerMatch) ownerCount = parseOwnerCount(ownerMatch[0]!) ?? undefined;

    const href =
      card.find("a[href*='/used-car-details/']").attr("href") ??
      card.find("a[href*='/used-cars']").attr("href") ??
      card.closest("a").attr("href") ??
      "";

    const imgEl = card.find("img").first();
    const imgSrc =
      imgEl.attr("src") ?? imgEl.attr("data-src") ?? imgEl.attr("data-lazy") ?? "";
    const photos = imgSrc ? [resolveUrl(imgSrc)] : [];

    const locationEl =
      card.find("[class*='location']").first().text() ||
      card.find("[class*='Location']").first().text();

    listings.push({
      make,
      model,
      variant,
      year,
      price,
      kmDriven,
      fuelType,
      transmission,
      ownerCount,
      location: locationEl?.trim() || undefined,
      sourceUrl: href ? resolveUrl(href) : `${CARDEKHO_CONFIG.baseUrl}${CARDEKHO_CONFIG.searchPath}`,
      photos,
    });
  });

  return listings;
}

function normalizeListing(raw: RawCardekhoListing): NormalizedListing | null {
  if (!raw.make || !raw.model || !raw.year || !raw.price) return null;

  return {
    make: raw.make.trim(),
    model: raw.model.trim(),
    variant: raw.variant?.trim() || undefined,
    year: raw.year,
    price: raw.price,
    kmDriven: raw.kmDriven,
    fuelType: raw.fuelType,
    transmission: raw.transmission,
    ownerCount: raw.ownerCount,
    location: raw.location,
    city: CARDEKHO_CONFIG.city,
    sourcePlatform: "cardekho",
    sourceUrl: raw.sourceUrl,
    photos: raw.photos,
  };
}

async function fetchPage(page: number): Promise<string> {
  const url =
    page === 1
      ? `${CARDEKHO_CONFIG.baseUrl}${CARDEKHO_CONFIG.searchPath}`
      : `${CARDEKHO_CONFIG.baseUrl}${CARDEKHO_CONFIG.searchPath}?page=${page}`;

  const response = await fetch(url, {
    headers: {
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-IN,en;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Referer: `${CARDEKHO_CONFIG.baseUrl}/used-cars+in+chennai`,
      "Cache-Control": "no-cache",
    },
    signal: AbortSignal.timeout(CARDEKHO_CONFIG.requestTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(
      `CarDekho returned ${response.status}: ${response.statusText}`
    );
  }

  return response.text();
}

export function createCardekhoAdapter(): ScraperAdapter {
  const config: ScraperConfig = {
    name: CARDEKHO_CONFIG.name,
    baseUrl: CARDEKHO_CONFIG.baseUrl,
    city: CARDEKHO_CONFIG.city,
    maxPages: CARDEKHO_CONFIG.maxPages,
    rateLimit: CARDEKHO_CONFIG.rateLimit,
  };

  return {
    name: "cardekho",
    config,

    async scrape(): Promise<ScrapeResult> {
      const startTime = Date.now();
      const allListings: NormalizedListing[] = [];
      const errors: ScrapeError[] = [];
      let pagesScraped = 0;
      const seenUrls = new Set<string>();

      const delayMs = 60000 / CARDEKHO_CONFIG.rateLimit.requestsPerMinute;

      for (let page = 1; page <= CARDEKHO_CONFIG.maxPages; page++) {
        try {
          console.log(`[cardekho] Fetching page ${page}...`);
          const html = await fetchPage(page);
          const rawListings = parseListingsFromHtml(html);

          if (rawListings.length === 0) {
            console.log(
              `[cardekho] No listings found on page ${page}, stopping.`
            );
            break;
          }

          pagesScraped++;

          for (const raw of rawListings) {
            if (seenUrls.has(raw.sourceUrl)) continue;
            seenUrls.add(raw.sourceUrl);

            const normalized = normalizeListing(raw);
            if (normalized) allListings.push(normalized);
          }

          console.log(
            `[cardekho] Page ${page}: ${rawListings.length} raw, ${allListings.length} total normalized`
          );

          if (page < CARDEKHO_CONFIG.maxPages) {
            await delay(delayMs);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[cardekho] Page ${page} failed: ${message}`);
          errors.push({
            url: `${CARDEKHO_CONFIG.baseUrl}${CARDEKHO_CONFIG.searchPath}?page=${page}`,
            message,
            retryable:
              !message.includes("403") && !message.includes("401"),
          });

          if (message.includes("403") || message.includes("429")) {
            console.error(
              "[cardekho] Rate-limited or blocked, stopping pagination."
            );
            break;
          }
        }
      }

      return {
        listings: allListings,
        errors,
        metadata: {
          pagesScraped,
          totalFound: allListings.length,
          durationMs: Date.now() - startTime,
        },
      };
    },

    async healthCheck(): Promise<boolean> {
      try {
        const html = await fetchPage(1);
        const listings = parseListingsFromHtml(html);
        return listings.length > 0;
      } catch {
        return false;
      }
    },
  };
}
