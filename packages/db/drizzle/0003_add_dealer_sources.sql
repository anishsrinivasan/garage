CREATE TABLE "dealer_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"handle" text NOT NULL,
	"display_name" text,
	"phone" text,
	"city" text,
	"website_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_platform_handle" ON "dealer_sources" USING btree ("platform","handle");
--> statement-breakpoint
CREATE INDEX "idx_dealer_platform" ON "dealer_sources" USING btree ("platform");
--> statement-breakpoint
CREATE INDEX "idx_dealer_active" ON "dealer_sources" USING btree ("is_active");
