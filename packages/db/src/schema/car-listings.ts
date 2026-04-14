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
import { torqueSchema } from "./_schema";

export const carListings = torqueSchema.table(
  "car_listings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
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
        }>
      >()
      .default([]),
    description: text("description"),
    listedAt: timestamp("listed_at"),
    scrapedAt: timestamp("scraped_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    isActive: boolean("is_active").notNull().default(true),
    contentHash: text("content_hash"),
    dedupClusterId: uuid("dedup_cluster_id"),
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
  })
);
