import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { existsSync } from "fs";
import { resolve } from "path";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db, scrapedPosts } from "@preowned-cars/db";
import type {
  ScraperAdapter,
  ScraperConfig,
  ScrapeResult,
  ScrapeError,
  NormalizedListing,
} from "@preowned-cars/shared";
import { INSTAGRAM_CONFIG } from "./instagram-config";
import { extractCarDataForPostsBatch, type LlmImage } from "./instagram-llm";
import { ProgressBar } from "../utils/progress";
import { isR2Enabled, uploadToR2 } from "../utils/r2";

async function filterRecentlyProcessedUrls(urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();
  const cutoff = new Date(
    Date.now() - INSTAGRAM_CONFIG.recheckAfterHours * 60 * 60 * 1000,
  );
  const rows = await db
    .select({ postUrl: scrapedPosts.postUrl })
    .from(scrapedPosts)
    .where(
      and(
        eq(scrapedPosts.platform, "instagram"),
        inArray(scrapedPosts.postUrl, urls),
        gte(scrapedPosts.lastCheckedAt, cutoff),
      ),
    );
  return new Set(rows.map((r) => r.postUrl));
}

async function recordScrapedPosts(
  entries: Array<{ postUrl: string; handle: string; isCarListing: boolean }>,
): Promise<void> {
  if (entries.length === 0) return;
  const now = new Date();
  await db
    .insert(scrapedPosts)
    .values(
      entries.map((e) => ({
        platform: "instagram",
        postUrl: e.postUrl,
        handle: e.handle,
        isCarListing: e.isCarListing,
        lastCheckedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [scrapedPosts.platform, scrapedPosts.postUrl],
      set: {
        lastCheckedAt: now,
        isCarListing: sql`excluded.is_car_listing`,
      },
    });
}

const SESSION_STATE_PATH = resolve(
  process.cwd(),
  "apps",
  "scraper",
  ".session",
  "storage-state.json",
);

type MediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

type DownloadedImage = {
  buffer: Buffer;
  mediaType: MediaType;
};

type RawPost = {
  postUrl: string;
  caption: string;
  imageUrls: string[];
  llmImages: LlmImage[];
  timestamp: string | null;
  handle: string;
};

const LLM_IMAGES_PER_POST = 2;

function normalizeMediaType(contentType: string | null): MediaType {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("png")) return "image/png";
  if (ct.includes("webp")) return "image/webp";
  if (ct.includes("gif")) return "image/gif";
  return "image/jpeg";
}

function extensionFor(mediaType: MediaType): string {
  return mediaType.split("/")[1] ?? "jpg";
}

async function downloadImages(
  context: BrowserContext,
  urls: string[],
): Promise<DownloadedImage[]> {
  const out: DownloadedImage[] = [];
  for (const url of urls) {
    try {
      const res = await context.request.get(url, { timeout: 15000 });
      if (!res.ok()) continue;
      const buf = await res.body();
      out.push({
        buffer: buf,
        mediaType: normalizeMediaType(res.headers()["content-type"] ?? null),
      });
    } catch {}
  }
  return out;
}

function extractPostId(postUrl: string): string {
  const m = postUrl.match(/\/(?:p|reel)\/([^/?]+)/);
  return m?.[1] ?? postUrl.split("/").filter(Boolean).pop() ?? "unknown";
}

async function materializeForLlm(
  handle: string,
  postUrl: string,
  downloads: DownloadedImage[],
): Promise<{ llmImages: LlmImage[]; publicUrls: string[] }> {
  const llmImages: LlmImage[] = [];
  const publicUrls: string[] = [];
  const r2Enabled = isR2Enabled();
  const postId = extractPostId(postUrl);

  for (let i = 0; i < downloads.length; i++) {
    const img = downloads[i]!;
    if (r2Enabled) {
      try {
        const key = `instagram/${handle}/${postId}/${i}.${extensionFor(img.mediaType)}`;
        const publicUrl = await uploadToR2(key, img.buffer, img.mediaType);
        llmImages.push({ kind: "url", url: publicUrl });
        publicUrls.push(publicUrl);
        continue;
      } catch (err) {
        console.warn(
          `[instagram] R2 upload failed for ${postId}#${i}, falling back to base64: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    llmImages.push({
      kind: "base64",
      mediaType: img.mediaType,
      data: img.buffer.toString("base64"),
    });
  }

  return { llmImages, publicUrls };
}

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

async function fetchSinglePost(
  context: BrowserContext,
  page: Page,
  postUrl: string,
  handle: string,
): Promise<RawPost> {
  await page.goto(postUrl, {
    waitUntil: "domcontentloaded",
    timeout: INSTAGRAM_CONFIG.navigationTimeoutMs,
  });

  await page
    .waitForSelector('meta[property="og:description"]', { timeout: 5000 })
    .catch(() => null);

  const caption = await page
    .$eval('meta[property="og:description"]', (el) => {
      const raw = el.getAttribute("content") ?? "";
      const dashIdx = raw.indexOf(" - ");
      return dashIdx > -1 ? raw.slice(dashIdx + 3).replace(/^"/, "").replace(/"$/, "") : raw;
    })
    .catch(() => "");

  const ogImage = await page
    .$eval('meta[property="og:image"]', (el) => el.getAttribute("content") ?? "")
    .catch(() => "");

  await page
    .waitForSelector('img[src*="cdninstagram"], img[src*="fbcdn"]', { timeout: 4000 })
    .catch(() => null);

  const domImageUrls = await page
    .$$eval('img[src*="cdninstagram"], img[src*="fbcdn"]', (imgs) =>
      imgs
        .map((img) => img.getAttribute("src"))
        .filter(
          (src): src is string =>
            !!src &&
            !src.includes("profile") &&
            !src.includes("s150x150") &&
            !src.includes("s320x320"),
        ),
    )
    .catch(() => [] as string[]);

  const discoveredUrls = Array.from(
    new Set([...(ogImage ? [ogImage] : []), ...domImageUrls]),
  );

  const timeEl = await page.$("time[datetime]").catch(() => null);
  const timestamp = timeEl ? await timeEl.getAttribute("datetime") : null;

  const downloads = await downloadImages(
    context,
    discoveredUrls.slice(0, LLM_IMAGES_PER_POST),
  );
  const { llmImages, publicUrls } = await materializeForLlm(handle, postUrl, downloads);

  const imageUrls = publicUrls.length > 0 ? publicUrls : discoveredUrls;

  return { postUrl, caption, imageUrls, llmImages, timestamp, handle };
}

async function fetchPostsParallel(
  context: BrowserContext,
  urls: string[],
  handle: string,
  concurrency: number,
  staggerMs: number,
  bar: ProgressBar | null,
): Promise<RawPost[]> {
  const results = new Array<RawPost>(urls.length);
  let cursor = 0;
  const pagePool = await Promise.all(
    Array.from({ length: Math.min(concurrency, urls.length) }, () => context.newPage()),
  );

  const worker = async (workerPage: Page, workerIdx: number): Promise<void> => {
    if (staggerMs > 0) await delay(workerIdx * staggerMs);
    while (true) {
      const i = cursor++;
      if (i >= urls.length) return;
      const postUrl = urls[i]!;
      const shortId = postUrl.split("/").filter(Boolean).pop() ?? postUrl;
      try {
        const post = await fetchSinglePost(context, workerPage, postUrl, handle);
        results[i] = post;
        bar?.tick(`${shortId} (${post.imageUrls.length} img, ${post.caption.length} chars)`);
      } catch (err) {
        results[i] = { postUrl, caption: "", imageUrls: [], llmImages: [], timestamp: null, handle };
        bar?.tick(
          `${shortId} (failed: ${err instanceof Error ? err.message : "unknown"})`,
        );
      }
    }
  };

  try {
    await Promise.all(pagePool.map((p, idx) => worker(p, idx)));
  } finally {
    await Promise.all(pagePool.map((p) => p.close().catch(() => undefined)));
  }

  return results;
}

async function scrapeProfilePosts(
  context: BrowserContext,
  page: Page,
  handle: string,
  maxPosts: number
): Promise<RawPost[]> {
  const profileUrl = `${INSTAGRAM_CONFIG.baseUrl}/${handle}/`;
  console.log(`[instagram] @${handle}: loading profile page ${profileUrl}`);
  await page.goto(profileUrl, {
    waitUntil: "domcontentloaded",
    timeout: INSTAGRAM_CONFIG.navigationTimeoutMs,
  });
  await delay(3000);
  await dismissModals(page);

  const notFoundText = await page.locator("text=Sorry, this page isn't available").count();
  if (notFoundText > 0) {
    console.warn(`[instagram] @${handle}: profile not available`);
    return [];
  }

  const postSelector = 'a[href*="/p/"], a[href*="/reel/"]';
  await page.waitForSelector(postSelector, { timeout: 15000 }).catch(() => null);

  const postLinks = new Set<string>();
  let scrollAttempts = 0;
  const maxScrollAttempts = Math.ceil(maxPosts / 12) + 2;

  console.log(`[instagram] @${handle}: scrolling to discover up to ${maxPosts} post link(s)`);
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
  console.log(
    `[instagram] @${handle}: discovered ${postLinks.size} link(s) after ${scrollAttempts} scroll(s)`,
  );

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
  console.log(
    `[instagram] @${handle}: fetching ${urlsToScrape.length} new post page(s)`,
  );

  const bar =
    urlsToScrape.length > 0
      ? new ProgressBar(`instagram:@${handle}:fetch`, urlsToScrape.length)
      : null;

  const fetchStart = Date.now();
  const posts = await fetchPostsParallel(
    context,
    urlsToScrape,
    handle,
    INSTAGRAM_CONFIG.postFetchConcurrency,
    INSTAGRAM_CONFIG.postFetchStaggerMs,
    bar,
  );

  bar?.done(`fetched ${posts.length} in ${Date.now() - fetchStart}ms`);
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

        console.log(
          `[instagram] starting scrape of ${handles.length} handle(s): ${handles.map((h) => `@${h}`).join(", ")}`,
        );
        const handleBar = new ProgressBar("instagram:handles", handles.length);

        for (const handle of handles) {
          console.log(`[instagram] === @${handle} ===`);
          const handleStart = Date.now();
          let handleListings = 0;
          try {
            const posts = await scrapeProfilePosts(
              context,
              page,
              handle,
              INSTAGRAM_CONFIG.postsPerAccount
            );
            totalFound += posts.length;

            if (posts.length === 0) {
              console.log(`[instagram] @${handle}: no new posts to process`);
              handleBar.tick(`@${handle}: 0 posts`);
              await delay(3000);
              continue;
            }

            console.log(
              `[instagram] @${handle}: sending batch of ${posts.length} post(s) to LLM`,
            );
            const llmStart = Date.now();
            let batchResults;
            try {
              batchResults = await extractCarDataForPostsBatch(
                posts.map((p) => ({
                  postUrl: p.postUrl,
                  caption: p.caption,
                  images: p.llmImages,
                })),
              );
              console.log(
                `[instagram] @${handle}: LLM batch returned in ${Date.now() - llmStart}ms`,
              );
            } catch (err) {
              console.warn(
                `[instagram] @${handle}: LLM batch failed after ${Date.now() - llmStart}ms: ${err instanceof Error ? err.message : String(err)}`,
              );
              errors.push({
                url: `${INSTAGRAM_CONFIG.baseUrl}/${handle}/`,
                message: `Batch LLM extraction failed: ${err instanceof Error ? err.message : String(err)}`,
                retryable: true,
              });
              handleBar.tick(`@${handle}: LLM failed`);
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
              handleListings++;
            });

            const scrapedRecords = posts.map((post, i) => {
              const carData = batchResults[i];
              const isCar = Boolean(
                carData?.isCarListing &&
                  carData.make &&
                  carData.model &&
                  carData.year &&
                  carData.price,
              );
              return {
                postUrl: post.postUrl,
                handle: post.handle,
                isCarListing: isCar,
              };
            });
            try {
              await recordScrapedPosts(scrapedRecords);
            } catch (err) {
              console.warn(
                `[instagram] @${handle}: failed to record scraped_posts: ${err instanceof Error ? err.message : String(err)}`,
              );
            }

            console.log(
              `[instagram] @${handle}: ${handleListings}/${posts.length} post(s) extracted as car listings (${Date.now() - handleStart}ms)`,
            );
            handleBar.tick(`@${handle}: ${handleListings} listings`);
          } catch (err) {
            console.error(
              `[instagram] @${handle}: handle failed: ${err instanceof Error ? err.message : String(err)}`,
            );
            errors.push({
              url: `${INSTAGRAM_CONFIG.baseUrl}/${handle}/`,
              message: err instanceof Error ? err.message : String(err),
              retryable: true,
            });
            handleBar.tick(`@${handle}: errored`);
          }

          await delay(3000);
        }

        handleBar.done(`${listings.length} listings, ${errors.length} error(s)`);
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
