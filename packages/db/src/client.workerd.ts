/**
 * Workers build of the database client.
 *
 * The Node client memoises one postgres.js client at module scope and keeps it
 * for the life of the process. That is right for a long-lived server and wrong
 * inside a Worker isolate, which serves many requests from one module instance:
 * the socket is opened during request A, and the moment request B touches it the
 * runtime raises
 *
 *   Cannot perform I/O on behalf of a different request
 *
 * which surfaced as pages hung on their loading skeleton and the runtime
 * killing the invocation for "code that had hung and would never generate a
 * response".
 *
 * React's `cache()` is per-request in a Server Component render and per
 * invocation in a route handler, so the connection is created and used inside
 * exactly one request. apps/web's vite.config.ts aliases `./client` here for
 * the Workers build; Node and Bun keep client.ts unchanged.
 */
import { cache } from "react";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { hyperdriveConnectionString } from "./hyperdrive.workerd";

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

const getRequestDb = cache((): DrizzleDb => {
  const connectionString =
    hyperdriveConnectionString() ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  return drizzle(
    postgres(connectionString, {
      // Hyperdrive already pools; one connection per request is the shape the
      // Workers runtime wants, and it must not outlive the request.
      max: 1,
      // No background reaping — the isolate may be frozen between requests.
      idle_timeout: 0,
      connect_timeout: 10,
      prepare: false,
      // Saves a round trip introspecting pg_type before the first query.
      fetch_types: false,
    }),
    { schema },
  );
});

export const db: DrizzleDb = new Proxy({} as DrizzleDb, {
  get(_target, property, receiver) {
    return Reflect.get(getRequestDb(), property, receiver);
  },
  has(_target, property) {
    return Reflect.has(getRequestDb(), property);
  },
});

export type Database = DrizzleDb;
