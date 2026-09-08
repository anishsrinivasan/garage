import { and, eq, sql } from "drizzle-orm";
import { db } from "@preowned-cars/db";
import { listings, dealerSources, scrapeRuns } from "@preowned-cars/db";
import type { ScraperAdapter, NormalizedListing } from "@preowned-cars/shared";
import { assessPrice } from "@preowned-cars/shared";
import { normalizeListingFields } from "@preowned-cars/verticals/cars";
import { createHash } from "crypto";
import { validateListing } from "./utils/validation";
import { delistUnseen, reactivate } from "@preowned-cars/pipeline";
import { rebuildDedupeClusters } from "./dedupe-runner";
import { findAggregatorSourceId, recordSourceRun } from "@preowned-cars/pipeline";

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

/**
 * Fingerprints the car, not the post. The URL used to be part of the key, which
 * made every hash unique by construction and left the column useless for
 * spotting the same car reposted under a new URL.
 */
function computeContentHash(listing: NormalizedListing): string {
  const key = [
    listing.make.toLowerCase(),
    listing.model.toLowerCase(),
    listing.year,
    listing.kmDriven ?? "na",
    listing.price ?? "na",
    listing.garageId ?? listing.sourcePlatform,
  ].join("|");
  return createHash("sha256").update(key).digest("hex");
}

async function upsertListings(incoming: NormalizedListing[]): Promise<{ newCount: number; updatedCount: number }> {
  let newCount = 0;
  let updatedCount = 0;

  const now = new Date();

  for (const raw of incoming) {
    // Canonicalise on the way in so the filter sidebar never grows a second
    // "Diesel" pill again, whichever adapter produced the row.
    const normalized = normalizeListingFields(raw);
    const listing: NormalizedListing = {
      ...raw,
      make: normalized.make,
      model: normalized.model,
      variant: normalized.variant ?? undefined,
      fuelType: normalized.fuelType ?? undefined,
      transmission: normalized.transmission ?? undefined,
      bodyType: normalized.bodyType ?? undefined,
      color: normalized.color ?? undefined,
      city: normalized.city ?? raw.city,
      sellerPhone: normalized.sellerPhone ?? undefined,
    };

    const plausibility = assessPrice(listing.price, listing);
    const reviewReasons = [
      listing.reviewReason ?? null,
      plausibility.plausible ? null : plausibility.reason,
    ].filter(Boolean) as string[];
    const needsReview = Boolean(listing.needsReview) || reviewReasons.length > 0;

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
      .insert(listings)
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
        firstSeenAt: now,
        lastSeenAt: now,
        delistedAt: null,
        needsReview,
        reviewReason: reviewReasons.join("; ") || null,
      })
      .onConflictDoUpdate({
        target: [listings.sourcePlatform, listings.sourceUrl],
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
          // firstSeenAt is deliberately NOT in the update set — it is the one
          // column that must survive a re-scrape for freshness to mean anything.
          lastSeenAt: now,
          delistedAt: null,
          needsReview,
          reviewReason: reviewReasons.join("; ") || null,
          updatedAt: now,
          contentHash,
        },
      })
      .returning({
        id: listings.id,
        firstSeenAt: listings.firstSeenAt,
      });

    if (result.length > 0) {
      const row = result[0]!;
      // A row inserted by this statement has firstSeenAt === now; one that
      // already existed keeps its original value.
      if (Math.abs(row.firstSeenAt.getTime() - now.getTime()) < 1000) newCount++;
      else updatedCount++;
    }
  }

  return { newCount, updatedCount };
}

export type RunOptions = {
  /** "cron" | "manual" | "cli" — recorded so a failed nightly run is findable. */
  trigger?: string;
  /** Skip the delist sweep, e.g. for a targeted single-dealer re-scrape. */
  skipDelist?: boolean;
  /** Skip cluster rebuild when several adapters run back to back. */
  skipDedupe?: boolean;
};

export async function runAdapter(
  adapter: ScraperAdapter,
  options: RunOptions = {},
): Promise<void> {
  console.log(`[runner] Starting ${adapter.name} scraper...`);

  const [run] = await db
    .insert(scrapeRuns)
    .values({
      sourcePlatform: adapter.name,
      status: "running",
      trigger: options.trigger ?? "cli",
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

      // Instagram records per-handle status inside its own adapter, since one
      // run covers many dealers. Marketplaces have a single aggregator source,
      // so the runner records it here.
      if (adapter.name !== "instagram") {
        await recordSourceRun(
          await findAggregatorSourceId(adapter.name),
          validListings.length > 0 ? "ok" : "empty",
        );
      }

      // Anything this source used to carry but didn't produce this run has
      // most likely sold or been taken down. The sweep is coverage-guarded so a
      // degraded run can't wipe a healthy source.
      const seenUrls = validListings.map((l) => l.sourceUrl);
      await reactivate(seenUrls);
      let delistedCount = 0;
      if (!options.skipDelist) {
        const sweep = await delistUnseen(adapter.name, seenUrls);
        delistedCount = sweep.delisted;
        if (sweep.skipped) {
          console.warn(`[runner] ${adapter.name}: delist sweep skipped — ${sweep.reason}`);
        }
      }

      if (!options.skipDedupe) {
        await rebuildDedupeClusters().catch((err) =>
          console.warn(
            `[runner] ${adapter.name}: dedupe failed — ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }

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
          listingsDelisted: delistedCount,
          rejectionReasons: rejectionReasons.length > 0 ? rejectionReasons.join("\n") : null,
          errorMessage: errorParts.length > 0 ? errorParts.join("\n\n") : null,
        })
        .where(eq(scrapeRuns.id, run!.id));

      console.log(
        `[runner] ${adapter.name}: done. ${newCount} new, ${updatedCount} updated, ${rejectedCount} rejected, ${delistedCount} delisted (${result.metadata.durationMs}ms)`
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

  if (adapter.name !== "instagram") {
    await recordSourceRun(
      await findAggregatorSourceId(adapter.name),
      "failed",
      lastError?.message ?? "Unknown error",
    );
  }

  console.error(`[runner] ${adapter.name}: all retries exhausted`);
}
