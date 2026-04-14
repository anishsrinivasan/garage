ALTER TABLE "scrape_runs" ADD COLUMN IF NOT EXISTS "listings_rejected" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "scrape_runs" ADD COLUMN IF NOT EXISTS "rejection_reasons" text;
