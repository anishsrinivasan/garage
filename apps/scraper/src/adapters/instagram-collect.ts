/**
 * Shared Instagram post collection.
 *
 * Browser lifecycle, session leasing, challenge handling, profile scrolling,
 * per-post media extraction and R2 persistence — none of which is about cars or
 * flats. Extracted from the cars adapter so the rentals adapter is the thin
 * mapping layer it should be, rather than a second copy of this.
 *
 * What it does NOT do is score the media: the vision rubric and the subject
 * label are both vertical knowledge, so scoring happens in the caller.
 */

import {
  chromium,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from "playwright";
import { resolve } from "path";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db, scrapedPosts } from "@classifieds/db";
import type { MediaItem, MediaSource, ScrapeError } from "@classifieds/shared";
import {
  extractPostMedia,
  extractShortcode,
  isR2Enabled,
  uploadToR2,
  extractFrames,
  leaseSessionOrFile,
  reportOutcome,
  isPooled,
  detectChallenge,
  impliesSessionProblem,
  isTargetProblem,
  ProgressBar,
  type PooledSession,
  type ScorableImage,
} from "@classifieds/pipeline";
import type { LlmImage } from "@classifieds/verticals";
import { INSTAGRAM_CONFIG } from "./instagram-config";

export type BrokerInfo = {
  dealerSourceId: string;
  garageId: string;
  handle: string;
  displayName: string | null;
  city: string | null;
};

export class ChallengeError extends Error {
  constructor(
    readonly kind: string,
    detail: string,
  ) {
    super(detail);
    this.name = "ChallengeError";
  }
}

function isReelUrl(url: string): boolean {
  return /\/reel\//.test(url);
}

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
          // Inline base64 rather than the R2 URL we just wrote. Handing the
          // model a freshly-uploaded object makes it race the CDN's
          // propagation, and a real run failed exactly that way: "Failed to
          // download .../0.jpg: TimeoutError". We already hold the bytes, so
          // sending them costs one round-trip less and cannot race at all.
          scorePayload: {
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
      // Same reasoning as the reel frames above: never make the model fetch an
      // object we uploaded moments ago.
      scorePayload: {
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
  const response = await page.goto(profileUrl, {
    waitUntil: "domcontentloaded",
    timeout: INSTAGRAM_CONFIG.navigationTimeoutMs,
  });
  await delay(3000);
  await dismissModals(page);

  // "Nothing posted" and "Instagram stopped talking to us" previously looked
  // identical — an empty result reported as success. That ambiguity is exactly
  // how a broken scraper stayed invisible for fifteen weeks.
  const challenge = await detectChallenge(page, response?.status());
  if (challenge.kind) {
    if (isTargetProblem(challenge.kind)) {
      console.warn(
        `[instagram] @${handle}: profile unavailable (${challenge.kind}) — skipping this handle`,
      );
      return [];
    }
    if (impliesSessionProblem(challenge.kind)) {
      // Throw: this is the session, not the handle, so continuing would burn
      // every remaining handle against a session Instagram has already blocked.
      throw new ChallengeError(challenge.kind, challenge.detail ?? challenge.kind);
    }
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

export type CollectedPost = RawPost & { shortcode: string | null };

export type CollectOptions = {
  onError?: (error: ScrapeError) => void;
  postsPerAccount?: number;
};

/**
 * Collects posts for every handle, one session for the run.
 *
 * A session-level challenge stops the whole run rather than burning the
 * remaining handles against a session Instagram has already blocked.
 */
export async function collectPosts(
  accounts: BrokerInfo[],
  options: CollectOptions = {},
): Promise<Map<string, CollectedPost[]>> {
  const out = new Map<string, CollectedPost[]>();
  let browser: Browser | null = null;
  let session: PooledSession | null = null;
  let challengeDetail: string | null = null;

  try {
    session = await leaseSessionOrFile(SESSION_STATE_PATH);
    if (!session) {
      console.warn(
        "[instagram] No usable session — import one with `bun run session:import <label>`. Scraping without auth returns 0 results.",
      );
    } else {
      console.log(`[instagram] using session: ${session.label}`);
    }

    browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
    });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 720 },
      locale: "en-IN",
      ...(session
        ? { storageState: session.state as BrowserContextOptions["storageState"] }
        : {}),
    });
    const page = await context.newPage();

    const bar = new ProgressBar("instagram:handles", accounts.length);
    for (const account of accounts) {
      try {
        const posts = await scrapeProfilePosts(
          context,
          page,
          account.handle,
          options.postsPerAccount ?? INSTAGRAM_CONFIG.postsPerAccount,
        );
        out.set(
          account.handle,
          posts.map((p) => ({ ...p, shortcode: extractShortcode(p.postUrl) })),
        );
        bar.tick(`@${account.handle}: ${posts.length} post(s)`);
      } catch (err) {
        if (err instanceof ChallengeError) {
          challengeDetail = `${err.kind}: ${err.message}`;
          console.error(
            `[instagram] @${account.handle}: ${challengeDetail} — stopping the run and benching this session`,
          );
          bar.done("challenged");
          break;
        }
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[instagram] @${account.handle}: ${message}`);
        options.onError?.({
          url: `${INSTAGRAM_CONFIG.baseUrl}/${account.handle}/`,
          message,
          retryable: true,
        });
        bar.tick(`@${account.handle}: errored`);
      }
      await delay(3000);
    }
    bar.done(`${out.size} handle(s) collected`);
    await context.close();
  } finally {
    if (browser) await browser.close();
    if (session && isPooled(session)) {
      await reportOutcome(
        session.id,
        challengeDetail ? "challenged" : "ok",
        challengeDetail ?? undefined,
      ).catch(() => undefined);
    }
  }

  if (challengeDetail) {
    throw new Error(`Instagram challenge: ${challengeDetail}`);
  }
  return out;
}

export { recordScrapedPosts, isReelUrl, sourceRank, LLM_IMAGES_PER_POST };
export type { RawPost, MediaCandidate };
