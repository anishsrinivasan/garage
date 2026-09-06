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
import { extractPostMedia, extractShortcode } from "./instagram-media";
import { extractFrames } from "../utils/video-frames";
import {
  scoreImages,
  type ScorableImage,
} from "./instagram-image-scoring";
import { reconcilePrice, assessPrice, normalizeListingFields } from "@preowned-cars/shared";
import { recordSourceRun } from "../source-health";
import type { MediaSource } from "@preowned-cars/shared";

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

type MediaType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif";

type Downloaded = {
  buffer: Buffer;
  contentType: string;
};

/**
 * A single piece of media belonging to one post, already persisted to R2 where
 * possible, carrying enough context for the vision scorer to rank it.
 */
type MediaCandidate = {
  key: string;
  url: string;
  type: "image" | "video";
  mimeType: string;
  source: MediaSource;
  width: number | null;
  height: number | null;
  posterUrl: string | null;
  /** Present for images only — what we hand the scorer. */
  scorePayload: ScorableImage["payload"] | null;
};

type RawPost = {
  postUrl: string;
  caption: string;
  candidates: MediaCandidate[];
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

function extensionFor(mediaType: string): string {
  const sub = mediaType.split("/")[1] ?? "jpg";
  return sub === "jpeg" ? "jpg" : sub;
}

async function downloadBinary(
  context: BrowserContext,
  url: string,
  timeoutMs = 20000,
): Promise<Downloaded | null> {
  try {
    const res = await context.request.get(url, { timeout: timeoutMs });
    if (!res.ok()) return null;
    return {
      buffer: await res.body(),
      contentType: res.headers()["content-type"] ?? "",
    };
  } catch {
    return null;
  }
}

function extractPostId(postUrl: string): string {
  return (
    extractShortcode(postUrl) ??
    postUrl.split("/").filter(Boolean).pop() ??
    "unknown"
  );
}

/**
 * Uploads to R2 and returns the public URL, or null when R2 isn't configured or
 * the upload failed. Callers fall back to the Instagram CDN URL, which works but
 * expires — that's why R2 is strongly preferred.
 */
async function persist(
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<string | null> {
  if (!isR2Enabled()) return null;
  try {
    return await uploadToR2(key, buffer, contentType);
  } catch (err) {
    console.warn(
      `[instagram] R2 upload failed for ${key}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
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
  await page
    .waitForSelector('article img[src*="cdninstagram"], article img[src*="fbcdn"]', {
      timeout: 4000,
    })
    .catch(() => null);

  const extracted = await extractPostMedia(page, postUrl);
  const postId = extractPostId(postUrl);
  const candidates: MediaCandidate[] = [];

  // --- reel video: store the mp4 and cut our own frames ------------------
  // IG's signed CDN URLs expire within days, so a reel that isn't copied into
  // R2 becomes an unplayable listing. And its cover frame has a play glyph
  // burned into the pixels, so we need frames of our own to pick a hero from.
  let posterUrl: string | null = null;
  if (extracted.videoUrl) {
    const video = await downloadBinary(context, extracted.videoUrl, 60000);
    if (video) {
      const storedVideo = await persist(
        `instagram/${handle}/${postId}/video.mp4`,
        video.buffer,
        "video/mp4",
      );
      const frames = await extractFrames(video.buffer);
      for (const [i, frame] of frames.entries()) {
        const key = `instagram/${handle}/${postId}/frame-${i}.jpg`;
        const stored = await persist(key, frame.buffer, "image/jpeg");
        const url = stored ?? "";
        if (!url) continue;
        if (!posterUrl) posterUrl = url;
        candidates.push({
          key,
          url,
          type: "image",
          mimeType: "image/jpeg",
          source: "reel_frame",
          width: null,
          height: null,
          posterUrl: null,
          scorePayload: stored
            ? { kind: "url", url: stored }
            : {
                kind: "base64",
                mediaType: "image/jpeg",
                data: frame.buffer.toString("base64"),
              },
        });
      }

      const videoUrl = storedVideo ?? extracted.videoUrl;
      candidates.push({
        key: `${postId}:video`,
        url: videoUrl,
        type: "video",
        mimeType: "video/mp4",
        source: "reel_frame",
        width: null,
        height: null,
        posterUrl: null,
        scorePayload: null,
      });
    }
  }

  // --- stills from the post's own carousel (or the reel cover) -----------
  const imageUrls = extracted.images.slice(0, INSTAGRAM_CONFIG.maxImagesPerPost);
  for (const [i, candidate] of imageUrls.entries()) {
    const download = await downloadBinary(context, candidate.url);
    if (!download) continue;
    const mediaType = normalizeMediaType(download.contentType);
    const key = `instagram/${handle}/${postId}/${i}.${extensionFor(mediaType)}`;
    const stored = await persist(key, download.buffer, mediaType);
    const url = stored ?? candidate.url;
    const isCover =
      extracted.coverImageUrl != null && candidate.url === extracted.coverImageUrl;
    candidates.push({
      key,
      url,
      type: "image",
      mimeType: mediaType,
      source: isCover ? "reel_cover" : "carousel",
      width: candidate.width,
      height: candidate.height,
      posterUrl: null,
      scorePayload: stored
        ? { kind: "url", url: stored }
        : {
            kind: "base64",
            mediaType,
            data: download.buffer.toString("base64"),
          },
    });
    if (!posterUrl) posterUrl = url;
  }

  // Give the video item a poster now that we know the best available still.
  for (const candidate of candidates) {
    if (candidate.type === "video") candidate.posterUrl = posterUrl;
  }

  // Prefer real carousel photos and extracted frames over the play-glyph cover
  // when choosing what to send to the extraction model.
  const llmImages: LlmImage[] = candidates
    .filter((c) => c.type === "image" && c.scorePayload)
    .sort((a, b) => sourceRank(a.source) - sourceRank(b.source))
    .slice(0, LLM_IMAGES_PER_POST)
    .map((c) => c.scorePayload!) as LlmImage[];

  return {
    postUrl,
    caption: extracted.caption ?? "",
    candidates,
    llmImages,
    isReel: extracted.isVideo || isReelUrl(postUrl),
    timestamp: extracted.takenAt ? extracted.takenAt.toISOString() : null,
    handle,
  };
}

function sourceRank(source: MediaSource): number {
  switch (source) {
    case "manual":
      return 0;
    case "carousel":
      return 1;
    case "reel_frame":
      return 2;
    case "marketplace":
      return 3;
    case "reel_cover":
      return 4;
  }
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
          `${shortId} (${post.candidates.length} media, ${post.caption.length} chars)`,
        );
      } catch (err) {
        results[i] = {
          postUrl,
          caption: "",
          candidates: [],
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

/**
 * Runs the vision scorer over a post's stills and returns the media array in
 * hero-first order. The video (if any) is kept but never becomes media[0] —
 * cards render an image, and a poster frame we chose beats one Instagram chose.
 */
async function buildOrderedMedia(
  post: RawPost,
  carData: { make: string | null; model: string | null; year: number | null },
  handle: string,
): Promise<MediaItem[]> {
  const images = post.candidates.filter((c) => c.type === "image");
  const videos = post.candidates.filter((c) => c.type === "video");

  const scorable: ScorableImage[] = images
    .filter((c) => c.scorePayload)
    .map((c) => ({ key: c.key, source: c.source, payload: c.scorePayload! }));

  const carLabel = [carData.year, carData.make, carData.model]
    .filter(Boolean)
    .join(" ");

  const scores = await scoreImages(scorable, {
    handle,
    postUrl: post.postUrl,
    carLabel: carLabel || "used car",
  });
  const scoreByKey = new Map(scores.map((s) => [s.key, s]));

  const scoredImages = images
    .map((candidate) => {
      const score = scoreByKey.get(candidate.key);
      return {
        candidate,
        score: score?.score ?? 25,
        reason: score?.reason ?? "unscored",
      };
    })
    .sort((a, b) => b.score - a.score);

  const media: MediaItem[] = scoredImages.map(({ candidate, score, reason }) => ({
    url: candidate.url,
    type: "image" as const,
    mimeType: candidate.mimeType,
    posterUrl: null,
    source: candidate.source,
    width: candidate.width,
    height: candidate.height,
    score,
    scoreReason: reason,
  }));

  const heroUrl = media[0]?.url ?? null;
  for (const video of videos) {
    media.push({
      url: video.url,
      type: "video",
      mimeType: video.mimeType,
      posterUrl: heroUrl ?? video.posterUrl,
      source: video.source,
      width: null,
      height: null,
      score: null,
      scoreReason: null,
    });
  }

  return media;
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
              // "empty" rather than "ok": nothing was wrong, but nothing was
              // confirmed either, and a handle that stays empty for days is
              // worth noticing on the Sources screen.
              await recordSourceRun(
                dealerByHandle.get(handle)?.dealerSourceId,
                "empty",
              );
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
              await recordSourceRun(
                dealerByHandle.get(handle)?.dealerSourceId,
                "failed",
                `LLM extraction failed: ${err instanceof Error ? err.message : String(err)}`,
              );
              handleBar.tick(`@${handle}: LLM failed`);
              await delay(3000);
              continue;
            }

            const dealer = dealerByHandle.get(handle);

            // Only score images for posts that actually turned out to be car
            // listings — roughly 40% of what we fetch is a meme or an
            // announcement, and scoring those would be wasted spend.
            const carPosts = posts
              .map((post, i) => ({ post, carData: batchResults[i], index: i }))
              .filter(
                (entry): entry is { post: RawPost; carData: NonNullable<typeof entry.carData>; index: number } =>
                  Boolean(
                    entry.carData?.isCarListing &&
                      entry.carData.make &&
                      entry.carData.model &&
                      entry.carData.year,
                  ),
              );

            const orderedMediaByPost = new Map<string, MediaItem[]>();
            for (const { post, carData } of carPosts) {
              orderedMediaByPost.set(
                post.postUrl,
                await buildOrderedMedia(post, carData, handle),
              );
            }

            for (const { post, carData } of carPosts) {
              // The extraction model gets lakh/crore wrong often enough that we
              // re-read the caption deterministically and prefer that when the
              // two disagree by a clean power of ten.
              const reconciled = reconcilePrice(carData.price, post.caption);
              const normalized = normalizeListingFields({
                make: carData.make!,
                model: carData.model!,
                variant: carData.variant,
                fuelType: carData.fuelType,
                transmission: carData.transmission,
                bodyType: carData.bodyType,
                color: carData.color,
                city: dealer?.city ?? INSTAGRAM_CONFIG.city,
                sellerPhone: carData.sellerPhone,
              });

              const plausibility = assessPrice(reconciled.price, {
                make: normalized.make,
                year: carData.year,
              });
              const reviewReasons = [
                reconciled.corrected ? `price ${reconciled.reason}` : null,
                plausibility.plausible ? null : plausibility.reason,
              ].filter(Boolean) as string[];

              if (reconciled.corrected) {
                console.log(
                  `[instagram] ${post.postUrl}: price corrected ${carData.price} -> ${reconciled.price} (${reconciled.reason})`,
                );
              }

              const saleStatus = carData.isSold ? "sold" : "available";
              listings.push({
                make: normalized.make,
                model: normalized.model,
                variant: normalized.variant ?? undefined,
                year: carData.year!,
                price: reconciled.price,
                listingStatus:
                  reconciled.price != null ? "priced" : "price_on_request",
                saleStatus,
                soldAt: carData.isSold ? new Date() : null,
                kmDriven: carData.kmDriven ?? undefined,
                fuelType: normalized.fuelType ?? undefined,
                transmission: normalized.transmission ?? undefined,
                ownerCount: carData.ownerCount ?? undefined,
                color: normalized.color ?? undefined,
                bodyType: normalized.bodyType ?? undefined,
                city: normalized.city ?? INSTAGRAM_CONFIG.city,
                sourcePlatform: "instagram",
                sourceUrl: post.postUrl,
                sourceListingId: extractShortcode(post.postUrl) ?? undefined,
                sellerName: dealer?.displayName ?? `@${post.handle}`,
                sellerPhone: normalized.sellerPhone ?? undefined,
                sellerType: "dealer",
                dealerSourceId: dealer?.dealerSourceId,
                garageId: dealer?.garageId,
                media: orderedMediaByPost.get(post.postUrl) ?? [],
                description: post.caption || undefined,
                listedAt: post.timestamp ? new Date(post.timestamp) : undefined,
                needsReview: reviewReasons.length > 0,
                reviewReason: reviewReasons.join("; ") || null,
              });
              handleListings++;
            }

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
            await recordSourceRun(
              dealer?.dealerSourceId,
              handleListings > 0 ? "ok" : "empty",
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
            await recordSourceRun(
              dealerByHandle.get(handle)?.dealerSourceId,
              "failed",
              err instanceof Error ? err.message : String(err),
            );
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
