import { uuid, text, integer, index } from "drizzle-orm/pg-core";
import { appSchema } from "./_schema";

/**
 * Car-specific attributes, split out of the core listing row.
 *
 * Owned by the cars vertical. Nothing in the pipeline may read this table
 * directly — it goes through `carsVertical.loadAttrs` / `persistAttrs`, which is
 * what lets a second vertical add its own table without the engine noticing.
 */
export const listingCarAttrs = appSchema.table(
  "listing_car_attrs",
  {
    listingId: uuid("listing_id").primaryKey(),
    make: text("make").notNull(),
    model: text("model").notNull(),
    variant: text("variant"),
    year: integer("year").notNull(),
    kmDriven: integer("km_driven"),
    fuelType: text("fuel_type"),
    transmission: text("transmission"),
    ownerCount: integer("owner_count"),
    color: text("color"),
    bodyType: text("body_type"),
  },
  (table) => ({
    idxMakeModel: index("idx_car_attrs_make_model").on(table.make, table.model),
    idxYear: index("idx_car_attrs_year").on(table.year),
    idxFuel: index("idx_car_attrs_fuel").on(table.fuelType),
    idxBody: index("idx_car_attrs_body").on(table.bodyType),
    idxTransmission: index("idx_car_attrs_transmission").on(table.transmission),
  }),
);
