import { chromium, type Browser, type Page } from "playwright";
import type {
  ScraperAdapter,
  ScraperConfig,
  ScrapeResult,
  ScrapeError,
  NormalizedListing,
} from "@preowned-cars/shared";
import { INSTAGRAM_CONFIG, INSTAGRAM_DEALER_HANDLES } from "./instagram-config";
import { extractCarDataFromPost } from "./instagram-llm";

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

async function scrapeProfilePosts(
  page: Page,
  handle: string,
  maxPosts: number
): Promise<RawPost[]> {
  const profileUrl = `${INSTAGRAM_CONFIG.baseUrl}/${handle}/`;
  await page.goto(profileUrl, {
    waitUntil: "networkidle",
    timeout: INSTAGRAM_CONFIG.navigationTimeoutMs,
  });

  const notFoundText = await page.locator("text=Sorry, this page isn't available").count();
  if (notFoundText > 0) {
    return [];
  }

  await page.waitForSelector('article a[href*="/p/"]', { timeout: 15000 }).catch(() => null);

  const postLinks = new Set<string>();
  let scrollAttempts = 0;
  const maxScrollAttempts = Math.ceil(maxPosts / 12) + 2;

  while (postLinks.size < maxPosts && scrollAttempts < maxScrollAttempts) {
    const links = await page.$$eval('article a[href*="/p/"]', (anchors) =>
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
  const posts: RawPost[] = [];

  for (const link of limitedLinks) {
    const postUrl = link.startsWith("http")
      ? link
      : `${INSTAGRAM_CONFIG.baseUrl}${link}`;

    try {
      await page.goto(postUrl, {
        waitUntil: "networkidle",
        timeout: INSTAGRAM_CONFIG.navigationTimeoutMs,
      });

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
  handles: string[] = INSTAGRAM_DEALER_HANDLES
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

            for (const post of posts) {
              try {
                const carData = await extractCarDataFromPost(
                  post.caption,
                  post.imageUrls
                );

                if (
                  !carData.isCarListing ||
                  !carData.make ||
                  !carData.model ||
                  !carData.year ||
                  !carData.price
                ) {
                  continue;
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
              } catch (err) {
                errors.push({
                  url: post.postUrl,
                  message: err instanceof Error ? err.message : String(err),
                  retryable: true,
                });
              }
            }
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
