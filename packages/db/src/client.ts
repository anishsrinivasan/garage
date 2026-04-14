import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Without PgBouncer we must aggressively cap client-side pool size. A Next.js
// dev server + HMR, CLI scripts, and serverless invocations otherwise each
// open their own 10-connection pool and quickly exhaust the server.
// Cache on globalThis so HMR reloads reuse the same pool.
const MAX_CONNECTIONS = Number(process.env.DATABASE_POOL_MAX ?? 5);
const IDLE_TIMEOUT = Number(process.env.DATABASE_IDLE_TIMEOUT ?? 20); // seconds
const CONNECT_TIMEOUT = Number(process.env.DATABASE_CONNECT_TIMEOUT ?? 10);

declare global {
  // eslint-disable-next-line no-var
  var __preowned_cars_db_sql__: Sql | undefined;
}

// NOTE: We intentionally do NOT pass `connection: { search_path: ... }`.
// PlanetScale's transaction-mode pooler rejects most session-scoped startup
// parameters with `unsupported startup parameter: search_path`. Drizzle's
// pgSchema("torque") already emits fully qualified `torque.<table>` in every
// query, so we don't need search_path at runtime. For raw psql or Drizzle
// Studio, set it locally with `SET search_path TO torque, public;` or via
// the connection URL when using a non-pooled session.
const sql: Sql =
  globalThis.__preowned_cars_db_sql__ ??
  postgres(connectionString, {
    max: MAX_CONNECTIONS,
    idle_timeout: IDLE_TIMEOUT,
    connect_timeout: CONNECT_TIMEOUT,
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__preowned_cars_db_sql__ = sql;
}

export const db = drizzle(sql, { schema });
export type Database = typeof db;
