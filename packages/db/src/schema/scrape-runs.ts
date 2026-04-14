import {
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { torqueSchema } from "./_schema";

export const scrapeRuns = torqueSchema.table("scrape_runs", {
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
  metadata: jsonb("metadata"),
});
