ALTER TABLE "car_listings" ADD COLUMN "media" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
UPDATE "car_listings"
SET "media" = (
	SELECT COALESCE(jsonb_agg(
		jsonb_build_object('url', p, 'type', 'image')
	), '[]'::jsonb)
	FROM jsonb_array_elements_text(COALESCE("photos", '[]'::jsonb)) AS p
)
WHERE "photos" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "car_listings" DROP COLUMN IF EXISTS "photos";
--> statement-breakpoint
ALTER TABLE "car_listings" ADD COLUMN "sale_status" text DEFAULT 'available' NOT NULL;
--> statement-breakpoint
ALTER TABLE "car_listings" ADD COLUMN "sold_at" timestamp;
--> statement-breakpoint
CREATE INDEX "idx_car_listings_sale_status" ON "car_listings" USING btree ("sale_status");
