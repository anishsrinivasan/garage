import {
  uuid,
  text,
  boolean,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { torqueSchema } from "./_schema";

/**
 * Cities and localities as real tables rather than a text column.
 *
 * Rentals need this regardless — every rental search is filtered by locality,
 * and "Adyar" / "adyar" / "Adayar" / "near Adyar signal" must collapse to one
 * filter the way make and model already do. Multi-city then falls out for free.
 */
export const cities = torqueSchema.table(
  "cities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    state: text("state"),
    country: text("country").notNull().default("IN"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    uniqueSlug: uniqueIndex("uq_city_slug").on(table.country, table.slug),
  }),
);

export const localities = torqueSchema.table(
  "localities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cityId: uuid("city_id").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    /** Broker slang and spelling variants no gazetteer contains. */
    aliases: text("aliases").array().notNull().default([]),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    uniqueSlug: uniqueIndex("uq_locality_slug").on(table.cityId, table.slug),
    idxCity: index("idx_locality_city").on(table.cityId),
  }),
);
