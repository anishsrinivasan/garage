import { text, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { torqueSchema } from "./_schema";

/**
 * better-auth core tables, backing the admin dashboard only.
 *
 * Table and column names must match what better-auth's Drizzle adapter expects
 * (`user`, `session`, `account`, `verification`) — renaming them means writing a
 * field mapping in the adapter config, which isn't worth it. They live in the
 * same `torque` schema as everything else; the public web app never reads them.
 *
 * There is no public sign-up. Accounts are created with
 * `bun run apps/admin/scripts/create-user.ts`.
 */
export const users = torqueSchema.table(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: text("role").notNull().default("admin"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    uniqueEmail: uniqueIndex("uq_user_email").on(table.email),
  }),
);

export const sessions = torqueSchema.table(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    uniqueToken: uniqueIndex("uq_session_token").on(table.token),
    idxUserId: index("idx_session_user_id").on(table.userId),
  }),
);

export const accounts = torqueSchema.table(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    idxUserId: index("idx_account_user_id").on(table.userId),
  }),
);

export const verifications = torqueSchema.table(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    idxIdentifier: index("idx_verification_identifier").on(table.identifier),
  }),
);
