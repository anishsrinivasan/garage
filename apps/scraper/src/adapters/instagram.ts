import { chromium, type Browser, type Page } from "playwright";
import { existsSync } from "fs";
import { resolve } from "path";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db, carListings } from "@preowned-cars/db";
import type {
  ScraperAdapter,
  ScraperConfig,
  ScrapeResult,
  ScrapeError,
  NormalizedListing,
} from "@preowned-cars/shared";
import { INSTAGRAM_CONFIG } from "./instagram-config";
import { extractCarDataForPostsBatch } from "./instagram-llm";

async function filterRecentlyProcessedUrls(urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();
  const cutoff = new Date(
    Date.now() - INSTAGRAM_CONFIG.recheckAfterHours * 60 * 60 * 1000,
  );
  const rows = await db
    .select({ sourceUrl: carListings.sourceUrl })
    .from(carListings)
    .where(
      and(
        eq(carListings.sourcePlatform, "instagram"),
        inArray(carListings.sourceUrl, urls),
        gte(carListings.updatedAt, cutoff),
      ),
    );
  return new Set(rows.map((r) => r.sourceUrl));
}

const SESSION_STATE_PATH = resolve(
  process.cwd(),
  "apps",
  "scraper",
  ".session",
  "storage-state.json",
);

type RawPost = {
  postUrl: string;
  caption: string;
  imageUrls: string[];
  timestamp: string | null;
  handle: string;
};

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dismissModals(page: Page): Promise<void> {
  const selectors = [
    '[aria-label="Close"]',
    'div[role="dialog"] button:has(svg)',
    '[role="dialog"] button[type="button"]',
  ];
  for (const selector of selectors) {
    try {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 1500 })) {
        await btn.click();
        await delay(500);
        return;
      }
    } catch {}
  }
  await page.keyboard.press("Escape");
  await delay(500);
}

async function scrapeProfilePosts(
  page: Page,
  handle: string,
  maxPosts: number
): Promise<RawPost[]> {
  const profileUrl = `${INSTAGRAM_CONFIG.baseUrl}/${handle}/`;
  await page.goto(profileUrl, {
    waitUntil: "domcontentloaded",
    timeout: INSTAGRAM_CONFIG.navigationTimeoutMs,
  });
  await delay(3000);
  await dismissModals(page);

  const notFoundText = await page.locator("text=Sorry, this page isn't available").count();
  if (notFoundText > 0) {
    return [];
  }

  const postSelector = 'a[href*="/p/"], a[href*="/reel/"]';
  await page.waitForSelector(postSelector, { timeout: 15000 }).catch(() => null);

  const postLinks = new Set<string>();
  let scrollAttempts = 0;
  const maxScrollAttempts = Math.ceil(maxPosts / 12) + 2;

  while (postLinks.size < maxPosts && scrollAttempts < maxScrollAttempts) {
    const links = await page.$$eval(postSelector, (anchors) =>
      anchors.map((a) => a.getAttribute("href")).filter(Boolean)
    );
    for (const link of links) {
      if (link) postLinks.add(link);
    }
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await delay(INSTAGRAM_CONFIG.scrollDelayMs);
    scrollAttempts++;
  }

  const limitedLinks = Array.from(postLinks).slice(0, maxPosts);
  const candidateUrls = limitedLinks.map((link) =>
    link.startsWith("http") ? link : `${INSTAGRAM_CONFIG.baseUrl}${link}`,
  );

  const recentlyProcessed = await filterRecentlyProcessedUrls(candidateUrls);
  const urlsToScrape = candidateUrls.filter((u) => !recentlyProcessed.has(u));

  if (recentlyProcessed.size > 0) {
    console.log(
      `[instagram] @${handle}: skipping ${recentlyProcessed.size} post(s) checked within last ${INSTAGRAM_CONFIG.recheckAfterHours}h`,
    );
  }

  const posts: RawPost[] = [];

  for (const postUrl of urlsToScrape) {
    try {
      await page.goto(postUrl, {
        waitUntil: "domcontentloaded",
        timeout: INSTAGRAM_CONFIG.navigationTimeoutMs,
      });
      await delay(2000);
      await dismissModals(page);

      const caption = await page
        .$eval('div[class*="Caption"] span, article span[dir="auto"]', (el) =>
          el.textContent?.trim() ?? ""
        )
        .catch(() => "");

      const imageUrls = await page.$$eval(
        'article img[src*="instagram"], article img[srcset]',
        (imgs) =>
          imgs
            .map((img) => img.getAttribute("src"))
            .filter((src): src is string => !!src && !src.includes("profile"))
      );

      const timeEl = await page.$("article time[datetime]");
      const timestamp = timeEl
        ? await timeEl.getAttribute("datetime")
        : null;

      posts.push({ postUrl, caption, imageUrls, timestamp, handle });

      const delayMs =
        60000 / INSTAGRAM_CONFIG.rateLimit.requestsPerMinute;
      await delay(delayMs);
    } catch {
      posts.push({ postUrl, caption: "", imageUrls: [], timestamp: null, handle });
    }
  }

  return posts;
}

