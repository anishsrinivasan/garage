/**
 * Adding a dealer by Instagram handle.
 *
 * Onboarding a garage previously meant hand-writing rows into `garages` and
 * `dealer_sources` (see `seed-dealers.ts`). This does the same work from a
 * handle: fetches the profile so the garage gets a real name, bio, city and
 * avatar rather than the handle repeated three times — which is what the
 * existing rows look like — and creates both rows in one step.
 */

import { and, eq } from "drizzle-orm";
import { db, garages, dealerSources } from "@classifieds/db";
import { normalizeCity, normalizePhone } from "@classifieds/verticals/cars";
import { isR2Enabled, uploadToR2 } from "@classifieds/pipeline/storage";


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
  /** Already-read profile, used to fill in anything not given explicitly. */
  profile?: InstagramProfile | null;
  /**
   * Supplies a profile when one was not passed and the fields are missing.
   * Injected so this module never imports the browser; see ./instagram-profile.
   */
  fetchProfile?: (handle: string) => Promise<InstagramProfile>;
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

  // The profile arrives from the caller rather than being fetched here.
  // Reading an Instagram profile needs a headless browser, and this module is
  // imported by the admin dashboard, which is bundled for Cloudflare Workers
  // where Playwright cannot run at all. The admin already has the profile from
  // its preview step; CLI callers can pass `fetchProfile`.
  const profile =
    input.profile ??
    (input.name && input.logoUrl
      ? null
      : ((await input.fetchProfile?.(handle)) ?? null));

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
