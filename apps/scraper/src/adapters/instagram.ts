import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { existsSync } from "fs";
import { resolve } from "path";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db, scrapedPosts } from "@preowned-cars/db";

type DealerInfo = {
  dealerSourceId: string;
  garageId: string;
  handle: string;
  displayName: string | null;
  city: string | null;
};

function isReelUrl(url: string): boolean {
  return /\/reel\//.test(url);
}
import type {
  ScraperAdapter,
  ScraperConfig,
  ScrapeResult,
  ScrapeError,
  NormalizedListing,
  MediaItem,
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
  entries: Array<{
    postUrl: string;
    handle: string;
    isCarListing: boolean;
    isReel?: boolean;
    skipReason?: string | null;
  }>,
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
        isReel: e.isReel ?? isReelUrl(e.postUrl),
        skipReason: e.skipReason ?? null,
        lastCheckedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [scrapedPosts.platform, scrapedPosts.postUrl],
      set: {
        lastCheckedAt: now,
        isCarListing: sql`excluded.is_car_listing`,
        isReel: sql`excluded.is_reel`,
        skipReason: sql`excluded.skip_reason`,
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
  media: MediaItem[];
  llmImages: LlmImage[];
  isReel: boolean;
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

function isUsablePostImageUrl(url: string): boolean {
  if (!url) return false;
  if (!/(cdninstagram|fbcdn)/.test(url)) return false;
  if (url.includes("/profile_pic") || url.includes("profile_pic")) return false;
  if (/\/(s|p)\d{2,3}x\d{2,3}\//.test(url)) return false;
  if (url.includes("s150x150") || url.includes("s320x320") || url.includes("s240x240")) return false;
  return true;
}

async function extractPostImageUrls(page: Page): Promise<string[]> {
  const html = await page.content().catch(() => "");
  const found = new Set<string>();

  const ogImage = await page
    .$eval('meta[property="og:image"]', (el) => el.getAttribute("content") ?? "")
    .catch(() => "");
  if (ogImage) found.add(ogImage);

  // <link rel="preload" as="image" href="..." imagesrcset="...">
  // IG uses preload hints for every image in a carousel.
  const linkAttrs = await page
    .$$eval(
      'link[rel="preload"][as="image"]',
      (links) =>
        links.flatMap((l) => {
          const out: string[] = [];
          const href = l.getAttribute("href");
          if (href) out.push(href);
          const srcset = l.getAttribute("imagesrcset") ?? l.getAttribute("imageSrcSet");
          if (srcset) {
            for (const part of srcset.split(",")) {
              const url = part.trim().split(/\s+/)[0];
              if (url) out.push(url);
            }
          }
          return out;
        }),
    )
    .catch(() => [] as string[]);
  for (const u of linkAttrs) if (u) found.add(u);

  // Rendered <img> tags (current slide + any eager-loaded neighbours).
  const imgAttrs = await page
    .$$eval(
      'img[src*="cdninstagram"], img[src*="fbcdn"], img[srcset]',
      (imgs) =>
        imgs.flatMap((img) => {
          const out: string[] = [];
          const src = img.getAttribute("src");
          if (src) out.push(src);
          const srcset = img.getAttribute("srcset");
          if (srcset) {
            for (const part of srcset.split(",")) {
              const url = part.trim().split(/\s+/)[0];
              if (url) out.push(url);
            }
          }
          return out;
        }),
    )
    .catch(() => [] as string[]);
  for (const u of imgAttrs) if (u) found.add(u);

  // Regex over raw HTML (covers preload links, JSON blobs in <script>).
  // The protocol and mid-URL slashes may be JSON-escaped as `\/`, and `&`
  // may appear as `\u0026`, so we match liberally then normalize.
  const HTML_URL_RE =
    /https:(?:\\?\/){2}[^"'\s<>]*?(?:cdninstagram\.com|fbcdn\.net)[^"'\s<>]+/g;
  for (const match of html.matchAll(HTML_URL_RE)) {
    const url = match[0]
      .replace(/\\\//g, "/")
      .replace(/\\u0026/gi, "&");
    found.add(url);
  }

  // Dedupe by ig_cache_key (stable per image, survives CDN host rotation);
  // fall back to filename if the param is absent.
  const canonical = new Map<string, string>();
  for (const raw of found) {
    if (!isUsablePostImageUrl(raw)) continue;
    let key: string;
    try {
      const u = new URL(raw);
      const cacheKey = u.searchParams.get("ig_cache_key");
      if (cacheKey) {
        key = `ck:${cacheKey}`;
      } else {
        const filename = u.pathname.split("/").filter(Boolean).pop() ?? u.pathname;
        key = `f:${filename}`;
      }
    } catch {
      key = `raw:${raw}`;
    }
    if (!canonical.has(key)) canonical.set(key, raw);
  }

  return Array.from(canonical.values());
}

function extractPostId(postUrl: string): string {
  const m = postUrl.match(/\/(?:p|reel)\/([^/?]+)/);
  return m?.[1] ?? postUrl.split("/").filter(Boolean).pop() ?? "unknown";
}

async function persistImages(
  handle: string,
  postUrl: string,
  downloads: DownloadedImage[],
): Promise<{ storedUrls: (string | null)[] }> {
  const r2Enabled = isR2Enabled();
  const postId = extractPostId(postUrl);
  const storedUrls: (string | null)[] = new Array(downloads.length).fill(null);
  if (!r2Enabled) return { storedUrls };
  for (let i = 0; i < downloads.length; i++) {
    const img = downloads[i]!;
    try {
      const key = `instagram/${handle}/${postId}/${i}.${extensionFor(img.mediaType)}`;
      storedUrls[i] = await uploadToR2(key, img.buffer, img.mediaType);
    } catch (err) {
      console.warn(
        `[instagram] R2 upload failed for ${postId}#${i}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return { storedUrls };
}

function buildLlmImages(
  downloads: DownloadedImage[],
  storedUrls: (string | null)[],
  count: number,
): LlmImage[] {
  const out: LlmImage[] = [];
  for (let i = 0; i < Math.min(count, downloads.length); i++) {
    const stored = storedUrls[i];
    if (stored) {
      out.push({ kind: "url", url: stored });
    } else {
      const img = downloads[i]!;
      out.push({
        kind: "base64",
        mediaType: img.mediaType,
        data: img.buffer.toString("base64"),
      });
    }
  }
  return out;
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

  await page
    .waitForSelector('img[src*="cdninstagram"], img[src*="fbcdn"]', { timeout: 4000 })
    .catch(() => null);

  const allDiscovered = await extractPostImageUrls(page);
  const discoveredUrls = allDiscovered.slice(0, INSTAGRAM_CONFIG.maxImagesPerPost);

  const timeEl = await page.$("time[datetime]").catch(() => null);
  const timestamp = timeEl ? await timeEl.getAttribute("datetime") : null;

  const videoUrl = await page
    .$eval('meta[property="og:video"]', (el) => el.getAttribute("content") ?? "")
    .catch(() => "");

  const downloads = await downloadImages(context, discoveredUrls);
  const { storedUrls } = await persistImages(handle, postUrl, downloads);
  const llmImages = buildLlmImages(downloads, storedUrls, LLM_IMAGES_PER_POST);

  const imageUrls = downloads
    .map((d, i) => ({
      url: storedUrls[i] ?? discoveredUrls[i] ?? "",
      mimeType: d.mediaType as string,
    }))
    .filter((m) => !!m.url);

  const isReel = isReelUrl(postUrl) || Boolean(videoUrl);

  const media: MediaItem[] = [];
  if (videoUrl) {
    media.push({
      url: videoUrl,
      type: "video",
      mimeType: "video/mp4",
      posterUrl: imageUrls[0]?.url ?? null,
    });
  }
  for (const img of imageUrls) {
    media.push({ url: img.url, type: "image", mimeType: img.mimeType });
  }

  return {
    postUrl,
    caption,
    media,
    llmImages,
    isReel,
    timestamp,
    handle,
  };
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
        bar?.tick(
          `${shortId} (${post.media.length} media, ${post.caption.length} chars)`,
        );
      } catch (err) {
        results[i] = {
          postUrl,
          caption: "",
          media: [],
          llmImages: [],
          isReel: isReelUrl(postUrl),
          timestamp: null,
          handle,
        };
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
  dealers: DealerInfo[],
): ScraperAdapter {
  const handles = dealers.map((d) => d.handle);
  const dealerByHandle = new Map(dealers.map((d) => [d.handle, d]));
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
                { handle },
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

            const dealer = dealerByHandle.get(handle);
            posts.forEach((post, i) => {
              const carData = batchResults[i];
              if (!carData) return;
              if (
                !carData.isCarListing ||
                !carData.make ||
                !carData.model ||
                !carData.year
              ) {
                return;
              }

              const saleStatus = carData.isSold ? "sold" : "available";
              listings.push({
                make: carData.make,
                model: carData.model,
                variant: carData.variant ?? undefined,
                year: carData.year,
                price: carData.price ?? null,
                listingStatus:
                  carData.price != null ? "priced" : "price_on_request",
                saleStatus,
                soldAt: carData.isSold ? new Date() : null,
                kmDriven: carData.kmDriven ?? undefined,
                fuelType: carData.fuelType ?? undefined,
                transmission: carData.transmission ?? undefined,
                ownerCount: carData.ownerCount ?? undefined,
                color: carData.color ?? undefined,
                bodyType: carData.bodyType ?? undefined,
                city: dealer?.city ?? INSTAGRAM_CONFIG.city,
                sourcePlatform: "instagram",
                sourceUrl: post.postUrl,
                sourceListingId: post.postUrl.split("/p/")[1]?.replace("/", ""),
                sellerName: dealer?.displayName ?? `@${post.handle}`,
                sellerPhone: carData.sellerPhone ?? undefined,
                sellerType: "dealer",
                dealerSourceId: dealer?.dealerSourceId,
                garageId: dealer?.garageId,
                media: post.media,
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
                  carData.year,
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
