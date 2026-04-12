import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";

export const scrapeRuns = pgTable("scrape_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourcePlatform: text("source_platform").notNull(),
  status: text("status").notNull().default("running"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  listingsFound: integer("listings_found").default(0),
  listingsNew: integer("listings_new").default(0),
  listingsUpdated: integer("listings_updated").default(0),
  errorMessage: text("error_message"),
});
