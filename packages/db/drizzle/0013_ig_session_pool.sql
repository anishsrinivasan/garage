-- Instagram session pool.
--
-- The scraper ran on one session file on one box. When it expired, every run
-- failed and nothing said so for fifteen weeks. One session is also one identity
-- to rate-limit: every handle shares it, so adding sources makes challenges
-- arrive sooner rather than later.
--
-- `state` holds Playwright storageState JSON. It is credential-equivalent —
-- anyone holding it can act as that Instagram account — so it stays in the
-- database, is never logged, and is not returned by any admin read path.

CREATE TABLE IF NOT EXISTS "torque"."ig_sessions" (
  "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "label"                text NOT NULL,
  "state"                text NOT NULL,
  "status"               text DEFAULT 'active' NOT NULL,
  -- Set when Instagram serves a checkpoint. A cold session is skipped until this
  -- passes, which is what stops the pool burning every identity in one run.
  "cooldown_until"       timestamp,
  "consecutive_failures" integer DEFAULT 0 NOT NULL,
  "last_used_at"         timestamp,
  "last_ok_at"           timestamp,
  "last_error"           text,
  "use_count"            integer DEFAULT 0 NOT NULL,
  "is_active"            boolean DEFAULT true NOT NULL,
  "created_at"           timestamp DEFAULT now() NOT NULL,
  "updated_at"           timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_ig_session_label" ON "torque"."ig_sessions" USING btree ("label");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ig_session_active" ON "torque"."ig_sessions" USING btree ("is_active","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ig_session_cooldown" ON "torque"."ig_sessions" USING btree ("cooldown_until");
