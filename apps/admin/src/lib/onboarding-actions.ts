"use server";

import { revalidatePath } from "next/cache";
import {
  fetchInstagramProfile,
  createGarageFromInstagram,
  normalizeHandle,
  slugify,
  guessCityFromBio,
  extractPhoneFromBio,
  type InstagramProfile,
} from "@classifieds/scraper/onboarding";
import { requireSession } from "./session";
import { triggerScrape } from "./cron-client";

/**
 * Adding a garage from an Instagram handle.
 *
 * Two steps on purpose: preview, then confirm. Fetching the profile takes a few
 * seconds of headless browser time and occasionally comes back empty (private
 * account, rate limit), so the operator sees what we found and can correct it
 * before anything is written.
 */

export type PreviewResult =
  | { ok: true; profile: InstagramProfile; suggested: SuggestedGarage }
  | { ok: false; error: string };

export type SuggestedGarage = {
  handle: string;
  name: string;
  slug: string;
  city: string | null;
  phone: string | null;
  description: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
};

export async function previewInstagramGarage(
  rawHandle: string,
): Promise<PreviewResult> {
  await requireSession();
  const handle = normalizeHandle(rawHandle);
  if (!handle) return { ok: false, error: "Enter an Instagram handle or profile URL" };

  const profile = await fetchInstagramProfile(handle);
  if (!profile.exists) {
    return {
      ok: false,
      error: `Couldn't load @${handle}. It may not exist, or the scraper's Instagram session has expired.`,
    };
  }

  const name = profile.displayName ?? handle;
  return {
    ok: true,
    profile,
    suggested: {
      handle,
      name,
      slug: slugify(name) || handle,
      city: guessCityFromBio(profile.bio),
      phone: extractPhoneFromBio(profile.bio),
      description: profile.bio,
      websiteUrl: profile.externalUrl,
      logoUrl: profile.avatarUrl,
    },
  };
}

export type CreateResult =
  | { ok: true; slug: string; created: boolean; scrapeQueued: boolean; note?: string }
  | { ok: false; error: string };

export async function createInstagramGarage(input: {
  handle: string;
  name: string;
  slug: string;
  city?: string | null;
  phone?: string | null;
  description?: string | null;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  scrapeNow?: boolean;
}): Promise<CreateResult> {
  await requireSession();
  try {
    const result = await createGarageFromInstagram(input);

    let scrapeQueued = false;
    let note: string | undefined;
    if (input.scrapeNow) {
      const triggered = await triggerScrape({
        sources: ["instagram"],
        handles: [input.handle],
      });
      scrapeQueued = triggered.ok;
      // The garage exists either way; say so rather than implying the whole
      // operation failed because the cron service was unreachable.
      if (!triggered.ok) note = `Garage saved, but the scrape wasn't queued: ${triggered.error}`;
    }

    revalidatePath("/garages");
    revalidatePath("/sources");
    return { ok: true, slug: result.slug, created: result.created, scrapeQueued, note };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
