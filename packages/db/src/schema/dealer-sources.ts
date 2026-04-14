import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const dealerSources = pgTable(
  "dealer_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    platform: text("platform").notNull(),
    handle: text("handle").notNull(),
    displayName: text("display_name"),
    phone: text("phone"),
    city: text("city"),
    websiteUrl: text("website_url"),
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
  }),
);
