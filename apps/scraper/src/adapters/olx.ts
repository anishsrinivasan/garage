import { chromium, type Browser, type Page } from "playwright";
import type {
  ScraperAdapter,
  ScraperConfig,
  ScrapeResult,
  ScrapeError,
  NormalizedListing,
} from "@preowned-cars/shared";
import { OLX_CONFIG } from "./olx-config";
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

async function extractListingCards(page: Page): Promise<OlxListingCard[]> {
  return page.evaluate(() => {
    const cards: {
      title: string;
      price: string;
      location: string;
      url: string;
      imageUrl: string;
      meta: string;
    }[] = [];

    const listItems = Array.from(document.querySelectorAll('[data-aut-id="itemBox"]'));

    for (const item of listItems) {
      const anchor = item.querySelector("a");
      if (!anchor) continue;

      const titleEl =
        item.querySelector('[data-aut-id="itemTitle"]') ??
        item.querySelector('[class*="title"]');
      const priceEl =
        item.querySelector('[data-aut-id="itemPrice"]') ??
        item.querySelector('[class*="price"]');
      const locationEl =
        item.querySelector('[data-aut-id="item-location"]') ??
        item.querySelector('[class*="location"]');
      const imgEl = item.querySelector("img");

      const title = titleEl?.textContent?.trim() ?? "";
      const price = priceEl?.textContent?.trim() ?? "";
      const location = locationEl?.textContent?.trim() ?? "";
      const url = anchor.href ?? "";
      const imageUrl = imgEl?.src ?? imgEl?.getAttribute("data-src") ?? "";
      const meta = item.textContent ?? "";

      if (title && price && url) {
        cards.push({ title, price, location, url, imageUrl, meta });
      }
    }

    if (cards.length === 0) {
      const fallbackItems = Array.from(document.querySelectorAll(
        'li[class*="card"], div[class*="card"], a[href*="/item/"]'
      ));
      for (const item of fallbackItems) {
        const anchor =
          item.tagName === "A" ? (item as HTMLAnchorElement) : item.querySelector("a");
        if (!anchor) continue;

        const title =
          item.querySelector("h2, h3, [class*='title']")?.textContent?.trim() ?? "";
        const price = item.querySelector("[class*='price']")?.textContent?.trim() ?? "";
        const location =
          item.querySelector("[class*='location']")?.textContent?.trim() ?? "";
        const imgEl = item.querySelector("img");
        const imageUrl = imgEl?.src ?? "";

        if (title && price) {
          cards.push({
            title,
            price,
            location,
            url: (anchor as HTMLAnchorElement).href ?? "",
            imageUrl,
            meta: item.textContent ?? "",
          });
        }
      }
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
        browser = await chromium.launch({
          headless: true,
          args: [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-setuid-sandbox",
          ],
        });

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
          const pageUrl =
            pageNum === 1
              ? `${OLX_CONFIG.baseUrl}${OLX_CONFIG.searchPath}?filter=city_eq_${OLX_CONFIG.cityParam}`
              : `${OLX_CONFIG.baseUrl}${OLX_CONFIG.searchPath}?filter=city_eq_${OLX_CONFIG.cityParam}&page=${pageNum}`;

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

              const year = detailData.year ?? titleYear ?? null;
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
                photos,
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
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        const url = `${OLX_CONFIG.baseUrl}${OLX_CONFIG.searchPath}?filter=city_eq_${OLX_CONFIG.cityParam}`;
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
