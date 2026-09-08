/**
 * Adding a dealer by Instagram handle.
 *
 * Onboarding a garage previously meant hand-writing rows into `garages` and
 * `dealer_sources` (see `seed-dealers.ts`). This does the same work from a
 * handle: fetches the profile so the garage gets a real name, bio, city and
 * avatar rather than the handle repeated three times — which is what the
 * existing rows look like — and creates both rows in one step.
 */

import { chromium, type Browser } from "playwright";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { and, eq } from "drizzle-orm";
import { db, garages, dealerSources } from "@classifieds/db";
import { normalizeCity, normalizePhone } from "@classifieds/verticals/cars";
import { isR2Enabled, uploadToR2 } from "@classifieds/pipeline";

const SESSION_STATE_PATH = resolve(
  process.cwd(),
  "apps",
  "scraper",
  ".session",
  "storage-state.json",
);

export type InstagramProfile = {
  handle: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  externalUrl: string | null;
  followers: number | null;
  isPrivate: boolean;
  exists: boolean;
};

export function normalizeHandle(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/\/.*$/, "")
    .replace(/\?.*$/, "")
    .toLowerCase();
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Best-effort city guess from a dealer bio, so the admin form arrives pre-filled. */
export function guessCityFromBio(bio: string | null): string | null {
  if (!bio) return null;
  const cities = [
    "Chennai",
    "Bangalore",
    "Bengaluru",
    "Coimbatore",
    "Hyderabad",
    "Mumbai",
    "Pune",
    "Delhi",
    "Kochi",
    "Madurai",
    "Salem",
    "Trichy",
    "Tiruchirappalli",
    "Vellore",
    "Erode",
  ];
  const found = cities.find((city) => new RegExp(`\\b${city}\\b`, "i").test(bio));
  if (!found) return null;
  return normalizeCity(found === "Bengaluru" ? "Bangalore" : found);
}

export function extractPhoneFromBio(bio: string | null): string | null {
  if (!bio) return null;
  for (const match of bio.matchAll(/(?:\+?91[\s-]?)?[6-9]\d{9}/g)) {
    const phone = normalizePhone(match[0]);
    if (phone) return phone;
  }
  return null;
}

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
async function mirrorAvatar(
  handle: string,
  avatarUrl: string | null,
): Promise<string | null> {
  if (!avatarUrl || !isR2Enabled()) return avatarUrl;
  try {
    const res = await fetch(avatarUrl);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    return await uploadToR2(`garages/${handle}/avatar.${ext}`, buffer, contentType);
  } catch {
    return null;
  }
}

export type CreateGarageInput = {
  handle: string;
  name?: string;
  slug?: string;
  city?: string | null;
  phone?: string | null;
  description?: string | null;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  kind?: string;
};

export type CreateGarageResult = {
  garageId: string;
  dealerSourceId: string;
  slug: string;
  created: boolean;
};

/**
 * Creates (or reuses) a garage and its Instagram source. Idempotent on the
 * handle, so re-submitting the form updates the garage rather than failing on
 * the `uq_platform_handle` constraint.
 */
export async function createGarageFromInstagram(
  input: CreateGarageInput,
): Promise<CreateGarageResult> {
  const handle = normalizeHandle(input.handle);
  if (!handle) throw new Error("An Instagram handle is required");

  const [existingSource] = await db
    .select({ id: dealerSources.id, garageId: dealerSources.garageId })
    .from(dealerSources)
    .where(
      and(eq(dealerSources.platform, "instagram"), eq(dealerSources.handle, handle)),
    )
    .limit(1);

  const profile = input.name && input.logoUrl
    ? null
    : await fetchInstagramProfile(handle);

  const name = input.name?.trim() || profile?.displayName || handle;
  const slug = slugify(input.slug || name || handle) || handle;
  const logoUrl =
    input.logoUrl ?? (await mirrorAvatar(handle, profile?.avatarUrl ?? null));
  const city = input.city ?? guessCityFromBio(profile?.bio ?? null);
  const phone = input.phone ?? extractPhoneFromBio(profile?.bio ?? null);
  const description = input.description ?? profile?.bio ?? null;
  const websiteUrl = input.websiteUrl ?? profile?.externalUrl ?? null;
  const instagramUrl = `https://www.instagram.com/${handle}/`;

  if (existingSource) {
    await db
      .update(garages)
      .set({
        name,
        city,
        phone,
        description,
        websiteUrl,
        instagramUrl,
        ...(logoUrl ? { logoUrl } : {}),
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(garages.id, existingSource.garageId));
    await db
      .update(dealerSources)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(dealerSources.id, existingSource.id));
    return {
      garageId: existingSource.garageId,
      dealerSourceId: existingSource.id,
      slug,
      created: false,
    };
  }

  const [garage] = await db
    .insert(garages)
    .values({
      slug: await uniqueSlug(slug),
      name,
      kind: input.kind ?? "dealer",
      description,
      city,
      phone,
      websiteUrl,
      instagramUrl,
      logoUrl,
      isActive: true,
    })
    .returning({ id: garages.id, slug: garages.slug });

  const [source] = await db
    .insert(dealerSources)
    .values({
      garageId: garage!.id,
      platform: "instagram",
      handle,
      sourceType: "instagram_dealer",
      isActive: true,
    })
    .returning({ id: dealerSources.id });

  return {
    garageId: garage!.id,
    dealerSourceId: source!.id,
    slug: garage!.slug,
    created: true,
  };
}

/** Appends -2, -3… rather than failing on the unique slug index. */
async function uniqueSlug(base: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const [taken] = await db
      .select({ id: garages.id })
      .from(garages)
      .where(eq(garages.slug, candidate))
      .limit(1);
    if (!taken) return candidate;
  }
  return `${base}-${Date.now()}`;
}
