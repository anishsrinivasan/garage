-- Freshness tracking, review queue, dedup cluster heads, and better-auth tables.
--
-- `scraped_at` was doing double duty as both "first seen" and "last scraped",
-- which made it impossible to tell a genuinely new listing from one we happened
-- to re-read. Split it into first_seen_at / last_seen_at and add delisted_at so
-- the sweep has somewhere to record a disappearance.

ALTER TABLE "torque"."car_listings"
  ADD COLUMN IF NOT EXISTS "first_seen_at" timestamp,
  ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp,
  ADD COLUMN IF NOT EXISTS "delisted_at" timestamp,
  ADD COLUMN IF NOT EXISTS "needs_review" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "review_reason" text,
  ADD COLUMN IF NOT EXISTS "hero_media_url" text,
  ADD COLUMN IF NOT EXISTS "is_cluster_head" boolean DEFAULT true NOT NULL;
--> statement-breakpoint

-- first_seen_at genuinely is the old scraped_at. last_seen_at deliberately is
-- NOT back-filled from updated_at: for historical rows that timestamp records
-- when we last *wrote* the row, not when a scrape last *confirmed* the car
-- still existed. Seeding it from updated_at made the very first age sweep
-- retire 460 of 500 listings — every Instagram row included — purely because
-- the Instagram scraper had been failing for weeks. Seeding it to now() gives
-- every existing listing one full staleness window of grace, in which a real
-- scrape establishes the true value.
UPDATE "torque"."car_listings"
   SET "first_seen_at" = COALESCE("first_seen_at", "scraped_at", now()),
       "last_seen_at"  = COALESCE("last_seen_at", now());
--> statement-breakpoint

ALTER TABLE "torque"."car_listings"
  ALTER COLUMN "first_seen_at" SET DEFAULT now(),
  ALTER COLUMN "first_seen_at" SET NOT NULL,
  ALTER COLUMN "last_seen_at" SET DEFAULT now(),
  ALTER COLUMN "last_seen_at" SET NOT NULL;
--> statement-breakpoint

