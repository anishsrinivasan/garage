-- A source belongs to a vertical.
--
-- Until now every dealer_source was implicitly cars. With rentals arriving, the
-- scraper has to know which extraction schema and prompt to use for a handle —
-- a car dealer and a rental broker are both "an Instagram handle", and nothing
-- in the row said which.

ALTER TABLE "torque"."dealer_sources"
  ADD COLUMN IF NOT EXISTS "vertical" text DEFAULT 'cars' NOT NULL;
--> statement-breakpoint

ALTER TABLE "torque"."garages"
  ADD COLUMN IF NOT EXISTS "vertical" text DEFAULT 'cars' NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_sources_vertical" ON "torque"."dealer_sources" USING btree ("vertical");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orgs_vertical" ON "torque"."garages" USING btree ("vertical");
