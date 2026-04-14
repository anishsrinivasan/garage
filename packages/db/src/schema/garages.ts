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
 * Garages represent a real-world business entity — an independent dealer
 * (Circuits99, BigBoyz) or a marketplace brand (Cars24, CarDekho, OLX).
 *
 * A garage can have MANY dealer_sources (e.g. an Instagram handle plus a
 * future custom website scraper). Each car_listing is tagged with the garage
 * that actually owns the car, independent of which source we scraped it from.
 */
export const garages = torqueSchema.table(
  "garages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("dealer"),
    description: text("description"),
    city: text("city"),
    phone: text("phone"),
    websiteUrl: text("website_url"),
    instagramUrl: text("instagram_url"),
    logoUrl: text("logo_url"),
    socials: jsonb("socials").$type<Record<string, string>>().default({}),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    uniqueSlug: uniqueIndex("uq_garage_slug").on(table.slug),
    idxKind: index("idx_garage_kind").on(table.kind),
    idxCity: index("idx_garage_city").on(table.city),
    idxIsActive: index("idx_garage_active").on(table.isActive),
  }),
);
