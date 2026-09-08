import {
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { appSchema } from "./_schema";

/**
 * Instagram session pool.
 *
 * The scraper ran on one session file on one box. When that session expired the
 * runs failed silently for fifteen weeks. One session is also one identity to
 * rate-limit: every handle we scrape shares it, so the more sources we add the
 * faster it gets challenged.
 *
 * Storage-state JSON lives in `state`. It is credential-equivalent — anyone
 * holding it can act as that Instagram account — so it never leaves the
 * database, never gets logged, and is not returned by any admin read path.
 */
export const igSessions = appSchema.table(
  "ig_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Human label, e.g. the account handle. Safe to display. */
    label: text("label").notNull(),
    /** Playwright storageState JSON. Never render this. */
    state: text("state").notNull(),

    status: text("status").notNull().default("active"),
    /**
     * Set when Instagram serves a checkpoint or login wall. A cold session is
     * skipped until `cooldownUntil` passes, which is what stops the pool
     * burning every identity in one run.
     */
    cooldownUntil: timestamp("cooldown_until"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),

    lastUsedAt: timestamp("last_used_at"),
    lastOkAt: timestamp("last_ok_at"),
    lastError: text("last_error"),
    /** Rough usage counter, for spreading load rather than always picking one. */
    useCount: integer("use_count").notNull().default(0),

    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    uniqueLabel: uniqueIndex("uq_ig_session_label").on(table.label),
    idxActive: index("idx_ig_session_active").on(table.isActive, table.status),
    idxCooldown: index("idx_ig_session_cooldown").on(table.cooldownUntil),
  }),
);
