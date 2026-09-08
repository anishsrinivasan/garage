/**
 * Reading an Instagram profile, which needs a real browser.
 *
 * Split out of garage-onboarding.ts so that importing the onboarding helpers
 * does not drag Playwright in behind them. The admin dashboard imports those
 * helpers, and once it is bundled for Cloudflare Workers a transitive Playwright
 * import fails the build outright — a headless Chromium cannot run there at all.
 * Everything else in onboarding is pure functions and database writes, which
 * Workers are perfectly happy with; only this file needs a machine with a
 * browser on it, which is why the cron service exposes it over HTTP.
 */

import { chromium, type Browser } from "playwright";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeHandle, type InstagramProfile } from "./garage-onboarding";

const SESSION_STATE_PATH = resolve(
  process.cwd(),
  "apps",
  "scraper",
  ".session",
  "storage-state.json",
);

type ProfileJson = {
  full_name?: string;
  biography?: string;
  profile_pic_url_hd?: string;
  profile_pic_url?: string;
  external_url?: string;
  is_private?: boolean;
  edge_followed_by?: { count?: number };
  follower_count?: number;
};

function findProfile(node: unknown, depth = 0): ProfileJson | null {
  if (depth > 12 || node == null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = findProfile(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  if (
    typeof obj.biography === "string" &&
    (typeof obj.profile_pic_url === "string" ||
      typeof obj.profile_pic_url_hd === "string")
  ) {
    return obj as ProfileJson;
  }
  for (const value of Object.values(obj)) {
    const found = findProfile(value, depth + 1);
    if (found) return found;
  }
  return null;
}


export async function fetchInstagramProfile(
  rawHandle: string,
): Promise<InstagramProfile> {
  const handle = normalizeHandle(rawHandle);
  const empty: InstagramProfile = {
    handle,
    displayName: null,
    bio: null,
    avatarUrl: null,
    externalUrl: null,
    followers: null,
    isPrivate: false,
    exists: false,
  };
  if (!handle) return empty;

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
    });
    const hasSession = existsSync(SESSION_STATE_PATH);
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 720 },
      locale: "en-IN",
      ...(hasSession ? { storageState: SESSION_STATE_PATH } : {}),
    });
    const page = await context.newPage();
    await page.goto(`https://www.instagram.com/${handle}/`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const notFound = await page
      .locator("text=Sorry, this page isn't available")
      .count();
    if (notFound > 0) return empty;

    const blobs = await page
      .$$eval("script", (scripts) =>
        scripts
          .map((s) => s.textContent ?? "")
          .filter((t) => t.includes("biography") && t.length > 200),
      )
      .catch(() => [] as string[]);

    let profile: ProfileJson | null = null;
    for (const blob of blobs) {
      try {
        profile = findProfile(JSON.parse(blob));
      } catch {
        const start = blob.indexOf("{");
        if (start === -1) continue;
        try {
          profile = findProfile(JSON.parse(blob.slice(start)));
        } catch {
          continue;
        }
      }
      if (profile) break;
    }

    // Meta tags are the fallback when the JSON payload isn't shipped.
    const ogTitle = await page
      .$eval('meta[property="og:title"]', (el) => el.getAttribute("content") ?? "")
      .catch(() => "");
    const ogDescription = await page
      .$eval('meta[property="og:description"]', (el) => el.getAttribute("content") ?? "")
      .catch(() => "");
    const ogImage = await page
      .$eval('meta[property="og:image"]', (el) => el.getAttribute("content") ?? "")
      .catch(() => "");

    const displayName =
      profile?.full_name?.trim() ||
      ogTitle.split("(")[0]?.trim() ||
      null;

    return {
      handle,
      displayName: displayName || handle,
      bio: profile?.biography?.trim() ?? ogDescription ?? null,
      avatarUrl: profile?.profile_pic_url_hd ?? profile?.profile_pic_url ?? ogImage ?? null,
      externalUrl: profile?.external_url ?? null,
      followers:
        profile?.edge_followed_by?.count ?? profile?.follower_count ?? null,
      isPrivate: Boolean(profile?.is_private),
      exists: true,
    };
  } catch (err) {
    console.warn(
      `[onboarding] profile fetch failed for @${handle}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return empty;
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

/**
 * Copies the avatar into R2. Instagram's profile-pic URLs are signed and expire,
 * so storing the raw URL would leave every garage page with a broken logo
 * within days.
 */
