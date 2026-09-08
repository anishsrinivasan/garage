/**
 * The pooled connection string Hyperdrive exposes to a Worker.
 *
 * A Worker isolate cannot hold a client-side pool the way a long-lived Node
 * process does: every cold isolate opens its own connection, and against
 * PlanetScale in ap-south-2 that round trip was slow enough that the first
 * request to a new isolate rendered an empty page — which ISR then cached and
 * served back. Hyperdrive keeps warm connections beside the database and hands
 * the Worker a local one.
 *
 * Nothing imports this directly. apps/web's vite.config.ts aliases
 * `hyperdrive.node` to this file for the Workers build, which keeps the
 * `cloudflare:workers` import out of every Node and Bun bundle, where it does
 * not resolve.
 */
import { env } from "cloudflare:workers";

export function hyperdriveConnectionString(): string | null {
  return env?.HYPERDRIVE?.connectionString ?? null;
}
