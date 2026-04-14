CREATE TABLE "llm_usage_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"operation" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cached_input_tokens" integer,
	"reasoning_tokens" integer,
	"total_tokens" integer,
	"latency_ms" integer,
	"success" boolean DEFAULT true NOT NULL,
	"error_message" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE INDEX "idx_llm_logs_created_at" ON "llm_usage_logs" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "idx_llm_logs_operation" ON "llm_usage_logs" USING btree ("operation");
--> statement-breakpoint
CREATE INDEX "idx_llm_logs_model" ON "llm_usage_logs" USING btree ("model");
--> statement-breakpoint
ALTER TABLE "dealer_sources" ADD COLUMN "slug" text;
--> statement-breakpoint
ALTER TABLE "dealer_sources" ADD COLUMN "description" text;
--> statement-breakpoint
ALTER TABLE "dealer_sources" ADD COLUMN "instagram_url" text;
--> statement-breakpoint
ALTER TABLE "dealer_sources" ADD COLUMN "logo_url" text;
--> statement-breakpoint
ALTER TABLE "dealer_sources" ADD COLUMN "socials" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_dealer_slug" ON "dealer_sources" USING btree ("slug");
--> statement-breakpoint
ALTER TABLE "car_listings" ALTER COLUMN "price" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "car_listings" ADD COLUMN "listing_status" text DEFAULT 'priced' NOT NULL;
--> statement-breakpoint
ALTER TABLE "car_listings" ADD COLUMN "dealer_source_id" uuid;
--> statement-breakpoint
CREATE INDEX "idx_car_listings_dealer_source_id" ON "car_listings" USING btree ("dealer_source_id");
--> statement-breakpoint
CREATE INDEX "idx_car_listings_status" ON "car_listings" USING btree ("listing_status");
--> statement-breakpoint
ALTER TABLE "scraped_posts" ADD COLUMN "is_reel" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "scraped_posts" ADD COLUMN "skip_reason" text;
--> statement-breakpoint
INSERT INTO "dealer_sources" ("platform", "handle", "slug", "display_name", "description", "website_url", "is_active")
VALUES
	('cars24', 'cars24', 'cars24', 'Cars24', 'Aggregated listings from Cars24 marketplace.', 'https://www.cars24.com', true),
	('cardekho', 'cardekho', 'cardekho', 'CarDekho', 'Aggregated listings from CarDekho marketplace.', 'https://www.cardekho.com', true),
	('olx', 'olx', 'olx', 'OLX India', 'Aggregated listings from OLX India.', 'https://www.olx.in', true)
ON CONFLICT ("platform", "handle") DO NOTHING;
--> statement-breakpoint
UPDATE "dealer_sources"
SET "slug" = lower(regexp_replace(coalesce("display_name", "handle"), '[^a-zA-Z0-9]+', '-', 'g'))
WHERE "slug" IS NULL;
