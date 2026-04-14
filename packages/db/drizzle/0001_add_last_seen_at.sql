ALTER TABLE "car_listings" ADD COLUMN "last_seen_at" timestamp;--> statement-breakpoint
CREATE INDEX "idx_platform_last_seen" ON "car_listings" USING btree ("source_platform","last_seen_at");
