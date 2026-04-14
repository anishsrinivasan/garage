CREATE TABLE "garages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'dealer' NOT NULL,
	"description" text,
	"city" text,
	"phone" text,
	"website_url" text,
	"instagram_url" text,
	"logo_url" text,
	"socials" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_garage_slug" ON "garages" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX "idx_garage_kind" ON "garages" USING btree ("kind");
--> statement-breakpoint
CREATE INDEX "idx_garage_city" ON "garages" USING btree ("city");
--> statement-breakpoint
CREATE INDEX "idx_garage_active" ON "garages" USING btree ("is_active");
--> statement-breakpoint
INSERT INTO "garages" ("slug", "name", "kind", "description", "website_url", "is_active")
VALUES
	('cars24', 'Cars24', 'marketplace', 'Aggregated listings from Cars24 marketplace.', 'https://www.cars24.com', true),
	('cardekho', 'CarDekho', 'marketplace', 'Aggregated listings from CarDekho marketplace.', 'https://www.cardekho.com', true),
	('olx', 'OLX India', 'marketplace', 'Aggregated listings from OLX India.', 'https://www.olx.in', true)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "garages" ("slug", "name", "kind", "city", "phone", "website_url", "is_active")
SELECT
	lower(regexp_replace(coalesce("display_name", "handle"), '[^a-zA-Z0-9]+', '-', 'g')),
	coalesce("display_name", "handle"),
	'dealer',
	"city",
	"phone",
	"website_url",
	"is_active"
FROM "dealer_sources"
WHERE "platform" NOT IN ('cars24', 'cardekho', 'olx')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
UPDATE "garages" g
SET "instagram_url" = 'https://www.instagram.com/' || ds.handle || '/'
FROM "dealer_sources" ds
WHERE ds.platform = 'instagram'
	AND lower(regexp_replace(coalesce(ds.display_name, ds.handle), '[^a-zA-Z0-9]+', '-', 'g')) = g.slug
	AND g.instagram_url IS NULL;
--> statement-breakpoint
ALTER TABLE "dealer_sources" ADD COLUMN "garage_id" uuid;
--> statement-breakpoint
ALTER TABLE "dealer_sources" ADD COLUMN "source_type" text;
--> statement-breakpoint
ALTER TABLE "dealer_sources" ADD COLUMN "config" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint
UPDATE "dealer_sources" ds
SET
	"garage_id" = g.id,
	"source_type" = CASE
		WHEN ds.platform = 'instagram' THEN 'instagram_dealer'
		WHEN ds.platform IN ('cars24', 'cardekho', 'olx') THEN 'marketplace_aggregator'
		ELSE 'other'
	END
FROM "garages" g
WHERE g.slug = CASE
	WHEN ds.platform IN ('cars24', 'cardekho', 'olx') THEN ds.platform
	ELSE lower(regexp_replace(coalesce(ds.display_name, ds.handle), '[^a-zA-Z0-9]+', '-', 'g'))
END;
--> statement-breakpoint
ALTER TABLE "dealer_sources" ALTER COLUMN "garage_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "dealer_sources" ALTER COLUMN "source_type" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "dealer_sources" ALTER COLUMN "source_type" SET DEFAULT 'instagram_dealer';
--> statement-breakpoint
ALTER TABLE "dealer_sources" ADD CONSTRAINT "dealer_sources_garage_id_fk" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON UPDATE no action ON DELETE restrict;
--> statement-breakpoint
CREATE INDEX "idx_dealer_garage_id" ON "dealer_sources" USING btree ("garage_id");
--> statement-breakpoint
CREATE INDEX "idx_dealer_source_type" ON "dealer_sources" USING btree ("source_type");
--> statement-breakpoint
ALTER TABLE "dealer_sources" DROP COLUMN IF EXISTS "slug";
--> statement-breakpoint
ALTER TABLE "dealer_sources" DROP COLUMN IF EXISTS "display_name";
--> statement-breakpoint
ALTER TABLE "dealer_sources" DROP COLUMN IF EXISTS "description";
--> statement-breakpoint
ALTER TABLE "dealer_sources" DROP COLUMN IF EXISTS "city";
--> statement-breakpoint
ALTER TABLE "dealer_sources" DROP COLUMN IF EXISTS "phone";
--> statement-breakpoint
ALTER TABLE "dealer_sources" DROP COLUMN IF EXISTS "website_url";
--> statement-breakpoint
ALTER TABLE "dealer_sources" DROP COLUMN IF EXISTS "instagram_url";
--> statement-breakpoint
ALTER TABLE "dealer_sources" DROP COLUMN IF EXISTS "logo_url";
--> statement-breakpoint
ALTER TABLE "dealer_sources" DROP COLUMN IF EXISTS "socials";
--> statement-breakpoint
ALTER TABLE "car_listings" ADD COLUMN "garage_id" uuid;
--> statement-breakpoint
ALTER TABLE "car_listings" ADD CONSTRAINT "car_listings_garage_id_fk" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON UPDATE no action ON DELETE set null;
--> statement-breakpoint
CREATE INDEX "idx_car_listings_garage_id" ON "car_listings" USING btree ("garage_id");
