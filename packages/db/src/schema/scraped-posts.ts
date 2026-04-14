import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const scrapedPosts = pgTable(
  "scraped_posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    platform: text("platform").notNull(),
    postUrl: text("post_url").notNull(),
    handle: text("handle"),
    isCarListing: boolean("is_car_listing").notNull().default(false),
    lastCheckedAt: timestamp("last_checked_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    uniquePlatformPostUrl: uniqueIndex("uq_scraped_platform_post_url").on(
      table.platform,
      table.postUrl,
    ),
    idxLastCheckedAt: index("idx_scraped_last_checked_at").on(table.lastCheckedAt),
  }),
);
