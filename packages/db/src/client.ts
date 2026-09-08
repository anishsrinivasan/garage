import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";
import { hyperdriveConnectionString } from "./hyperdrive.node";

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
function createSql(): Sql {
  // Hyperdrive first when running on Workers; DATABASE_URL everywhere else.
  const connectionString =
    hyperdriveConnectionString() ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const sql =
    globalThis.__preowned_cars_db_sql__ ??
    postgres(connectionString, {
      max: MAX_CONNECTIONS,
      idle_timeout: IDLE_TIMEOUT,
      connect_timeout: CONNECT_TIMEOUT,
      prepare: false,
      // postgres.js otherwise spends a round trip introspecting pg_type before
      // it will run the first query on a connection. On a warm Node server that
      // is invisible; on a cold Cloudflare Worker isolate it is an extra
      // round trip to Hyderabad before any work starts, and the first request
      // to a new isolate was rendering an empty page because of it — which ISR
      // then cached and served. The schema uses no custom types, so there is
      // nothing here worth the trip.
      fetch_types: false,
    });

  if (process.env.NODE_ENV !== "production") {
    globalThis.__preowned_cars_db_sql__ = sql;
  }
  return sql;
}

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

let instance: DrizzleDb | null = null;

function getDb(): DrizzleDb {
  instance ??= drizzle(createSql(), { schema });
  return instance;
}

/**
 * Connects lazily on first use rather than at import.
 *
 * This module used to throw from its top level when `DATABASE_URL` was unset,
 * which meant `next build` failed while merely *collecting* page data for any
 * route that imported it — even routes that never query at build time. Deferring
 * the connection lets a build succeed without database credentials while still
 * failing loudly, with the same message, the moment a query is actually run.
 */
export const db: DrizzleDb = new Proxy({} as DrizzleDb, {
  get(_target, property, receiver) {
    return Reflect.get(getDb(), property, receiver);
  },
  has(_target, property) {
    return Reflect.has(getDb(), property);
  },
});

export type Database = DrizzleDb;
