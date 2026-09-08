/**
 * Rentals over Instagram.
 *
 * Deliberately thin. Everything hard — session pooling, challenge detection,
 * scoped media extraction, reel frame cutting, vision scoring, R2 — lives in
 * @classifieds/pipeline and is shared with cars unchanged. What is left here
 * is the mapping from an extraction result to a listing, which is the only part
 * that is actually about renting flats.
 *
 * If this file had to be long, the abstraction would have been wrong.
 */

import { eq } from "drizzle-orm";
import { db, cities } from "@classifieds/db";
import type {
  NormalizedListing,
  ScrapeError,
  ScrapeResult,
  ScraperAdapter,
  ScraperConfig,
} from "@classifieds/shared";
import { extractPostsBatch } from "@classifieds/verticals";
import { scoreAndOrderMedia } from "@classifieds/pipeline";
import {
  rentalsVertical,
  resolveLocality,
  type RentalAttrs,
  type RentalExtraction,
} from "@classifieds/verticals/rentals";
import { INSTAGRAM_CONFIG } from "./instagram-config";
import { collectPosts, type BrokerInfo, type CollectedPost } from "./instagram-collect";

/**
 * Turns one extraction into a listing, or null when it isn't one.
 *
 * The money reconciliation and the plausibility check both run here rather than
 * in the runner, because both are vertical knowledge and the runner has none.
 */
async function toListing(
  extraction: RentalExtraction,
  post: CollectedPost,
  broker: BrokerInfo,
  cityId: string | null,
): Promise<NormalizedListing | null> {
  if (!extraction.isRentalListing) return null;

  const attrs: RentalAttrs = rentalsVertical.normalize({
    bhk: extraction.bhk,
    propertyType: extraction.propertyType,
    carpetAreaSqft: extraction.carpetAreaSqft,
    floor: extraction.floor,
    totalFloors: extraction.totalFloors,
    rent: extraction.rent,
    deposit: extraction.deposit,
    maintenance: extraction.maintenance,
    maintenanceIncluded: extraction.maintenanceIncluded,
    furnishing: extraction.furnishing,
    tenantPreference: extraction.tenantPreference,
    parking: extraction.parking,
    availableFrom: extraction.availableFrom,
    amenities: extraction.amenities ?? [],
  });

  const reconciled = rentalsVertical.reconcileMoney(attrs, post.caption);
  const plausibility = rentalsVertical.assessPlausibility(
    reconciled.attrs,
    reconciled.attrs.rent,
  );

  const reviewReasons = [
    reconciled.corrected ? `money ${reconciled.reason}` : null,
    plausibility.plausible ? null : plausibility.reason,
  ].filter(Boolean) as string[];

  if (reconciled.corrected) {
    console.log(`[rentals] ${post.postUrl}: ${reconciled.reason}`);
  }

  // Resolve the free-text location. A miss is fine and expected — it lands in
  // the admin's unmatched queue, which is a better outcome than a wrong guess.
  const locality = cityId
    ? await resolveLocality(cityId, extraction.locationText, post.caption)
    : null;

  // Score images only for posts that turned out to be rentals; roughly a third
  // of what a broker posts is an announcement, and scoring those is wasted spend.
  const media = await scoreAndOrderMedia(post.candidates, {
    handle: broker.handle,
    postUrl: post.postUrl,
    subjectLabel: rentalsVertical.title(
      { city: broker.city ?? INSTAGRAM_CONFIG.city, locationText: extraction.locationText } as never,
      reconciled.attrs,
    ),
    systemPrompt: rentalsVertical.imageScoringPrompt,
  });

  return {
    vertical: "rentals",
    attrs: reconciled.attrs,
    // Rent lives on the core row too, so ranking and price filters work without
    // the engine knowing what a rental is.
    price: reconciled.attrs.rent,
    pricePeriod: "month",
    listingStatus: reconciled.attrs.rent != null ? "priced" : "price_on_request",
    saleStatus: extraction.isRented ? "sold" : "available",
    soldAt: extraction.isRented ? new Date() : null,

    cityId,
    localityId: locality?.localityId ?? null,
    locationText: extraction.locationText ?? null,
    location: extraction.locationText ?? undefined,
    city: broker.city ?? INSTAGRAM_CONFIG.city,

    // The core row still carries make/model/year for the shared upsert path.
    // For rentals they are a human label, not vehicle data.
    make: rentalsVertical.title(
      { city: broker.city ?? INSTAGRAM_CONFIG.city, locationText: extraction.locationText } as never,
      reconciled.attrs,
    ),
    model: extraction.locationText?.trim() || (broker.city ?? INSTAGRAM_CONFIG.city),
    year: new Date(post.timestamp ?? Date.now()).getFullYear(),

    sourcePlatform: "instagram",
    sourceUrl: post.postUrl,
    sourceListingId: post.shortcode ?? undefined,
    sellerName: broker.displayName ?? `@${broker.handle}`,
    sellerPhone: extraction.contactPhone ?? undefined,
    sellerType: "broker",
    dealerSourceId: broker.dealerSourceId,
    garageId: broker.garageId,

    media,
    description: post.caption || undefined,
    listedAt: post.timestamp ? new Date(post.timestamp) : undefined,

    needsReview: reviewReasons.length > 0,
    reviewReason: reviewReasons.join("; ") || null,
  };
}

