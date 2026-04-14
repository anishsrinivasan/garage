CREATE TABLE "car_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"variant" text,
	"year" integer NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"km_driven" integer,
	"fuel_type" text,
	"transmission" text,
	"owner_count" integer,
	"color" text,
	"body_type" text,
	"location" text,
	"city" text NOT NULL,
	"source_platform" text NOT NULL,
	"source_url" text NOT NULL,
	"source_listing_id" text,
	"seller_name" text,
	"seller_phone" text,
	"seller_type" text,
	"photos" jsonb DEFAULT '[]'::jsonb,
	"description" text,
	"listed_at" timestamp,
	"scraped_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"content_hash" text,
	"dedup_cluster_id" uuid
);
--> statement-breakpoint
CREATE TABLE "scrape_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_platform" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"listings_found" integer DEFAULT 0,
	"listings_new" integer DEFAULT 0,
	"listings_updated" integer DEFAULT 0,
	"listings_rejected" integer DEFAULT 0,
	"rejection_reasons" text,
	"error_message" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_source_url" ON "car_listings" USING btree ("source_platform","source_url");--> statement-breakpoint
CREATE INDEX "idx_city" ON "car_listings" USING btree ("city");--> statement-breakpoint
CREATE INDEX "idx_make_model" ON "car_listings" USING btree ("make","model");--> statement-breakpoint
CREATE INDEX "idx_price" ON "car_listings" USING btree ("price");--> statement-breakpoint
CREATE INDEX "idx_year" ON "car_listings" USING btree ("year");--> statement-breakpoint
CREATE INDEX "idx_scraped_at" ON "car_listings" USING btree ("scraped_at");--> statement-breakpoint
CREATE INDEX "idx_is_active" ON "car_listings" USING btree ("is_active");