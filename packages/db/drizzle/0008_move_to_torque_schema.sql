-- Phase 2: move every Torque table out of `public` and into a dedicated
-- `torque` schema so the same PlanetScale Postgres database can host other
-- side projects in their own schemas without table-name collisions.
--
-- Idempotent: each ALTER is guarded so the migration is safe to re-run
-- (e.g. if it half-applied, or if you're starting from a fresh DB where the
-- tables were created directly under torque).
--
-- Foreign keys, indexes, primary keys, and sequences follow the table when
-- ALTER TABLE ... SET SCHEMA runs, so no extra bookkeeping is required.

CREATE SCHEMA IF NOT EXISTS "torque";
--> statement-breakpoint

DO $$
DECLARE
	tbl text;
	tables text[] := ARRAY[
		'car_listings',
		'dealer_sources',
		'garages',
		'llm_usage_logs',
		'scrape_runs',
		'scraped_posts'
	];
BEGIN
	FOREACH tbl IN ARRAY tables LOOP
		IF EXISTS (
			SELECT 1
			FROM information_schema.tables
			WHERE table_schema = 'public' AND table_name = tbl
		) THEN
			EXECUTE format('ALTER TABLE public.%I SET SCHEMA torque;', tbl);
		END IF;
	END LOOP;
END $$;
