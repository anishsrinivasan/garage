/**
 * Per-request memoisation, and nothing more.
 *
 * These queries used `unstable_cache`, which keeps a result across requests and
 * revalidates it in the background after a response has been sent. On Workers
 * that background pass reaches for the database connection the original request
 * opened, which the runtime forbids:
 *
 *   Cannot perform I/O on behalf of a different request
 *
 * The promise never settled, the isolate was killed for hanging, and the
 * visitor got a page stuck on its skeleton.
 *
 * React's `cache()` deduplicates a query within a single render or invocation
 * and forgets it afterwards, so nothing outlives the request that made it. The
 * database is the source of truth on every request.
 */
import { cache } from "react";

export function cachedQuery<T>(
  loader: () => Promise<T>,
  _keyParts: string[],
  _options: { tags?: string[]; revalidate?: number },
): () => Promise<T> {
  return cache(loader);
}
