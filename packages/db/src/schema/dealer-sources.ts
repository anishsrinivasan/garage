import {
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { torqueSchema } from "./_schema";

/**
 * A scrape source configuration — one strategy for harvesting listings
 * attributable to a specific garage. Multiple rows can point at the same
 * garage (e.g. Circuits99 via Instagram AND a future website scraper).
 *
 * Scrape-time fields only. Display fields (name, description, logo, phone…)
 * live on the garages table.
 *
 * source_type values:
 *   - "instagram_dealer"       — Instagram handle of a specific dealer
 *   - "marketplace_aggregator" — aggregator platform (Cars24, CarDekho, OLX)
 *   - "dealer_website"         — dealer's own site (future)
 */
export const dealerSources = torqueSchema.table(
  "dealer_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    garageId: uuid("garage_id").notNull(),
    platform: text("platform").notNull(),
    handle: text("handle").notNull(),
    sourceType: text("source_type").notNull().default("instagram_dealer"),
    config: jsonb("config").$type<Record<string, unknown>>().default({}),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    uniquePlatformHandle: uniqueIndex("uq_platform_handle").on(
      table.platform,
      table.handle,
    ),
    idxPlatform: index("idx_dealer_platform").on(table.platform),
    idxIsActive: index("idx_dealer_active").on(table.isActive),
    idxGarageId: index("idx_dealer_garage_id").on(table.garageId),
    idxSourceType: index("idx_dealer_source_type").on(table.sourceType),
  }),
);
