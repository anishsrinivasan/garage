-- Phase 5: saved searches and alert delivery.
--
-- Search is one-shot; alerts are the retention loop. For rentals they are close
-- to the whole product — people hunt for a flat daily for a month, and nobody
-- hunts for a car that way.
--
-- The freshness engine is what makes these better than a portal's: matching runs
-- against first_seen_at, which is when the listing genuinely appeared, not when
-- a crawler happened to notice it. That distinction is the difference between a
-- useful alert and a spam generator.

CREATE TABLE IF NOT EXISTS "torque"."saved_searches" (
  "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  -- Nullable: an anonymous visitor can subscribe by email without an account,
  -- which is the whole point of a low-friction alert.
  "user_id"              text,
  "email"                text,
  "telegram_chat_id"     text,

  "vertical"             text NOT NULL,
  "city_id"              uuid REFERENCES "torque"."cities"("id") ON DELETE SET NULL,
  "label"                text NOT NULL,
  -- The same shape the search page produces, so a saved search is literally the
  -- filters someone was already looking at.
  "filters"              jsonb DEFAULT '{}'::jsonb NOT NULL,
  "channels"             text[] DEFAULT '{email}'::text[] NOT NULL,

  -- Rate limit per subscriber. Twenty matching flats in one run should be one
  -- digest, not twenty notifications.
  "min_interval_minutes" integer DEFAULT 60 NOT NULL,
  "last_matched_at"      timestamp,
  "last_notified_at"     timestamp,

  "is_active"            boolean DEFAULT true NOT NULL,
  "unsubscribe_token"    text NOT NULL,
  "created_at"           timestamp DEFAULT now() NOT NULL,
  "updated_at"           timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- One row per (search, listing) delivery. This table exists to guarantee we
-- never notify twice for the same listing, which is the failure mode that gets
-- an alert product muted and then deleted.
CREATE TABLE IF NOT EXISTS "torque"."alert_deliveries" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "saved_search_id" uuid NOT NULL REFERENCES "torque"."saved_searches"("id") ON DELETE CASCADE,
  "listing_id"      uuid NOT NULL REFERENCES "torque"."listings"("id") ON DELETE CASCADE,
  "channel"         text NOT NULL,
  "status"          text DEFAULT 'pending' NOT NULL,
  "error"           text,
  "created_at"      timestamp DEFAULT now() NOT NULL,
  "sent_at"         timestamp
);
--> statement-breakpoint

-- The uniqueness that makes duplicate notification impossible, enforced by the
-- database rather than by remembering to check.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_alert_delivery" ON "torque"."alert_deliveries" USING btree ("saved_search_id","listing_id","channel");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_alert_deliveries_pending" ON "torque"."alert_deliveries" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_saved_search_token" ON "torque"."saved_searches" USING btree ("unsubscribe_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_saved_searches_active" ON "torque"."saved_searches" USING btree ("is_active","vertical");
