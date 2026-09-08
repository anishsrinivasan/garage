import {
  uuid,
  text,
  integer,
  boolean,
  date,
  index,
} from "drizzle-orm/pg-core";
import { appSchema } from "./_schema";

/**
 * Rental attributes, owned by the rentals vertical.
 *
 * Money is three fields, not one. Captions read "25k rent, 2L deposit, 3k
 * maintenance", and a deposit parsed as rent is the same bug class that put a
 * ₹4.5 crore car at the top of the feed. Whole rupees, as integers: rent is
 * never fractional, and integers survive the move to SQLite intact.
 */
export const listingRentalAttrs = appSchema.table(
  "listing_rental_attrs",
  {
    listingId: uuid("listing_id").primaryKey(),

    /** Null for studios and RK units — `propertyType` carries that distinction. */
    bhk: integer("bhk"),
    propertyType: text("property_type"),
    carpetAreaSqft: integer("carpet_area_sqft"),
    floor: integer("floor"),
    totalFloors: integer("total_floors"),

    rent: integer("rent"),
    deposit: integer("deposit"),
    maintenance: integer("maintenance"),
    maintenanceIncluded: boolean("maintenance_included"),

    furnishing: text("furnishing"),
    tenantPreference: text("tenant_preference"),
    parking: text("parking"),
    availableFrom: date("available_from"),
    amenities: text("amenities").array().notNull().default([]),
  },
  (table) => ({
    idxRent: index("idx_rental_attrs_rent").on(table.rent),
    idxBhk: index("idx_rental_attrs_bhk").on(table.bhk),
    idxFurnishing: index("idx_rental_attrs_furnishing").on(table.furnishing),
    idxPropertyType: index("idx_rental_attrs_property_type").on(table.propertyType),
    idxBhkRent: index("idx_rental_attrs_bhk_rent").on(table.bhk, table.rent),
  }),
);
