import {
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { appSchema } from "./_schema";

/**
 * Saved searches and their deliveries.
 *
 * Search is one-shot; alerts are the retention loop, and for rentals they are
 * close to the whole product. Matching runs against `first_seen_at` — when the
 * listing genuinely appeared, not when a crawler noticed it — which is what
 * separates a useful alert from a spam generator.
 */
export const savedSearches = appSchema.table(
  "saved_searches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Nullable: anonymous email subscription is the low-friction path. */
    userId: text("user_id"),
    email: text("email"),
    telegramChatId: text("telegram_chat_id"),

    vertical: text("vertical").notNull(),
    cityId: uuid("city_id"),
    label: text("label").notNull(),
    /** The same shape the search page produces. */
    filters: jsonb("filters").$type<Record<string, unknown>>().notNull().default({}),
    channels: text("channels").array().notNull().default(["email"]),

    /** Twenty matches in one run should be one digest, not twenty pings. */
    minIntervalMinutes: integer("min_interval_minutes").notNull().default(60),
    lastMatchedAt: timestamp("last_matched_at"),
    lastNotifiedAt: timestamp("last_notified_at"),

    isActive: boolean("is_active").notNull().default(true),
    unsubscribeToken: text("unsubscribe_token").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    uniqueToken: uniqueIndex("uq_saved_search_token").on(table.unsubscribeToken),
    idxActive: index("idx_saved_searches_active").on(table.isActive, table.vertical),
  }),
);

export const alertDeliveries = appSchema.table(
  "alert_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    savedSearchId: uuid("saved_search_id").notNull(),
    listingId: uuid("listing_id").notNull(),
    channel: text("channel").notNull(),
    status: text("status").notNull().default("pending"),
    error: text("error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    sentAt: timestamp("sent_at"),
  },
  (table) => ({
    /**
     * Makes duplicate notification impossible at the database level rather than
     * depending on application code remembering to check. Notifying twice for
     * one listing is what gets an alert product muted.
     */
    uniqueDelivery: uniqueIndex("uq_alert_delivery").on(
      table.savedSearchId,
      table.listingId,
      table.channel,
    ),
    idxPending: index("idx_alert_deliveries_pending").on(table.status, table.createdAt),
  }),
);
