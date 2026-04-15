import { uuid, text, timestamp } from "drizzle-orm/pg-core";
import { torqueSchema } from "./_schema";

export const listingReports = torqueSchema.table("listing_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  listingId: uuid("listing_id").notNull(),
  reportType: text("report_type").notNull(),
  description: text("description"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
