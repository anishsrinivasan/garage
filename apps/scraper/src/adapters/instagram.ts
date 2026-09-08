/**
 * Cars over Instagram.
 *
 * Now the same shape as the rentals adapter: collection, media handling, session
 * pooling and challenge detection all live in the shared collector and the
 * pipeline. What remains here is the mapping from an extraction result to a car
 * listing.
 *
 * This file went from ~900 lines to this. That reduction *is* the phase-0a
 * abstraction paying off, and the acceptance baseline is what proves the
 * behaviour did not change with it.
 */

import type {
  NormalizedListing,
  ScrapeError,
  ScrapeResult,
  ScraperAdapter,
  ScraperConfig,
} from "@classifieds/shared";
import { reconcilePrice, assessPrice } from "@classifieds/shared";
import { scoreAndOrderMedia } from "@classifieds/pipeline";
import { extractPostsBatch } from "@classifieds/verticals";
import {
  carsVertical,
  normalizeListingFields,
  type CarAttrs,
} from "@classifieds/verticals/cars";
import { INSTAGRAM_CONFIG } from "./instagram-config";
import {
  collectPosts,
  recordScrapedPosts,
  type BrokerInfo as DealerInfo,
  type CollectedPost,
} from "./instagram-collect";

export type { DealerInfo };

/** What the cars extraction prompt returns per post. */
type CarExtraction = {
  index: number;
  isCarListing: boolean;
  isSold: boolean;
  make: string | null;
  model: string | null;
  variant: string | null;
  year: number | null;
  price: number | null;
  kmDriven: number | null;
  fuelType: string | null;
  transmission: string | null;
  ownerCount: number | null;
  color: string | null;
  bodyType: string | null;
  sellerPhone: string | null;
};

async function toListing(
  extraction: CarExtraction,
  post: CollectedPost,
  dealer: DealerInfo,
): Promise<NormalizedListing | null> {
  if (
    !extraction.isCarListing ||
    !extraction.make ||
    !extraction.model ||
    !extraction.year
  ) {
    return null;
  }

  // The model gets lakh/crore wrong often enough that the caption is re-read
  // deterministically and preferred on a clean power-of-ten disagreement.
  const reconciled = reconcilePrice(extraction.price, post.caption);
  const normalized = normalizeListingFields({
    make: extraction.make,
    model: extraction.model,
    variant: extraction.variant,
    fuelType: extraction.fuelType,
    transmission: extraction.transmission,
    bodyType: extraction.bodyType,
    color: extraction.color,
    city: dealer.city ?? INSTAGRAM_CONFIG.city,
    sellerPhone: extraction.sellerPhone,
  });

  const plausibility = assessPrice(reconciled.price, {
    make: normalized.make,
    year: extraction.year,
  });
  const reviewReasons = [
    reconciled.corrected ? `price ${reconciled.reason}` : null,
    plausibility.plausible ? null : plausibility.reason,
  ].filter(Boolean) as string[];

  if (reconciled.corrected) {
    console.log(
      `[instagram] ${post.postUrl}: price corrected ${extraction.price} -> ${reconciled.price} (${reconciled.reason})`,
    );
  }

  const attrs: CarAttrs = {
    make: normalized.make,
    model: normalized.model,
    variant: normalized.variant,
    year: extraction.year,
    kmDriven: extraction.kmDriven,
    fuelType: normalized.fuelType,
    transmission: normalized.transmission,
    ownerCount: extraction.ownerCount,
    color: normalized.color,
    bodyType: normalized.bodyType,
  };

  // Score only posts that turned out to be listings — a third of what a dealer
  // posts is an announcement, and scoring those is wasted spend.
  const media = await scoreAndOrderMedia(post.candidates, {
    handle: dealer.handle,
    postUrl: post.postUrl,
    subjectLabel: [extraction.year, normalized.make, normalized.model]
      .filter(Boolean)
      .join(" "),
    systemPrompt: carsVertical.imageScoringPrompt,
  });

  return {
    vertical: "cars",
    attrs,
    make: normalized.make,
    model: normalized.model,
    variant: normalized.variant ?? undefined,
    year: extraction.year,
    price: reconciled.price,
    pricePeriod: "once",
    listingStatus: reconciled.price != null ? "priced" : "price_on_request",
    saleStatus: extraction.isSold ? "sold" : "available",
    soldAt: extraction.isSold ? new Date() : null,
    kmDriven: extraction.kmDriven ?? undefined,
    fuelType: normalized.fuelType ?? undefined,
    transmission: normalized.transmission ?? undefined,
    ownerCount: extraction.ownerCount ?? undefined,
    color: normalized.color ?? undefined,
    bodyType: normalized.bodyType ?? undefined,
    city: normalized.city ?? INSTAGRAM_CONFIG.city,
    sourcePlatform: "instagram",
    sourceUrl: post.postUrl,
    sourceListingId: post.shortcode ?? undefined,
    sellerName: dealer.displayName ?? `@${dealer.handle}`,
    sellerPhone: normalized.sellerPhone ?? undefined,
    sellerType: "dealer",
    dealerSourceId: dealer.dealerSourceId,
    garageId: dealer.garageId,
    media,
    description: post.caption || undefined,
    listedAt: post.timestamp ? new Date(post.timestamp) : undefined,
    needsReview: reviewReasons.length > 0,
    reviewReason: reviewReasons.join("; ") || null,
  };
}

