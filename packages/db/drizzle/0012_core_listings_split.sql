-- Phase 0a: split car_listings into a generic core plus per-vertical attributes,
-- and give geography real tables.
--
-- 30 of car_listings' 40 columns were already domain-agnostic, so this is a
-- split rather than a rewrite. The 10 car-shaped columns are copied into
-- listing_car_attrs, which the cars vertical owns; nothing else in the pipeline
-- may read it.
--
-- Two things are deliberately NOT done here:
--
--   1. The car columns stay on `listings` for now. Splitting and dropping in one
--      migration leaves no way back if a read path was missed. A later migration
--      drops them once nothing reads them.
--   2. `garages` and `dealer_sources` keep their names. Renaming them to
--      organisations/sources is cosmetic until rentals exists to make the
--      current names read wrong, and it would touch ~50 call sites. Deferred to
--      phase 3, where the value is real.
--
-- There is no compatibility view. A view over a renamed table with aliased
-- duplicate columns is ambiguous to write through, and TypeScript already
-- catches a stale reference at build time — which is better safety than a view
-- that silently accepts the wrong write.

-- ---------------------------------------------------------------- geography
-- Needed for rentals regardless (Adyar, Velachery, OMR), and multi-city falls
-- out of it for free. Cities seed from the countries-states-cities dataset;
-- localities come from OpenStreetMap plus mining our own captions, because no
-- gazetteer contains "near Adyar signal".
CREATE TABLE IF NOT EXISTS "torque"."cities" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug"       text NOT NULL,
  "name"       text NOT NULL,
  "state"      text,
  "country"    text DEFAULT 'IN' NOT NULL,
  "latitude"   double precision,
  "longitude"  double precision,
  "is_active"  boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "torque"."localities" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "city_id"    uuid NOT NULL REFERENCES "torque"."cities"("id") ON DELETE CASCADE,
  "slug"       text NOT NULL,
  "name"       text NOT NULL,
  -- Broker slang and spelling variants: "Adayar", "Thiruvanmiyur ECR".
  "aliases"    text[] DEFAULT '{}'::text[] NOT NULL,
  "latitude"   double precision,
  "longitude"  double precision,
  "is_active"  boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_city_slug" ON "torque"."cities" USING btree ("country","slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_locality_slug" ON "torque"."localities" USING btree ("city_id","slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_locality_city" ON "torque"."localities" USING btree ("city_id");--> statement-breakpoint

INSERT INTO "torque"."cities" ("slug","name","state","country","latitude","longitude")
SELECT 'chennai','Chennai','Tamil Nadu','IN',13.0827,80.2707
WHERE NOT EXISTS (SELECT 1 FROM "torque"."cities" WHERE "slug"='chennai' AND "country"='IN');
--> statement-breakpoint

-- --------------------------------------------------------------- core table
ALTER TABLE "torque"."car_listings" RENAME TO "listings";--> statement-breakpoint

ALTER TABLE "torque"."listings"
  ADD COLUMN IF NOT EXISTS "vertical"     text DEFAULT 'cars' NOT NULL,
  ADD COLUMN IF NOT EXISTS "city_id"      uuid REFERENCES "torque"."cities"("id"),
  ADD COLUMN IF NOT EXISTS "locality_id"  uuid REFERENCES "torque"."localities"("id"),
  -- Cars are sold once; rent recurs. The ranking and the UI both need to know.
  ADD COLUMN IF NOT EXISTS "price_period" text DEFAULT 'once' NOT NULL;
--> statement-breakpoint

UPDATE "torque"."listings" l
   SET "city_id" = c."id"
  FROM "torque"."cities" c
 WHERE lower(l."city") = lower(c."name")
   AND l."city_id" IS NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_listings_vertical" ON "torque"."listings" USING btree ("vertical");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_listings_city_id" ON "torque"."listings" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_listings_locality_id" ON "torque"."listings" USING btree ("locality_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_listings_vertical_feed" ON "torque"."listings" USING btree ("vertical","is_active","is_cluster_head");--> statement-breakpoint

-- ------------------------------------------------- per-vertical attributes
CREATE TABLE IF NOT EXISTS "torque"."listing_car_attrs" (
  "listing_id"   uuid PRIMARY KEY REFERENCES "torque"."listings"("id") ON DELETE CASCADE,
  "make"         text NOT NULL,
  "model"        text NOT NULL,
  "variant"      text,
  "year"         integer NOT NULL,
  "km_driven"    integer,
  "fuel_type"    text,
  "transmission" text,
  "owner_count"  integer,
  "color"        text,
  "body_type"    text
);
--> statement-breakpoint

INSERT INTO "torque"."listing_car_attrs"
  ("listing_id","make","model","variant","year","km_driven","fuel_type","transmission","owner_count","color","body_type")
SELECT "id","make","model","variant","year","km_driven","fuel_type","transmission","owner_count","color","body_type"
  FROM "torque"."listings"
 WHERE "vertical" = 'cars'
    ON CONFLICT ("listing_id") DO NOTHING;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_car_attrs_make_model" ON "torque"."listing_car_attrs" USING btree ("make","model");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_car_attrs_year" ON "torque"."listing_car_attrs" USING btree ("year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_car_attrs_fuel" ON "torque"."listing_car_attrs" USING btree ("fuel_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_car_attrs_body" ON "torque"."listing_car_attrs" USING btree ("body_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_car_attrs_transmission" ON "torque"."listing_car_attrs" USING btree ("transmission");