export function createInstagramAdapter(
  handles: string[],
): ScraperAdapter {
  const config: ScraperConfig = {
    name: INSTAGRAM_CONFIG.name,
    baseUrl: INSTAGRAM_CONFIG.baseUrl,
    city: INSTAGRAM_CONFIG.city,
    maxPages: INSTAGRAM_CONFIG.maxPages,
    rateLimit: INSTAGRAM_CONFIG.rateLimit,
  };

  return {
    name: "instagram",
    config,

    async scrape(): Promise<ScrapeResult> {
      const startTime = Date.now();
      const listings: NormalizedListing[] = [];
      const errors: ScrapeError[] = [];
      let totalFound = 0;

      let browser: Browser | null = null;
      try {
        const hasSession = existsSync(SESSION_STATE_PATH);
        if (!hasSession) {
          console.warn(
            "[instagram] No session state found — run instagram-login.ts first. Scraping without auth may return 0 results.",
          );
        }

        browser = await chromium.launch({
          headless: true,
          args: [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
          ],
        });

        const context = await browser.newContext({
          userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          viewport: { width: 1280, height: 720 },
          locale: "en-IN",
          ...(hasSession ? { storageState: SESSION_STATE_PATH } : {}),
        });

        const page = await context.newPage();

        for (const handle of handles) {
          console.log(`[instagram] Scraping @${handle}...`);
          try {
            const posts = await scrapeProfilePosts(
              page,
              handle,
              INSTAGRAM_CONFIG.postsPerAccount
            );
            totalFound += posts.length;

            if (posts.length === 0) {
              await delay(3000);
              continue;
            }

            let batchResults;
            try {
              batchResults = await extractCarDataForPostsBatch(
                posts.map((p) => ({
                  postUrl: p.postUrl,
                  caption: p.caption,
                  imageUrls: p.imageUrls,
                })),
              );
            } catch (err) {
              errors.push({
                url: `${INSTAGRAM_CONFIG.baseUrl}/${handle}/`,
                message: `Batch LLM extraction failed: ${err instanceof Error ? err.message : String(err)}`,
                retryable: true,
              });
              await delay(3000);
              continue;
            }

            posts.forEach((post, i) => {
              const carData = batchResults[i];
              if (!carData) return;
              if (
                !carData.isCarListing ||
                !carData.make ||
                !carData.model ||
                !carData.year ||
                !carData.price
              ) {
                return;
              }

              listings.push({
                make: carData.make,
                model: carData.model,
                variant: carData.variant ?? undefined,
                year: carData.year,
                price: carData.price,
                kmDriven: carData.kmDriven ?? undefined,
                fuelType: carData.fuelType ?? undefined,
                transmission: carData.transmission ?? undefined,
                ownerCount: carData.ownerCount ?? undefined,
                color: carData.color ?? undefined,
                bodyType: carData.bodyType ?? undefined,
                city: INSTAGRAM_CONFIG.city,
                sourcePlatform: "instagram",
                sourceUrl: post.postUrl,
                sourceListingId: post.postUrl.split("/p/")[1]?.replace("/", ""),
                sellerName: `@${post.handle}`,
                sellerPhone: carData.sellerPhone ?? undefined,
                sellerType: "dealer",
                photos: post.imageUrls,
                description: post.caption || undefined,
                listedAt: post.timestamp ? new Date(post.timestamp) : undefined,
              });
            });
          } catch (err) {
            errors.push({
              url: `${INSTAGRAM_CONFIG.baseUrl}/${handle}/`,
              message: err instanceof Error ? err.message : String(err),
              retryable: true,
            });
          }

          await delay(3000);
        }

        await context.close();
      } finally {
        if (browser) await browser.close();
      }

      return {
        listings,
        errors,
        metadata: {
          pagesScraped: handles.length,
          totalFound,
          durationMs: Date.now() - startTime,
        },
      };
    },

    async healthCheck(): Promise<boolean> {
      let browser: Browser | null = null;
      try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        const response = await page.goto(INSTAGRAM_CONFIG.baseUrl, {
          timeout: 10000,
        });
        await browser.close();
        return response?.status() === 200;
      } catch {
        if (browser) await browser.close();
        return false;
      }
    },
  };
}
