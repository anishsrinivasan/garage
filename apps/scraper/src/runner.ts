import { eq, sql } from "drizzle-orm";
import { db } from "@preowned-cars/db";
import { carListings, scrapeRuns } from "@preowned-cars/db";
import type { ScraperAdapter, NormalizedListing } from "@preowned-cars/shared";
import { createHash } from "crypto";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

function computeContentHash(listing: NormalizedListing): string {
  const key = `${listing.make}|${listing.model}|${listing.year}|${listing.price}|${listing.sourceUrl}`;
  return createHash("sha256").update(key).digest("hex");
}

async function upsertListings(listings: NormalizedListing[]): Promise<{ newCount: number; updatedCount: number }> {
  let newCount = 0;
  let updatedCount = 0;

  for (const listing of listings) {
    const contentHash = computeContentHash(listing);

    const result = await db
      .insert(carListings)
      .values({
        make: listing.make,
        model: listing.model,
        variant: listing.variant ?? null,
        year: listing.year,
        price: String(listing.price),
        kmDriven: listing.kmDriven ?? null,
        fuelType: listing.fuelType ?? null,
        transmission: listing.transmission ?? null,
        ownerCount: listing.ownerCount ?? null,
        color: listing.color ?? null,
        bodyType: listing.bodyType ?? null,
        location: listing.location ?? null,
        city: listing.city,
        sourcePlatform: listing.sourcePlatform,
        sourceUrl: listing.sourceUrl,
        sourceListingId: listing.sourceListingId ?? null,
        sellerName: listing.sellerName ?? null,
        sellerPhone: listing.sellerPhone ?? null,
        sellerType: listing.sellerType ?? null,
        photos: listing.photos,
        description: listing.description ?? null,
        listedAt: listing.listedAt ?? null,
        contentHash,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [carListings.sourcePlatform, carListings.sourceUrl],
        set: {
          price: String(listing.price),
          kmDriven: listing.kmDriven ?? null,
          photos: listing.photos,
          description: listing.description ?? null,
          isActive: true,
          updatedAt: new Date(),
          contentHash,
        },
      })
      .returning({ id: carListings.id, updatedAt: carListings.updatedAt });

    if (result.length > 0) {
      const row = result[0]!;
      const isNew = row.updatedAt.getTime() - Date.now() < 1000;
      if (isNew) newCount++;
      else updatedCount++;
    }
  }

  return { newCount, updatedCount };
}

export async function runAdapter(adapter: ScraperAdapter): Promise<void> {
  console.log(`[runner] Starting ${adapter.name} scraper...`);

  const [run] = await db
    .insert(scrapeRuns)
    .values({
      sourcePlatform: adapter.name,
      status: "running",
    })
    .returning();

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await adapter.scrape();

      console.log(
        `[runner] ${adapter.name}: found ${result.listings.length} listings, ${result.errors.length} errors`
      );

      const { newCount, updatedCount } = await upsertListings(result.listings);

      await db
        .update(scrapeRuns)
        .set({
          status: result.errors.length > 0 ? "completed_with_errors" : "completed",
          completedAt: new Date(),
          listingsFound: result.metadata.totalFound,
          listingsNew: newCount,
          listingsUpdated: updatedCount,
          errorMessage:
            result.errors.length > 0
              ? result.errors.map((e) => `${e.url}: ${e.message}`).join("\n")
              : null,
        })
        .where(eq(scrapeRuns.id, run!.id));

      console.log(
        `[runner] ${adapter.name}: done. ${newCount} new, ${updatedCount} updated (${result.metadata.durationMs}ms)`
      );
      return;
    } catch (err) {
      lastError = err as Error;
      console.error(
        `[runner] ${adapter.name}: attempt ${attempt}/${MAX_RETRIES} failed: ${lastError.message}`
      );
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
      }
    }
  }

  await db
    .update(scrapeRuns)
    .set({
      status: "failed",
      completedAt: new Date(),
      errorMessage: lastError?.message ?? "Unknown error",
    })
    .where(eq(scrapeRuns.id, run!.id));

  console.error(`[runner] ${adapter.name}: all retries exhausted`);
}
