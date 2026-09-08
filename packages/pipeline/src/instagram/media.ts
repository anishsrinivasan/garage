/**
 * Scoped media extraction for a single Instagram post.
 *
 * The previous implementation regex-scanned the *entire* post page HTML for any
 * `cdninstagram|fbcdn` URL. An Instagram post page also embeds the "More posts
 * from this account" rail and suggested-post thumbnails, so the media array
 * filled up with photos of other cars — a BMW X7 listing whose fifth image was
 * a pair of 7 Series, and so on for all 319 Instagram rows.
 *
 * We now read the post's own media out of the embedded GraphQL payload
 * (`xdt_api__v1__media__shortcode__web_info`), which is authoritative: it gives
 * us exactly the carousel this shortcode owns, the video URL for reels, the
 * untruncated caption, and the real publish timestamp. Page-wide scraping is
 * kept only as a last-resort fallback, and even then restricted to the post's
 * own `<article>` subtree.
 */

import type { Page } from "playwright";

export type PostImageCandidate = {
  url: string;
  width: number | null;
  height: number | null;
  /** Position within the post's own carousel; null for fallback discoveries. */
  carouselIndex: number | null;
};

export type ExtractedPost = {
  shortcode: string | null;
  /** Untruncated caption from the JSON payload when available. */
  caption: string | null;
  takenAt: Date | null;
  isVideo: boolean;
  videoUrl: string | null;
  /** IG's own cover frame for a reel — has a play glyph burned into it. */
  coverImageUrl: string | null;
  images: PostImageCandidate[];
  /** True when the data came from the post payload rather than the fallback. */
  authoritative: boolean;
};

export function extractShortcode(postUrl: string): string | null {
  return postUrl.match(/\/(?:p|reel|tv)\/([^/?#]+)/)?.[1] ?? null;
}

type Candidate = { url?: string; width?: number; height?: number };

function bestCandidate(candidates: Candidate[] | undefined): PostImageCandidate | null {
  if (!candidates?.length) return null;
  // IG lists the same image at several resolutions; take the largest.
  const sorted = [...candidates]
    .filter((c) => typeof c.url === "string" && c.url)
    .sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0));
  const best = sorted[0];
  if (!best?.url) return null;
  return {
    url: best.url,
    width: best.width ?? null,
    height: best.height ?? null,
    carouselIndex: null,
  };
}

function bestVideoUrl(versions: Array<{ url?: string; width?: number }> | undefined): string | null {
  if (!versions?.length) return null;
  const sorted = [...versions]
    .filter((v) => typeof v.url === "string" && v.url)
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return sorted[0]?.url ?? null;
}

/**
 * Walks an arbitrary JSON tree looking for the media item whose `code` matches
 * our shortcode. IG moves this object around between releases, so searching for
 * it is more durable than hard-coding a path.
 */
function findMediaItem(node: unknown, shortcode: string, depth = 0): any | null {
  if (depth > 14 || node == null || typeof node !== "object") return null;

  if (!Array.isArray(node)) {
    const obj = node as Record<string, unknown>;
    if (obj.code === shortcode && (obj.image_versions2 || obj.carousel_media || obj.video_versions)) {
      return obj;
    }
    // `items: [ ... ]` under xdt_api__v1__media__shortcode__web_info
    if (Array.isArray(obj.items)) {
      for (const item of obj.items) {
        const found = findMediaItem(item, shortcode, depth + 1);
        if (found) return found;
      }
    }
    for (const value of Object.values(obj)) {
      const found = findMediaItem(value, shortcode, depth + 1);
      if (found) return found;
    }
    return null;
  }

  for (const entry of node) {
    const found = findMediaItem(entry, shortcode, depth + 1);
    if (found) return found;
  }
  return null;
}

function parseMediaItem(item: any, shortcode: string): ExtractedPost {
  const images: PostImageCandidate[] = [];
  let videoUrl: string | null = null;
  let coverImageUrl: string | null = null;

  const carousel: any[] | undefined = item.carousel_media;
  if (Array.isArray(carousel) && carousel.length > 0) {
    carousel.forEach((slide, i) => {
      const image = bestCandidate(slide?.image_versions2?.candidates);
      if (image) images.push({ ...image, carouselIndex: i });
      // A carousel can mix photos and clips; take the first clip we see.
      videoUrl ??= bestVideoUrl(slide?.video_versions);
    });
  } else {
    const image = bestCandidate(item?.image_versions2?.candidates);
    if (image) images.push({ ...image, carouselIndex: 0 });
    videoUrl = bestVideoUrl(item?.video_versions);
  }

  const isVideo = Boolean(item.media_type === 2 || videoUrl);
  if (isVideo && images.length > 0) {
    // For a reel the single "image" IS the cover frame, complete with IG's
    // burned-in play triangle. Flag it so the scorer can push it down.
    coverImageUrl = images[0]!.url;
  }

  const captionText: string | null =
    typeof item?.caption?.text === "string" ? item.caption.text : null;

  const takenAtSeconds: number | null =
    typeof item?.taken_at === "number"
      ? item.taken_at
      : typeof item?.taken_at_timestamp === "number"
        ? item.taken_at_timestamp
        : null;

  return {
    shortcode,
    caption: captionText,
    takenAt: takenAtSeconds ? new Date(takenAtSeconds * 1000) : null,
    isVideo,
    videoUrl,
    coverImageUrl,
    images,
    authoritative: true,
  };
}

/**
 * Reads the post's embedded JSON payload. Returns null when IG didn't ship one
 * (logged-out views, rate limiting, A/B variants), letting the caller fall back.
 */
export async function extractFromEmbeddedJson(
  page: Page,
  shortcode: string,
): Promise<ExtractedPost | null> {
  const blobs = await page
    .$$eval("script", (scripts) =>
      scripts
        .map((s) => s.textContent ?? "")
        .filter(
          (text) =>
            text.length > 200 &&
            (text.includes("xdt_api__v1__media__shortcode__web_info") ||
              text.includes("image_versions2") ||
              text.includes("shortcode_media")),
        ),
    )
    .catch(() => [] as string[]);

  for (const blob of blobs) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(blob);
    } catch {
      // Some payloads are `requireLazy(...)(...)` wrappers around JSON. Pull out
      // the first balanced object and try that.
      const start = blob.indexOf("{");
      if (start === -1) continue;
      try {
        parsed = JSON.parse(blob.slice(start));
      } catch {
        continue;
      }
    }

    const item = findMediaItem(parsed, shortcode);
    if (item) return parseMediaItem(item, shortcode);
  }

  return null;
}