-- Marketplace adapters never populated listed_at, leaving 181 of 500 rows with
-- nothing to sort on. Seed it from first_seen_at so the date-aware feed has a
-- value for every row; future runs fill in the real publish date where the
-- source exposes one.
UPDATE "torque"."car_listings"
   SET "listed_at" = "first_seen_at"
 WHERE "listed_at" IS NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_car_listings_last_seen_at" ON "torque"."car_listings" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_car_listings_first_seen_at" ON "torque"."car_listings" USING btree ("first_seen_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_car_listings_listed_at" ON "torque"."car_listings" USING btree ("listed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_car_listings_needs_review" ON "torque"."car_listings" USING btree ("needs_review");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_car_listings_dedup_cluster" ON "torque"."car_listings" USING btree ("dedup_cluster_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_car_listings_active_feed" ON "torque"."car_listings" USING btree ("is_active","is_cluster_head","sale_status");--> statement-breakpoint

ALTER TABLE "torque"."scrape_runs"
  ADD COLUMN IF NOT EXISTS "trigger" text DEFAULT 'cli' NOT NULL,
  ADD COLUMN IF NOT EXISTS "listings_delisted" integer DEFAULT 0;
--> statement-breakpoint

ALTER TABLE "torque"."dealer_sources"
  ADD COLUMN IF NOT EXISTS "last_scraped_at" timestamp,
  ADD COLUMN IF NOT EXISTS "last_scrape_status" text,
  ADD COLUMN IF NOT EXISTS "last_scrape_error" text;
--> statement-breakpoint

-- Enum canonicalisation. Values were written in whatever casing the LLM or the
-- marketplace HTML used, so the filter sidebar rendered "Diesel" twice and
-- clicking one pill silently excluded the other's rows.
UPDATE "torque"."car_listings" SET "fuel_type" = lower(trim("fuel_type")) WHERE "fuel_type" IS NOT NULL;--> statement-breakpoint
UPDATE "torque"."car_listings" SET "transmission" = lower(trim("transmission")) WHERE "transmission" IS NOT NULL;--> statement-breakpoint
UPDATE "torque"."car_listings" SET "body_type" = lower(trim("body_type")) WHERE "body_type" IS NOT NULL;--> statement-breakpoint
UPDATE "torque"."car_listings" SET "color" = lower(trim("color")) WHERE "color" IS NOT NULL;--> statement-breakpoint

UPDATE "torque"."car_listings" SET "fuel_type" = 'cng' WHERE lower("fuel_type") IN ('petrol+cng','cng+petrol');--> statement-breakpoint
UPDATE "torque"."car_listings" SET "transmission" = 'automatic' WHERE lower("transmission") IN ('amt','cvt','dct','dsg','at','auto');--> statement-breakpoint
UPDATE "torque"."car_listings" SET "transmission" = 'manual' WHERE lower("transmission") IN ('mt','5mt','6mt');--> statement-breakpoint
UPDATE "torque"."car_listings" SET "body_type" = 'muv' WHERE lower("body_type") = 'mpv';--> statement-breakpoint
UPDATE "torque"."car_listings" SET "body_type" = 'suv' WHERE lower("body_type") = 'crossover';--> statement-breakpoint

-- Make canonicalisation. "Maruti" and "Maruti Suzuki" were separate brands as
-- far as search and filtering were concerned.
UPDATE "torque"."car_listings" SET "make" = 'Maruti Suzuki' WHERE lower(replace("make",' ','')) IN ('maruti','marutisuzuki','suzuki');--> statement-breakpoint
UPDATE "torque"."car_listings" SET "make" = 'Mercedes-Benz' WHERE lower(replace(replace("make",' ',''),'-','')) IN ('mercedesbenz','mercedes','merc');--> statement-breakpoint
UPDATE "torque"."car_listings" SET "make" = 'Kia' WHERE lower("make") = 'kia';--> statement-breakpoint
UPDATE "torque"."car_listings" SET "make" = 'Mini' WHERE lower("make") = 'mini';--> statement-breakpoint
UPDATE "torque"."car_listings" SET "make" = 'MG' WHERE lower(replace("make",' ','')) IN ('mg','mgmotor');--> statement-breakpoint
UPDATE "torque"."car_listings" SET "make" = 'Land Rover' WHERE lower(replace("make",' ','')) IN ('landrover','rangerover');--> statement-breakpoint
UPDATE "torque"."car_listings" SET "make" = 'Rolls-Royce' WHERE lower(replace(replace("make",' ',''),'-','')) = 'rollsroyce';--> statement-breakpoint
UPDATE "torque"."car_listings" SET "make" = 'BMW' WHERE lower("make") LIKE 'bmw%';--> statement-breakpoint
UPDATE "torque"."car_listings" SET "make" = 'Volkswagen' WHERE lower("make") IN ('vw','volkswagen');--> statement-breakpoint

-- Trim codes shouted in caps: "M340I" and "M340i" were two different models.
UPDATE "torque"."car_listings" SET "model" = 'M340i' WHERE upper("model") = 'M340I';--> statement-breakpoint

-- The two confirmed 10x lakh/crore parse errors. Both captions read "Lakhs";
-- the extractor stored crore. They sat at slots 1 and 2 of the home feed.
UPDATE "torque"."car_listings"
   SET "price" = "price" / 10,
       "needs_review" = true,
       "review_reason" = 'price corrected 10x by migration 0011'
 WHERE "source_url" IN (
   'https://www.instagram.com/tn33cars_/p/DYSAPQQn_D_/',
   'https://www.instagram.com/tn33cars_/p/DYSBixfHy7d/'
 )
   AND "price" > 20000000;
--> statement-breakpoint

-- better-auth tables for the admin dashboard. No public sign-up; accounts are
-- seeded with apps/admin/scripts/create-user.ts.
CREATE TABLE IF NOT EXISTS "torque"."user" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "email_verified" boolean DEFAULT false NOT NULL,
  "image" text,
  "role" text DEFAULT 'admin' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "torque"."session" (
  "id" text PRIMARY KEY NOT NULL,
  "expires_at" timestamp NOT NULL,
  "token" text NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "user_id" text NOT NULL REFERENCES "torque"."user"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "torque"."account" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "torque"."user"("id") ON DELETE CASCADE,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" timestamp,
  "refresh_token_expires_at" timestamp,
  "scope" text,
  "password" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "torque"."verification" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_email" ON "torque"."user" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_session_token" ON "torque"."session" USING btree ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_session_user_id" ON "torque"."session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_account_user_id" ON "torque"."account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_verification_identifier" ON "torque"."verification" USING btree ("identifier");
