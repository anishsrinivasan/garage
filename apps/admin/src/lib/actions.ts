"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  carListings,
  garages,
  dealerSources,
  listingReports,
} from "@preowned-cars/db";
import {
  normalizeListingFields,
  assessPrice,
  parseIndianPrice,
} from "@preowned-cars/shared";
import { requireSession } from "./session";

/**
 * Mutating server actions for the dashboard.
 *
 * Every one of these calls `requireSession()` first. Middleware only does an
 * optimistic cookie check to avoid a dashboard flash; it is not the
 * authorisation boundary, and a server action can be invoked directly.
 */

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

function fail(err: unknown): ActionResult {
  return { ok: false, error: err instanceof Error ? err.message : String(err) };
}

/**
 * Tells the public site to drop its cached feed. Best-effort — the edit has
 * already been committed, and a caching hiccup must not surface as a failed
 * save.
 */
async function revalidateWeb(): Promise<void> {
  const url = process.env.WEB_REVALIDATE_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!url || !secret) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "x-revalidate-secret": secret },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // Public site keeps serving its cached copy until the timer expires.
  }
}

export async function updateListing(
  id: string,
  input: {
    make?: string;
    model?: string;
    variant?: string | null;
    year?: number;
    /** Accepts "45 lakhs", "₹45L", "4500000" — parsed the same way scrapes are. */
    price?: string | null;
    kmDriven?: number | null;
    fuelType?: string | null;
    transmission?: string | null;
    bodyType?: string | null;
    city?: string | null;
    saleStatus?: string;
    clearReview?: boolean;
  },
): Promise<ActionResult> {
  await requireSession();
  try {
    const current = await db
      .select()
      .from(carListings)
      .where(eq(carListings.id, id))
      .limit(1);
    const existing = current[0];
    if (!existing) return { ok: false, error: "Listing not found" };

    const normalized = normalizeListingFields({
      make: input.make ?? existing.make,
      model: input.model ?? existing.model,
      variant: input.variant ?? existing.variant,
      fuelType: input.fuelType ?? existing.fuelType,
      transmission: input.transmission ?? existing.transmission,
      bodyType: input.bodyType ?? existing.bodyType,
      color: existing.color,
      city: input.city ?? existing.city,
      sellerPhone: existing.sellerPhone,
    });

    let price: string | null = existing.price;
    if (input.price !== undefined) {
      if (input.price === null || input.price.trim() === "") {
        price = null;
      } else {
        const parsed = parseIndianPrice(input.price);
        if (parsed == null) {
          return { ok: false, error: `Could not read "${input.price}" as a price` };
        }
        price = String(parsed);
      }
    }

    const year = input.year ?? existing.year;
    const plausibility = assessPrice(price ? Number(price) : null, {
      make: normalized.make,
      year,
    });

    await db
      .update(carListings)
      .set({
        make: normalized.make,
        model: normalized.model,
        variant: normalized.variant,
        year,
        price,
        listingStatus: price != null ? "priced" : "price_on_request",
        kmDriven: input.kmDriven !== undefined ? input.kmDriven : existing.kmDriven,
        fuelType: normalized.fuelType,
        transmission: normalized.transmission,
        bodyType: normalized.bodyType,
        city: normalized.city ?? existing.city,
        saleStatus: input.saleStatus ?? existing.saleStatus,
        soldAt:
          (input.saleStatus ?? existing.saleStatus) === "sold"
            ? (existing.soldAt ?? new Date())
            : null,
        // An edit is a human confirming the row, so clear the flag unless the
        // price is still implausible.
        needsReview: input.clearReview ? !plausibility.plausible : existing.needsReview,
        reviewReason: input.clearReview
          ? (plausibility.reason ?? null)
          : existing.reviewReason,
        updatedAt: new Date(),
      })
      .where(eq(carListings.id, id));

    revalidatePath("/listings");
    revalidatePath("/review");
    await revalidateWeb();
    return { ok: true, message: "Listing updated" };
  } catch (err) {
    return fail(err);
  }
}

/** Manual override for the card image, for when the vision scorer picks badly. */
export async function setHeroMedia(
  id: string,
  url: string | null,
): Promise<ActionResult> {
  await requireSession();
  try {
    await db
      .update(carListings)
      .set({ heroMediaUrl: url, updatedAt: new Date() })
      .where(eq(carListings.id, id));
    revalidatePath("/listings");
    await revalidateWeb();
    return { ok: true, message: url ? "Hero image set" : "Hero override cleared" };
  } catch (err) {
    return fail(err);
  }
}

export async function setListingActive(
  ids: string[],
  isActive: boolean,
): Promise<ActionResult> {
  await requireSession();
  if (ids.length === 0) return { ok: false, error: "Nothing selected" };
  try {
    await db
      .update(carListings)
      .set({
        isActive,
        delistedAt: isActive ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(inArray(carListings.id, ids));
    revalidatePath("/listings");
    await revalidateWeb();
    return {
      ok: true,
      message: `${ids.length} listing(s) ${isActive ? "restored" : "delisted"}`,
    };
  } catch (err) {
    return fail(err);
  }
}

export async function clearReviewFlag(ids: string[]): Promise<ActionResult> {
  await requireSession();
  if (ids.length === 0) return { ok: false, error: "Nothing selected" };
  try {
    await db
      .update(carListings)
      .set({ needsReview: false, reviewReason: null, updatedAt: new Date() })
      .where(inArray(carListings.id, ids));
    revalidatePath("/review");
    await revalidateWeb();
    return { ok: true, message: `${ids.length} listing(s) approved` };
  } catch (err) {
    return fail(err);
  }
}

export async function upsertGarage(input: {
  id?: string;
  name: string;
  slug: string;
  city?: string | null;
  phone?: string | null;
  description?: string | null;
  websiteUrl?: string | null;
  instagramUrl?: string | null;
  logoUrl?: string | null;
  kind?: string;
  isActive?: boolean;
}): Promise<ActionResult> {
  await requireSession();
  if (!input.name.trim()) return { ok: false, error: "Name is required" };
  if (!input.slug.trim()) return { ok: false, error: "Slug is required" };

  try {
    const values = {
      name: input.name.trim(),
      slug: input.slug.trim(),
      city: input.city || null,
      phone: input.phone || null,
      description: input.description || null,
      websiteUrl: input.websiteUrl || null,
      instagramUrl: input.instagramUrl || null,
      logoUrl: input.logoUrl || null,
      kind: input.kind ?? "dealer",
      isActive: input.isActive ?? true,
      updatedAt: new Date(),
    };

    if (input.id) {
      await db.update(garages).set(values).where(eq(garages.id, input.id));
    } else {
      await db.insert(garages).values(values);
    }
    revalidatePath("/garages");
    await revalidateWeb();
    return { ok: true, message: input.id ? "Garage updated" : "Garage created" };
  } catch (err) {
    return fail(err);
  }
}

export async function setSourceActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  await requireSession();
  try {
    await db
      .update(dealerSources)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(dealerSources.id, id));
    revalidatePath("/sources");
    return { ok: true, message: isActive ? "Source enabled" : "Source paused" };
  } catch (err) {
    return fail(err);
  }
}

export async function setReportStatus(
  id: string,
  status: string,
): Promise<ActionResult> {
  await requireSession();
  try {
    await db
      .update(listingReports)
      .set({ status })
      .where(eq(listingReports.id, id));
    revalidatePath("/inbox");
    return { ok: true, message: `Report marked ${status}` };
  } catch (err) {
    return fail(err);
  }
}