/**
 * Last resort when the JSON payload isn't present. Restricted to the post's own
 * `<article>` / dialog subtree so we don't pick up the suggested-posts rail —
 * that restriction is the entire point of this function.
 */
export async function extractFromDom(
  page: Page,
  shortcode: string,
): Promise<ExtractedPost> {
  const scopedImages = await page
    .$$eval(
      'article img[src*="cdninstagram"], article img[src*="fbcdn"], div[role="dialog"] img[src*="cdninstagram"], div[role="dialog"] img[src*="fbcdn"]',
      (imgs) =>
        imgs
          .map((img) => ({
            url: img.getAttribute("src") ?? "",
            width: (img as HTMLImageElement).naturalWidth || null,
            height: (img as HTMLImageElement).naturalHeight || null,
            alt: img.getAttribute("alt") ?? "",
          }))
          .filter((i) => i.url),
    )
    .catch(() => [] as Array<{ url: string; width: number | null; height: number | null; alt: string }>);

  const ogImage = await page
    .$eval('meta[property="og:image"]', (el) => el.getAttribute("content") ?? "")
    .catch(() => "");

  const ogVideo = await page
    .$eval('meta[property="og:video"]', (el) => el.getAttribute("content") ?? "")
    .catch(() => "");

  const ogDescription = await page
    .$eval('meta[property="og:description"]', (el) => el.getAttribute("content") ?? "")
    .catch(() => "");

  const datetime = await page
    .$eval("article time[datetime], time[datetime]", (el) => el.getAttribute("datetime") ?? "")
    .catch(() => "");

  const seen = new Set<string>();
  const images: PostImageCandidate[] = [];
  for (const [i, img] of scopedImages.entries()) {
    if (!isUsablePostImageUrl(img.url)) continue;
    const key = canonicalKey(img.url);
    if (seen.has(key)) continue;
    seen.add(key);
    images.push({ url: img.url, width: img.width, height: img.height, carouselIndex: i });
  }
  if (images.length === 0 && ogImage && isUsablePostImageUrl(ogImage)) {
    images.push({ url: ogImage, width: null, height: null, carouselIndex: 0 });
  }

  const isVideo = Boolean(ogVideo);
  return {
    shortcode,
    caption: parseOgCaption(ogDescription),
    takenAt: datetime ? new Date(datetime) : null,
    isVideo,
    videoUrl: ogVideo || null,
    coverImageUrl: isVideo ? (images[0]?.url ?? null) : null,
    images,
    authoritative: false,
  };
}

/** `og:description` is `"handle on May 13, 2026: \"<caption>\""` — strip the frame. */
export function parseOgCaption(raw: string): string | null {
  if (!raw) return null;
  const dashIdx = raw.indexOf(" - ");
  const body = dashIdx > -1 ? raw.slice(dashIdx + 3) : raw;
  const colonIdx = body.indexOf(': "');
  const inner = colonIdx > -1 ? body.slice(colonIdx + 3) : body;
  return inner.replace(/^"/, "").replace(/"\.?\s*$/, "").trim() || null;
}

export function isUsablePostImageUrl(url: string): boolean {
  if (!url) return false;
  if (!/(cdninstagram|fbcdn)/.test(url)) return false;
  if (url.includes("profile_pic")) return false;
  // s150x150 and friends are avatars and rail thumbnails, never post media.
  if (/\/(s|p)\d{2,3}x\d{2,3}\//.test(url)) return false;
  if (/s(150|240|320)x\1?/.test(url)) return false;
  return true;
}

function canonicalKey(url: string): string {
  try {
    const u = new URL(url);
    const cacheKey = u.searchParams.get("ig_cache_key");
    if (cacheKey) return `ck:${cacheKey}`;
    return `f:${u.pathname.split("/").filter(Boolean).pop() ?? u.pathname}`;
  } catch {
    return `raw:${url}`;
  }
}

/**
 * Preferred entry point: authoritative payload when IG ships one, scoped DOM
 * otherwise. Never falls back to whole-page scraping.
 */
export async function extractPostMedia(
  page: Page,
  postUrl: string,
): Promise<ExtractedPost> {
  const shortcode = extractShortcode(postUrl);
  if (shortcode) {
    const fromJson = await extractFromEmbeddedJson(page, shortcode).catch(() => null);
    if (fromJson && fromJson.images.length > 0) return fromJson;

    const fromDom = await extractFromDom(page, shortcode);
    if (fromJson) {
      // Payload existed but carried no images — keep its caption/timestamp/video
      // and take the images from the scoped DOM.
      return {
        ...fromJson,
        images: fromDom.images,
        coverImageUrl: fromJson.coverImageUrl ?? fromDom.coverImageUrl,
        videoUrl: fromJson.videoUrl ?? fromDom.videoUrl,
        authoritative: false,
      };
    }
    return fromDom;
  }
  return extractFromDom(page, "");
}
