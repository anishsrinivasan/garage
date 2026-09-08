/**
 * Binds the generic clusterer to a vertical and to the store.
 *
 * `clusterListings` in the pipeline is pure — rows in, updates out — so this is
 * where the database read and write live.
 *
 * Two modes:
 *
 *   - **Incremental** (default after a scrape). Only the clusters a run actually
 *     touched are recomputed. A run that adds twenty listings should not read
 *     and rewrite the whole table, and on D1 it cannot: writes are
 *     single-threaded and a Worker invocation is capped at 1,000 queries.
 *   - **Full** (maintenance). Recomputes everything, for when the cluster key
 *     itself changes and every grouping has to be redrawn.
 */

import { eq, inArray, sql } from "drizzle-orm";
import { db, listings } from "@preowned-cars/db";
import {
  clusterListings,
  inBatches,
  DEFAULT_CHUNK_ROWS,
  type DedupeResult,
} from "@preowned-cars/pipeline";
import { carsVertical, type CarAttrs } from "@preowned-cars/verticals/cars";

export type DedupeRunResult = Omit<DedupeResult, "updates"> & {
  written: number;
  scope: "full" | "incremental";
};

const SELECTION = {
  id: listings.id,
  // Still `garage_id` in the schema; the rename to organisations/sources is
  // deferred to phase 3, where rentals makes the current name read wrong.
  orgId: listings.garageId,
  listedAt: listings.listedAt,
  firstSeenAt: listings.firstSeenAt,
  media: listings.media,
  price: listings.price,
  saleStatus: listings.saleStatus,
  dedupClusterId: listings.dedupClusterId,
  isClusterHead: listings.isClusterHead,
  make: listings.make,
  model: listings.model,
  year: listings.year,
  kmDriven: listings.kmDriven,
} as const;

type Row = { [K in keyof typeof SELECTION]: unknown } & {
  id: string;
  orgId: string | null;
  listedAt: Date | null;
  firstSeenAt: Date;
  media: unknown;
  price: string | null;
  saleStatus: string;
  dedupClusterId: string | null;
  isClusterHead: boolean;
  make: string;
  model: string;
  year: number;
  kmDriven: number | null;
};

function keyOf(row: Row): string {
  return carsVertical.clusterKey({
    id: row.id,
    orgId: row.orgId,
    price: row.price,
    attrs: {
      make: row.make,
      model: row.model,
      year: row.year,
      kmDriven: row.kmDriven,
    } as CarAttrs,
  });
}

async function persist(
  updates: DedupeResult["updates"],
): Promise<number> {
  if (updates.length === 0) return 0;

  // Group by the value being written so a batch is one statement per distinct
  // (clusterId, isHead) pair rather than one per row.
  const groups = new Map<string, { clusterId: string | null; isHead: boolean; ids: string[] }>();
  for (const u of updates) {
    const key = `${u.clusterId ?? "null"}|${u.isHead}`;
    const g = groups.get(key);
    if (g) g.ids.push(u.id);
    else groups.set(key, { clusterId: u.clusterId, isHead: u.isHead, ids: [u.id] });
  }

  let written = 0;
  for (const group of groups.values()) {
    await inBatches(group.ids, DEFAULT_CHUNK_ROWS, async (ids) => {
      await db
        .update(listings)
        .set({ dedupClusterId: group.clusterId, isClusterHead: group.isHead })
        .where(inArray(listings.id, ids));
      written += ids.length;
    });
  }
  return written;
}

/**
 * Recomputes only the clusters that the supplied listings belong to.
 *
 * Correctness detail: it is not enough to re-cluster the new rows alone. A new
 * listing joins an existing cluster, which can change which row is the head, so
 * every sibling sharing its key has to be re-read. That is what the second query
 * does — fetch the full membership of each affected key, then cluster that.
 */
export async function rebuildClustersFor(
  listingIds: string[],
): Promise<DedupeRunResult> {
  if (listingIds.length === 0) {
    return { clusters: 0, rowsClustered: 0, demoted: 0, written: 0, scope: "incremental" };
  }

  const seeds = (await db
    .select(SELECTION)
    .from(listings)
    .where(inArray(listings.id, listingIds))) as Row[];

  const affectedKeys = new Set(seeds.map(keyOf));
  if (affectedKeys.size === 0) {
    return { clusters: 0, rowsClustered: 0, demoted: 0, written: 0, scope: "incremental" };
  }

  // Pull every active row that could share a key with a seed. Narrowed by
  // (make, model, year) so this stays a small indexed read rather than a table
  // scan — the km bucket and org are then applied by the key function itself.
  const candidates = (await db
    .select(SELECTION)
    .from(listings)
    .where(
      sql`${listings.isActive} = true and (${listings.make}, ${listings.model}, ${listings.year}) in ${sql`(${sql.join(
        seeds.map((s) => sql`(${s.make}, ${s.model}, ${s.year})`),
        sql`, `,
      )})`}`,
    )) as Row[];

  const scoped = candidates.filter((row) => affectedKeys.has(keyOf(row)));
  const result = clusterListings(scoped, keyOf);
  const written = await persist(result.updates);

  console.log(
    `[dedupe] incremental: ${affectedKeys.size} key(s), ${scoped.length} row(s) examined, ${result.demoted} demoted, ${written} written`,
  );

  return {
    clusters: result.clusters,
    rowsClustered: result.rowsClustered,
    demoted: result.demoted,
    written,
    scope: "incremental",
  };
}

/** Whole-table rebuild. Use when the cluster key itself changed. */
export async function rebuildDedupeClusters(): Promise<DedupeRunResult> {
  const rows = (await db
    .select(SELECTION)
    .from(listings)
    .where(eq(listings.isActive, true))) as Row[];

  const result = clusterListings(rows, keyOf);
  const written = await persist(result.updates);

  console.log(
    `[dedupe] full: ${result.clusters} cluster(s) covering ${result.rowsClustered} row(s); ${result.demoted} demoted, ${written} written`,
  );

  return {
    clusters: result.clusters,
    rowsClustered: result.rowsClustered,
    demoted: result.demoted,
    written,
    scope: "full",
  };
}