export function createInstagramRentalsAdapter(brokers: BrokerInfo[]): ScraperAdapter {
  const config: ScraperConfig = {
    name: "instagram-rentals",
    baseUrl: INSTAGRAM_CONFIG.baseUrl,
    city: INSTAGRAM_CONFIG.city,
    maxPages: INSTAGRAM_CONFIG.maxPages,
    rateLimit: INSTAGRAM_CONFIG.rateLimit,
  };

  return {
    name: "instagram-rentals",
    config,

    async scrape(): Promise<ScrapeResult> {
      const startTime = Date.now();
      const listings: NormalizedListing[] = [];
      const errors: ScrapeError[] = [];

      const [city] = await db
        .select({ id: cities.id })
        .from(cities)
        .where(eq(cities.slug, "chennai"))
        .limit(1);
      const cityId = city?.id ?? null;
      if (!cityId) {
        console.warn(
          "[rentals] no Chennai city row — localities will not resolve. Run migration 0012.",
        );
      }

      const collected = await collectPosts(brokers, {
        onError: (error) => errors.push(error),
      });

      for (const [handle, posts] of collected) {
        const broker = brokers.find((b) => b.handle === handle);
        if (!broker || posts.length === 0) continue;

        console.log(`[rentals] @${handle}: extracting ${posts.length} post(s)`);
        let results: Array<RentalExtraction | null>;
        try {
          results = await extractPostsBatch<RentalExtraction>(
            rentalsVertical as never,
            posts.map((p) => ({
              postUrl: p.postUrl,
              caption: p.caption,
              images: p.llmImages,
            })),
            { handle },
          );
        } catch (err) {
          errors.push({
            url: `${INSTAGRAM_CONFIG.baseUrl}/${handle}/`,
            message: `Extraction failed: ${err instanceof Error ? err.message : String(err)}`,
            retryable: true,
          });
          continue;
        }

        let kept = 0;
        for (const [i, extraction] of results.entries()) {
          const post = posts[i];
          if (!extraction || !post) continue;
          const listing = await toListing(extraction, post, broker, cityId);
          if (listing) {
            listings.push(listing);
            kept++;
          }
        }
        console.log(`[rentals] @${handle}: ${kept}/${posts.length} kept as rentals`);
      }

      return {
        listings,
        errors,
        metadata: {
          pagesScraped: brokers.length,
          totalFound: listings.length,
          durationMs: Date.now() - startTime,
        },
      };
    },

    async healthCheck(): Promise<boolean> {
      return true;
    },
  };
}