export function createInstagramAdapter(dealers: DealerInfo[]): ScraperAdapter {
  const config: ScraperConfig = {
    name: INSTAGRAM_CONFIG.name,
    baseUrl: INSTAGRAM_CONFIG.baseUrl,
    city: INSTAGRAM_CONFIG.city,
    maxPages: INSTAGRAM_CONFIG.maxPages,
    rateLimit: INSTAGRAM_CONFIG.rateLimit,
  };

  return {
    name: "instagram",
    config,

    async scrape(): Promise<ScrapeResult> {
      const startTime = Date.now();
      const listings: NormalizedListing[] = [];
      const errors: ScrapeError[] = [];
      let totalFound = 0;

      const collected = await collectPosts(dealers, {
        onError: (error) => errors.push(error),
      });

      for (const [handle, posts] of collected) {
        const dealer = dealers.find((d) => d.handle === handle);
        if (!dealer || posts.length === 0) continue;
        totalFound += posts.length;

        let results: Array<CarExtraction | null>;
        try {
          results = await extractPostsBatch<CarExtraction>(
            carsVertical as never,
            posts.map((p) => ({
              postUrl: p.postUrl,
              caption: p.caption,
              images: p.llmImages,
            })),
            { handle },
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[instagram] @${handle}: extraction failed: ${message}`);
          errors.push({
            url: `${INSTAGRAM_CONFIG.baseUrl}/${handle}/`,
            message: `Batch LLM extraction failed: ${message}`,
            retryable: true,
          });
          continue;
        }

        let kept = 0;
        for (const [i, extraction] of results.entries()) {
          const post = posts[i];
          if (!extraction || !post) continue;
          const listing = await toListing(extraction, post, dealer);
          if (listing) {
            listings.push(listing);
            kept++;
          }
        }

        // Remember what was looked at, so the next run can skip it.
        await recordScrapedPosts(
          posts.map((post, i) => ({
            postUrl: post.postUrl,
            handle,
            isCarListing: Boolean(results[i]?.isCarListing),
          })),
        ).catch((err: unknown) =>
          console.warn(
            `[instagram] @${handle}: failed to record scraped_posts: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );

        console.log(`[instagram] @${handle}: ${kept}/${posts.length} kept as listings`);
      }

      return {
        listings,
        errors,
        metadata: {
          pagesScraped: dealers.length,
          totalFound,
          durationMs: Date.now() - startTime,
        },
      };
    },

    async healthCheck(): Promise<boolean> {
      return true;
    },
  };
}
