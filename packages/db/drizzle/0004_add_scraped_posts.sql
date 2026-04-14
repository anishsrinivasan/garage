CREATE TABLE "scraped_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"post_url" text NOT NULL,
	"handle" text,
	"is_car_listing" boolean DEFAULT false NOT NULL,
	"last_checked_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_scraped_platform_post_url" ON "scraped_posts" USING btree ("platform","post_url");
--> statement-breakpoint
CREATE INDEX "idx_scraped_last_checked_at" ON "scraped_posts" USING btree ("last_checked_at");
