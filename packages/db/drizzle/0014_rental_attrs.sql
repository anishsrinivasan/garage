-- Phase 3: the rentals vertical's attribute table.
--
-- Owned by the rentals vertical. Nothing in the pipeline reads it directly —
-- access goes through rentalsVertical.loadAttrs / persistAttrs, which is the
-- whole point of the split done in 0012.
--
-- Money is three separate columns, not one. Captions read "25k rent, 2L
-- deposit, 3k maintenance", and a deposit parsed as rent is the same bug class
-- that put a 4.5 crore car at the top of the feed. Stored as integer rupees:
-- rent is never fractional, and integers survive the move to SQLite intact.

CREATE TABLE IF NOT EXISTS "torque"."listing_rental_attrs" (
  "listing_id"        uuid PRIMARY KEY REFERENCES "torque"."listings"("id") ON DELETE CASCADE,

  -- Layout. `bhk` is null for studios and RK units, which `property_type`
  -- distinguishes; conflating them into "0 BHK" loses the difference.
  "bhk"               integer,
  "property_type"     text,          -- apartment | independent_house | villa | studio | rk | pg | commercial
  "carpet_area_sqft"  integer,
  "floor"             integer,
  "total_floors"      integer,

  -- Money, all in whole rupees per month except deposit which is a lump sum.
  "rent"              integer,
  "deposit"           integer,
  "maintenance"       integer,
  "maintenance_included" boolean,

  "furnishing"        text,          -- unfurnished | semi_furnished | fully_furnished
  "tenant_preference" text,          -- family | bachelors | bachelors_male | bachelors_female | company | any
  "parking"           text,          -- none | bike | car | both
  "available_from"    date,
  "amenities"         text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint

-- Rent range and BHK are the primary query path for every rental search, so they
-- get real indexes rather than living in a jsonb blob.
CREATE INDEX IF NOT EXISTS "idx_rental_attrs_rent" ON "torque"."listing_rental_attrs" USING btree ("rent");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rental_attrs_bhk" ON "torque"."listing_rental_attrs" USING btree ("bhk");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rental_attrs_furnishing" ON "torque"."listing_rental_attrs" USING btree ("furnishing");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rental_attrs_property_type" ON "torque"."listing_rental_attrs" USING btree ("property_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rental_attrs_bhk_rent" ON "torque"."listing_rental_attrs" USING btree ("bhk","rent");
