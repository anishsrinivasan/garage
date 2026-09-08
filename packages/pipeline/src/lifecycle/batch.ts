/**
 * Write batching.
 *
 * The runner upserts row by row and the deduper issues one UPDATE per changed
 * row. Against a Postgres connection on the same network that is merely
 * inefficient. Against D1 it is a wall: writes are single-threaded, a Worker
 * invocation is capped at 1,000 queries, and every statement from the homelab
 * is a round-trip to Cloudflare. A 500-row scrape becomes 500 round-trips.
 *
 * These helpers exist so the call sites are already shaped for batching before
 * the store changes underneath them. They are a real improvement on Postgres
 * too — fewer round-trips is fewer round-trips.
 */

/**
 * D1 caps bound parameters at 100 per query, so a multi-row INSERT with 30
 * columns can carry at most three rows. Chunking by *parameters* rather than by
 * rows is what keeps that from silently truncating.
 */
export const MAX_BOUND_PARAMS = 100;

/** Conservative default for engines without a documented cap. */
export const DEFAULT_CHUNK_ROWS = 50;

export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error(`chunk size must be >= 1, got ${size}`);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Rows per statement for a given column count, respecting the parameter cap.
 * Always at least one, so a very wide row still makes progress one at a time.
 */
export function rowsPerStatement(
  columnsPerRow: number,
  maxParams = MAX_BOUND_PARAMS,
): number {
  return Math.max(1, Math.floor(maxParams / Math.max(1, columnsPerRow)));
}

export type BatchProgress = {
  done: number;
  total: number;
  batches: number;
};

/**
 * Runs `work` over `items` in chunks, sequentially.
 *
 * Sequential on purpose: the target store serialises writes anyway, and firing
 * concurrent batches at it only converts a queue into lock contention.
 */
export async function inBatches<T, R>(
  items: T[],
  size: number,
  work: (batch: T[], index: number) => Promise<R>,
  onProgress?: (progress: BatchProgress) => void,
): Promise<R[]> {
  const batches = chunk(items, size);
  const results: R[] = [];
  for (const [i, batch] of batches.entries()) {
    results.push(await work(batch, i));
    onProgress?.({
      done: Math.min((i + 1) * size, items.length),
      total: items.length,
      batches: batches.length,
    });
  }
  return results;
}
