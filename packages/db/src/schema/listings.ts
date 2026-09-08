/**
 * The core listing row, shared by every vertical.
 *
 * Domain-specific attributes live in listing_<vertical>_attrs and are reached
 * only through that vertical's loadAttrs/persistAttrs.
 */
import {
  uuid,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { appSchema } from "./_schema";

export const listings = appSchema.table(
  "listings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Which vertical this row belongs to: cars, rentals, resale. */
    vertical: text("vertical").notNull().default("cars"),
    cityId: uuid("city_id"),
    localityId: uuid("locality_id"),
    /** Cars are sold once; rent recurs. Both the ranking and the UI need this. */
    pricePeriod: text("price_period").notNull().default("once"),
    // --- car columns, retained for one release; listing_car_attrs is the
    // --- source of truth and a later migration drops these.
    make: text("make").notNull(),
    model: text("model").notNull(),
    variant: text("variant"),
    year: integer("year").notNull(),
    price: numeric("price", { precision: 12, scale: 2 }),
    listingStatus: text("listing_status").notNull().default("priced"),
    saleStatus: text("sale_status").notNull().default("available"),
    soldAt: timestamp("sold_at"),
    kmDriven: integer("km_driven"),
    fuelType: text("fuel_type"),
    transmission: text("transmission"),
    ownerCount: integer("owner_count"),
    color: text("color"),
    bodyType: text("body_type"),
    location: text("location"),
    city: text("city").notNull(),
    sourcePlatform: text("source_platform").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceListingId: text("source_listing_id"),
    sellerName: text("seller_name"),
    sellerPhone: text("seller_phone"),
    sellerType: text("seller_type"),
    dealerSourceId: uuid("dealer_source_id"),
    garageId: uuid("garage_id"),
    media: jsonb("media")
      .$type<
        Array<{
          url: string;
          type: "image" | "video";
          mimeType?: string | null;
          posterUrl?: string | null;
          source?: string | null;
          width?: number | null;
          height?: number | null;
          score?: number | null;
          scoreReason?: string | null;
        }>
      >()
      .default([]),
    description: text("description"),
    listedAt: timestamp("listed_at"),
    // scrapedAt was doing double duty as "first seen" and "last scraped", which
    // made freshness impossible to reason about. It is kept for compatibility;
    // firstSeenAt/lastSeenAt are the columns to use.
    scrapedAt: timestamp("scraped_at").notNull().defaultNow(),
    firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
    delistedAt: timestamp("delisted_at"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    isActive: boolean("is_active").notNull().default(true),
    /** Flagged by the price plausibility check; surfaced in the admin queue. */
    needsReview: boolean("needs_review").notNull().default(false),
    reviewReason: text("review_reason"),
    /** Admin override that wins over media[0] when picking the card image. */
    heroMediaUrl: text("hero_media_url"),
    contentHash: text("content_hash"),
    dedupClusterId: uuid("dedup_cluster_id"),
    /** True for the row that represents its dedup cluster in the feed. */
    isClusterHead: boolean("is_cluster_head").notNull().default(true),
  },
  (table) => ({
    uniqueSourceUrl: uniqueIndex("uq_source_url").on(
      table.sourcePlatform,
      table.sourceUrl
    ),
    idxCity: index("idx_city").on(table.city),
    idxMakeModel: index("idx_make_model").on(table.make, table.model),
    idxPrice: index("idx_price").on(table.price),
    idxYear: index("idx_year").on(table.year),
    idxScrapedAt: index("idx_scraped_at").on(table.scrapedAt),
    idxIsActive: index("idx_is_active").on(table.isActive),
    idxDealerSourceId: index("idx_car_listings_dealer_source_id").on(table.dealerSourceId),
    idxGarageId: index("idx_car_listings_garage_id").on(table.garageId),
    idxListingStatus: index("idx_car_listings_status").on(table.listingStatus),
    idxSaleStatus: index("idx_car_listings_sale_status").on(table.saleStatus),
    idxVertical: index("idx_listings_vertical").on(table.vertical),
    idxCityId: index("idx_listings_city_id").on(table.cityId),
    idxLocalityId: index("idx_listings_locality_id").on(table.localityId),
    idxVerticalFeed: index("idx_listings_vertical_feed").on(
      table.vertical,
      table.isActive,
      table.isClusterHead,
    ),
    idxLastSeenAt: index("idx_car_listings_last_seen_at").on(table.lastSeenAt),
    idxFirstSeenAt: index("idx_car_listings_first_seen_at").on(table.firstSeenAt),
    idxListedAt: index("idx_car_listings_listed_at").on(table.listedAt),
    idxNeedsReview: index("idx_car_listings_needs_review").on(table.needsReview),
    idxDedupCluster: index("idx_car_listings_dedup_cluster").on(table.dedupClusterId),
    // Covers the default feed predicate.
    idxActiveFeed: index("idx_car_listings_active_feed").on(
      table.isActive,
      table.isClusterHead,
      table.saleStatus,
    ),
  })
);
