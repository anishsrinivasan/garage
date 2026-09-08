import {
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { appSchema } from "./_schema";

export const scrapeRuns = appSchema.table("scrape_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourcePlatform: text("source_platform").notNull(),
  status: text("status").notNull().default("running"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  listingsFound: integer("listings_found").default(0),
  listingsNew: integer("listings_new").default(0),
  listingsUpdated: integer("listings_updated").default(0),
  listingsRejected: integer("listings_rejected").default(0),
  rejectionReasons: text("rejection_reasons"),
  errorMessage: text("error_message"),
  /** "cron" | "manual" | "cli" — so a failed nightly run is distinguishable. */
  trigger: text("trigger").notNull().default("cli"),
  listingsDelisted: integer("listings_delisted").default(0),
  metadata: jsonb("metadata"),
});
