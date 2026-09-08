import { chromium, type Browser, type Page } from "playwright";
import type {
  ScraperAdapter,
  ScraperConfig,
  ScrapeResult,
  ScrapeError,
  NormalizedListing,
} from "@classifieds/shared";
import { OLX_CONFIG, olxLaunchOptions, olxSearchUrl } from "./olx-config";
import { parseIndianPrice } from "../utils/price";

type OlxListingCard = {
  title: string;
  price: string;
  location: string;
  url: string;
  imageUrl: string;
  meta: string;
};

type OlxDetailData = {
  year?: number;
  kmDriven?: number;
  fuelType?: string;
  transmission?: string;
  ownerCount?: number;
  photos: string[];
  description?: string;
  sellerName?: string;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return delay(ms);
}

function parseMakeModel(title: string): {
  make: string;
  model: string;
  variant?: string;
  year?: number;
} {
  const yearMatch = title.match(/\b((?:19|20)\d{2})\b/);
  const year = yearMatch ? parseInt(yearMatch[1]!, 10) : undefined;

  let cleaned = title
    .replace(/\b(?:19|20)\d{2}\b/, "")
    .replace(/\b(?:for\s+sale|used|second\s*hand|pre\s*owned)\b/gi, "")
    .replace(/[[\](){}]/g, "")
    .trim();

  cleaned = cleaned.replace(/\s+/g, " ").trim();

  const parts = cleaned.split(/\s+/).filter(Boolean);
  const make = parts[0] ?? "";
  const model = parts[1] ?? "";
  const variant = parts.length > 2 ? parts.slice(2).join(" ") : undefined;

  return { make, model, variant, year };
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

/**
 * Reads the result cards.
 *
 * OLX has removed the `data-aut-id` attributes this used to key on — they now
 * return zero — and the surviving class names are build-hashed (`_3V_Ww`), so
 * they are worthless as selectors. The stable structure is the item link and
 * the list item around it, and the fields come out of `innerText`, which keeps
 * one line per block. The lines are matched on shape rather than position,
 * because the posted date moves around within the card:
 *
 *   cars    ["FEATURED", "₹ 10,40,000", "Aug 22", "2024 - 24,000 km",
 *            "Hyundai Venue", "Chennai Central"]
 *   rentals ["FEATURED", "₹ 16,000", "2 BHK - 2 Bathroom - 800 sqft",
 *            "<title>", "TRIPLICANE, CHENNAI", "AUG 30"]
 */
async function extractListingCards(page: Page): Promise<OlxListingCard[]> {
  return page.evaluate(() => {
    const seen = new Set<string>();
    const cards: {
      title: string;
      price: string;
      location: string;
      url: string;
      imageUrl: string;
      meta: string;
    }[] = [];

    for (const anchor of Array.from(document.querySelectorAll('a[href*="/item/"]'))) {
      const href = anchor.getAttribute("href");
      if (!href || seen.has(href)) continue;
      seen.add(href);

      const card = anchor.closest("li") ?? anchor.parentElement;
      if (!card) continue;

      const lines = (card as HTMLElement).innerText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .filter((l) => l.toUpperCase() !== "FEATURED");

      const price = lines.find((l) => l.includes("₹")) ?? "";
      // Cars carry "2024 - 24,000 km"; rentals "2 BHK - 2 Bathroom - 800 sqft".
      const meta =
        lines.find((l) => /\d{4}\s*-\s*[\d,]+\s*km/i.test(l)) ??
        lines.find((l) => /\d+\s*BHK/i.test(l)) ??
        "";
      // A date, not a place: "Aug 22", "2 DAYS AGO", "TODAY".
      const isDate = (l: string) =>
        /^\d+\s+(day|hour|minute|week|month)s?\s+ago$/i.test(l) ||
        /^(today|yesterday)$/i.test(l) ||
        /^[a-z]{3}\s+\d{1,2}$/i.test(l);
      const location =
        lines.filter((l) => /chennai/i.test(l) && !isDate(l)).pop() ??
        lines.filter((l) => l !== price && l !== meta && !isDate(l)).pop() ??
        "";
      const title =
        lines.find(
          (l) => l !== price && l !== meta && l !== location && !isDate(l),
        ) ?? "";

      const img = card.querySelector("img");
      cards.push({
        title,
        price,
        location,
        url: href.startsWith("http") ? href : `https://www.olx.in${href}`,
        imageUrl: img?.getAttribute("src") ?? "",
        meta,
      });
    }

    return cards;
  });
}

async function extractDetailPage(page: Page): Promise<OlxDetailData> {
  return page.evaluate(() => {
    const data: {
      year?: number;
      kmDriven?: number;
      fuelType?: string;
      transmission?: string;
      ownerCount?: number;
      photos: string[];
      description?: string;
      sellerName?: string;
    } = { photos: [] };

    const images = Array.from(document.querySelectorAll(
      '[data-aut-id="image-gallery"] img, [class*="gallery"] img, [class*="image"] img, figure img'
    ));
    const photoSet = new Set<string>();
    for (const img of images) {
      const src = img.getAttribute("src") ?? "";
      if (src && src.startsWith("http") && !src.includes("placeholder")) {
        photoSet.add(src);
      }
    }
    data.photos = Array.from(photoSet);

    const descEl =
      document.querySelector('[data-aut-id="itemDescriptionContent"]') ??
      document.querySelector('[class*="description"]');
    if (descEl) {
      data.description = descEl.textContent?.trim();
    }

    const sellerEl =
      document.querySelector('[data-aut-id="profileName"]') ??
      document.querySelector('[class*="seller"] [class*="name"]');
    if (sellerEl) {
      data.sellerName = sellerEl.textContent?.trim();
    }

    const detailItems = Array.from(document.querySelectorAll(
      '[data-aut-id="itemDetails"] li, [class*="detail"] li, [class*="attribute"] li, [class*="property"]'
    ));
    for (const li of detailItems) {
      const text = li.textContent?.toLowerCase().trim() ?? "";
      const valueEl = li.querySelector("span:last-child, strong, [class*='value']");
      const value = valueEl?.textContent?.trim() ?? text;

      if (text.includes("year") || text.includes("model year")) {
        const match = value.match(/((?:19|20)\d{2})/);
        if (match) data.year = parseInt(match[1]!, 10);
      } else if (text.includes("km") || text.includes("mileage") || text.includes("driven")) {
        const cleaned = value.replace(/[,\s]/g, "");
        const match = cleaned.match(/(\d+)/);
        if (match) data.kmDriven = parseInt(match[1]!, 10);
      } else if (text.includes("fuel")) {
        const fuel = value.toLowerCase();
        if (fuel.includes("petrol")) data.fuelType = "petrol";
        else if (fuel.includes("diesel")) data.fuelType = "diesel";
        else if (fuel.includes("cng")) data.fuelType = "cng";
        else if (fuel.includes("electric")) data.fuelType = "electric";
        else if (fuel.includes("hybrid")) data.fuelType = "hybrid";
      } else if (text.includes("transmission")) {
        const trans = value.toLowerCase();
        data.transmission = trans.includes("manual") ? "manual" : "automatic";
      } else if (text.includes("owner")) {
        const match = value.match(/(\d+)/);
        if (match) data.ownerCount = parseInt(match[1]!, 10);
      }
    }

    return data;
  });
}

async function scrollToLoadAll(page: Page, maxScrolls: number = 5): Promise<void> {
  for (let i = 0; i < maxScrolls; i++) {
    const prevHeight = await page.evaluate(() => document.body.scrollHeight);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await delay(1500);
    const newHeight = await page.evaluate(() => document.body.scrollHeight);
    if (newHeight === prevHeight) break;
  }
}

export function createOlxAdapter(): ScraperAdapter {
  const config: ScraperConfig = {
    name: OLX_CONFIG.name,
    baseUrl: OLX_CONFIG.baseUrl,
    city: OLX_CONFIG.city,
    maxPages: OLX_CONFIG.maxPages,
    rateLimit: OLX_CONFIG.rateLimit,
  };

  return {
    name: "olx",
    config,

    async scrape(): Promise<ScrapeResult> {
      const startTime = Date.now();
      const allListings: NormalizedListing[] = [];
      const errors: ScrapeError[] = [];
      const seenUrls = new Set<string>();
      let pagesScraped = 0;

      const delayMs = 60000 / OLX_CONFIG.rateLimit.requestsPerMinute;

      let browser: Browser | null = null;

      try {
        // Headful is load-bearing; see olx-config.ts. Needs xvfb on a server.
        browser = await chromium.launch(olxLaunchOptions());

        const context = await browser.newContext({
          userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          viewport: { width: 1366, height: 768 },
          locale: "en-IN",
          timezoneId: "Asia/Kolkata",
        });

        const page = await context.newPage();
        page.setDefaultTimeout(OLX_CONFIG.pageLoadTimeoutMs);

        for (let pageNum = 1; pageNum <= OLX_CONFIG.maxPages; pageNum++) {
          const pageUrl = olxSearchUrl(OLX_CONFIG, pageNum);

          try {
            console.log(`[olx] Loading search page ${pageNum}: ${pageUrl}`);
            await page.goto(pageUrl, {
              waitUntil: "domcontentloaded",
              timeout: OLX_CONFIG.navigationTimeoutMs,
            });

            await page
              .waitForSelector('[data-aut-id="itemBox"], li[class*="card"], a[href*="/item/"]', {
                timeout: 10000,
              })
              .catch(() => {
                console.log(`[olx] No listing selector found on page ${pageNum}, trying scroll...`);
              });

            await scrollToLoadAll(page);

            const cards = await extractListingCards(page);
            console.log(`[olx] Page ${pageNum}: found ${cards.length} listing cards`);

            if (cards.length === 0) {
              console.log(`[olx] No listings on page ${pageNum}, stopping.`);
              break;
            }

            pagesScraped++;

            for (const card of cards) {
              if (seenUrls.has(card.url)) continue;
              seenUrls.add(card.url);

              const { make, model, variant, year: titleYear } = parseMakeModel(card.title);
              const price = parseIndianPrice(card.price);

              if (!make || !model || !price) {
                continue;
              }

              let detailData: OlxDetailData = { photos: [] };

              try {
                console.log(`[olx] Fetching detail: ${card.title}`);
                await page.goto(card.url, {
                  waitUntil: "domcontentloaded",
                  timeout: OLX_CONFIG.navigationTimeoutMs,
                });
                await delay(1000);
                detailData = await extractDetailPage(page);
                await randomDelay(delayMs * 0.5, delayMs * 1.5);
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.warn(`[olx] Detail page failed for "${card.title}": ${message}`);
                errors.push({ url: card.url, message, retryable: true });
              }

              // The card carries "2024 - 24,000 km"; the detail page's own
              // labels moved with the same redesign that broke the card
              // selectors, so this is the reliable source. Without it every
              // listing was rejected for a missing year — 119 of 119 on the
              // first working run, which is how the redesign showed up.
              const yearFromMeta = card.meta.match(/\b((?:19|20)\d{2})\b/);
              const year =
                detailData.year ??
                (yearFromMeta ? parseInt(yearFromMeta[1]!, 10) : undefined) ??
                titleYear ??
                null;
              const photos =
                detailData.photos.length > 0
                  ? detailData.photos
                  : card.imageUrl
                    ? [card.imageUrl]
                    : [];

              const kmFromMeta = card.meta.match(/([\d,]+)\s*(?:kms?|km)/i);

              const listing: NormalizedListing = {
                make: make.trim(),
                model: model.trim(),
                variant: variant?.trim(),
                year,
                price,
                kmDriven: detailData.kmDriven ?? (kmFromMeta ? parseKm(kmFromMeta[0]!) ?? undefined : undefined),
                fuelType: detailData.fuelType,
                transmission: detailData.transmission,
                ownerCount: detailData.ownerCount,
                location: card.location || undefined,
                city: OLX_CONFIG.city,
                sourcePlatform: "olx",
                sourceUrl: card.url,
                sourceListingId: card.url.match(/(\d+)$/)?.[1],
                sellerName: detailData.sellerName,
                sellerType: "individual",
                media: photos.map((url) => ({ url, type: "image" as const })),
                description: detailData.description,
              };

              allListings.push(listing);
              console.log(
                `[olx] Parsed: ${listing.make} ${listing.model} ${listing.year ?? "?"} - Rs.${listing.price}`
              );
            }

            if (pageNum < OLX_CONFIG.maxPages) {
              console.log(`[olx] Navigating back to search for page ${pageNum + 1}...`);
              await randomDelay(delayMs, delayMs * 2);
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[olx] Search page ${pageNum} failed: ${message}`);
            errors.push({ url: pageUrl, message, retryable: true });

            if (
              message.includes("403") ||
              message.includes("429") ||
              message.includes("CAPTCHA")
            ) {
              console.error("[olx] Blocked or rate-limited, stopping.");
              break;
            }
          }
        }

        await browser.close();
        browser = null;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[olx] Browser error: ${message}`);
        errors.push({
          url: OLX_CONFIG.baseUrl,
          message: `Browser launch/setup failed: ${message}`,
          retryable: false,
        });
      } finally {
        if (browser) {
          await browser.close().catch(() => {});
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
      let browser: Browser | null = null;
      try {
        browser = await chromium.launch(olxLaunchOptions());
        const page = await browser.newPage();
        const url = olxSearchUrl(OLX_CONFIG);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
        const cards = await extractListingCards(page);
        await browser.close();
        return cards.length > 0;
      } catch {
        if (browser) await browser.close().catch(() => {});
        return false;
      }
    },
  };
}
