import { and, eq, sql } from "drizzle-orm";
import { db } from "@preowned-cars/db";
import { carListings, dealerSources, scrapeRuns } from "@preowned-cars/db";
import type { ScraperAdapter, NormalizedListing } from "@preowned-cars/shared";
import { createHash } from "crypto";
import { validateListing } from "./utils/validation";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

const platformDealerCache = new Map<
  string,
  { dealerSourceId: string; garageId: string } | null
>();

async function getAggregatorSource(
  platform: string,
): Promise<{ dealerSourceId: string; garageId: string } | null> {
  if (platformDealerCache.has(platform)) {
    return platformDealerCache.get(platform) ?? null;
  }
  const [row] = await db
    .select({
      dealerSourceId: dealerSources.id,
      garageId: dealerSources.garageId,
    })
    .from(dealerSources)
    .where(
      and(
        eq(dealerSources.platform, platform),
        eq(dealerSources.handle, platform),
      ),
    )
    .limit(1);
  const value = row ?? null;
  platformDealerCache.set(platform, value);
  return value;
}

function computeContentHash(listing: NormalizedListing): string {
  const key = `${listing.make}|${listing.model}|${listing.year}|${listing.price}|${listing.sourceUrl}`;
  return createHash("sha256").update(key).digest("hex");
}

async function upsertListings(listings: NormalizedListing[]): Promise<{ newCount: number; updatedCount: number }> {
  let newCount = 0;
  let updatedCount = 0;

  for (const listing of listings) {
    const contentHash = computeContentHash(listing);
    const priceValue = listing.price != null ? String(listing.price) : null;
    const listingStatus =
      listing.listingStatus ?? (listing.price != null ? "priced" : "price_on_request");
    const saleStatus = listing.saleStatus ?? "available";
    const soldAt =
      listing.soldAt ?? (saleStatus === "sold" ? new Date() : null);
    let dealerSourceId = listing.dealerSourceId ?? null;
    let garageId = listing.garageId ?? null;
    if (!dealerSourceId || !garageId) {
      const fallback = await getAggregatorSource(listing.sourcePlatform);
      if (fallback) {
        dealerSourceId ??= fallback.dealerSourceId;
        garageId ??= fallback.garageId;
      }
    }

    const result = await db
      .insert(carListings)
      .values({
        make: listing.make,
        model: listing.model,
        variant: listing.variant ?? null,
        year: listing.year!,
        price: priceValue,
        listingStatus,
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
        dealerSourceId,
        garageId,
        media: listing.media ?? [],
        description: listing.description ?? null,
        listedAt: listing.listedAt ?? null,
        saleStatus,
        soldAt,
        contentHash,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [carListings.sourcePlatform, carListings.sourceUrl],
        set: {
          price: priceValue,
          listingStatus,
          kmDriven: listing.kmDriven ?? null,
          media: listing.media ?? [],
          description: listing.description ?? null,
          dealerSourceId,
          garageId,
          saleStatus,
          // Only overwrite soldAt when the new value is non-null; don't reset
          // a previously-sold timestamp just because the new scrape omitted it.
          ...(soldAt ? { soldAt } : {}),
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

      const validListings: NormalizedListing[] = [];
      const rejectionReasons: string[] = [];

      for (const listing of result.listings) {
        const validation = validateListing(listing);
        if (validation.valid) {
          if (validation.sanitizedMedia) {
            listing.media = validation.sanitizedMedia;
          }
          validListings.push(listing);
        } else {
          const reason = `${listing.sourceUrl}: ${validation.errors.join(", ")}`;
          rejectionReasons.push(reason);
          console.warn(`[runner] ${adapter.name}: rejected listing — ${reason}`);
        }
      }

      const rejectedCount = result.listings.length - validListings.length;
      if (rejectedCount > 0) {
        console.log(
          `[runner] ${adapter.name}: ${rejectedCount} listing(s) rejected by validation`
        );
      }

      const { newCount, updatedCount } = await upsertListings(validListings);

      const hasErrors = result.errors.length > 0 || rejectedCount > 0;
      const errorParts: string[] = [];
      if (result.errors.length > 0) {
        errorParts.push(result.errors.map((e) => `${e.url}: ${e.message}`).join("\n"));
      }
      if (rejectionReasons.length > 0) {
        errorParts.push(`Validation rejections:\n${rejectionReasons.join("\n")}`);
      }

      await db
        .update(scrapeRuns)
        .set({
          status: hasErrors ? "completed_with_errors" : "completed",
          completedAt: new Date(),
          listingsFound: result.metadata.totalFound,
          listingsNew: newCount,
          listingsUpdated: updatedCount,
          listingsRejected: rejectedCount,
          rejectionReasons: rejectionReasons.length > 0 ? rejectionReasons.join("\n") : null,
          errorMessage: errorParts.length > 0 ? errorParts.join("\n\n") : null,
        })
        .where(eq(scrapeRuns.id, run!.id));

      console.log(
        `[runner] ${adapter.name}: done. ${newCount} new, ${updatedCount} updated, ${rejectedCount} rejected (${result.metadata.durationMs}ms)`
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
