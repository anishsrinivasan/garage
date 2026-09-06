/**
 * Collapses the same physical car appearing as several listings.
 *
 * Dealers repost — the same BMW X7 shows up as a photo carousel on Monday and a
 * reel on Thursday, and the feed showed both. (One X7 was in the table six
 * times.) The `dedup_cluster_id` and `content_hash` columns were designed for
 * this and had been sitting unused.
 *
 * Clustering key: normalised make + model + year + garage + a km bucket. Km is
 * bucketed rather than compared exactly because dealers re-quote it loosely
 * between posts; price deliberately isn't part of the key, since a price drop
 * is exactly when a dealer reposts.
 *
 * Only the cluster head is shown in the feed. Nothing is deleted — the other
 * rows stay reachable and are surfaced on the detail page as "also posted".
 */

import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db, carListings } from "@preowned-cars/db";

/** Km values within the same bucket are treated as the same car. */
const KM_BUCKET = 2_000;

export type DedupeResult = {
  clusters: number;
  rowsClustered: number;
  demoted: number;
};

function clusterKey(row: {
  make: string;
  model: string;
  year: number;
  kmDriven: number | null;
  garageId: string | null;
}): string {
  const km = row.kmDriven == null ? "na" : Math.round(row.kmDriven / KM_BUCKET);
  return [
    row.make.toLowerCase().trim(),
    row.model.toLowerCase().trim(),
    row.year,
    row.garageId ?? "no-garage",
    km,
  ].join("|");
}

/**
 * Scores a row's fitness to represent its cluster. Freshness first, then media
 * quality, then completeness — the head is what people actually see.
 */
function headScore(row: {
  listedAt: Date | null;
  firstSeenAt: Date;
  media: unknown;
  price: string | null;
  saleStatus: string;
}): number {
  const when = (row.listedAt ?? row.firstSeenAt).getTime();
  const ageDays = Math.max(0, (Date.now() - when) / 86_400_000);
  const mediaArray = Array.isArray(row.media) ? (row.media as Array<{ score?: number | null }>) : [];
  const bestMediaScore = mediaArray.reduce(
    (max, item) => Math.max(max, item?.score ?? 0),
    0,
  );

  let score = 1000 - ageDays * 4;
  score += Math.min(mediaArray.length, 6) * 5;
  score += bestMediaScore;
  if (row.price != null) score += 40;
  if (row.saleStatus === "sold") score -= 500;
  return score;
}

/**
 * Recomputes clusters across every active listing. Cheap enough to run after
 * each scrape (a few hundred to a few thousand rows) and idempotent, so a
 * re-run after a partial failure is safe.
 */
export async function rebuildDedupeClusters(): Promise<DedupeResult> {
  const rows = await db
    .select({
      id: carListings.id,
      make: carListings.make,
      model: carListings.model,
      year: carListings.year,
      kmDriven: carListings.kmDriven,
      garageId: carListings.garageId,
      listedAt: carListings.listedAt,
      firstSeenAt: carListings.firstSeenAt,
      media: carListings.media,
      price: carListings.price,
      saleStatus: carListings.saleStatus,
      dedupClusterId: carListings.dedupClusterId,
      isClusterHead: carListings.isClusterHead,
    })
    .from(carListings)
    .where(eq(carListings.isActive, true));

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = clusterKey(row);
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  let clusters = 0;
  let rowsClustered = 0;
  let demoted = 0;
  const updates: Array<{ id: string; clusterId: string | null; isHead: boolean }> = [];

  for (const group of groups.values()) {
    if (group.length === 1) {
      const row = group[0]!;
      // A row that used to be in a cluster but no longer is must be released.
      if (row.dedupClusterId != null || !row.isClusterHead) {
        updates.push({ id: row.id, clusterId: null, isHead: true });
      }
      continue;
    }

    clusters++;
    rowsClustered += group.length;
    // Deterministic cluster id so repeated runs don't churn the column.
    const clusterId = [...group].map((r) => r.id).sort()[0]!;
    const ranked = [...group].sort((a, b) => headScore(b) - headScore(a));

    for (const [i, row] of ranked.entries()) {
      const isHead = i === 0;
      if (!isHead) demoted++;
      if (row.dedupClusterId !== clusterId || row.isClusterHead !== isHead) {
        updates.push({ id: row.id, clusterId, isHead });
      }
    }
  }

  for (const update of updates) {
    await db
      .update(carListings)
      .set({
        dedupClusterId: update.clusterId,
        isClusterHead: update.isHead,
      })
      .where(eq(carListings.id, update.id));
  }

  console.log(
    `[dedupe] ${clusters} cluster(s) covering ${rowsClustered} row(s); ${demoted} demoted, ${updates.length} row(s) written`,
  );

  return { clusters, rowsClustered, demoted };
}

/** Sibling listings of the same car, for the detail page. */
export async function getClusterSiblings(listingId: string, clusterId: string | null) {
  if (!clusterId) return [];
  return db
    .select({
      id: carListings.id,
      sourceUrl: carListings.sourceUrl,
      sourcePlatform: carListings.sourcePlatform,
      listedAt: carListings.listedAt,
      price: carListings.price,
    })
    .from(carListings)
    .where(
      and(
        eq(carListings.dedupClusterId, clusterId),
        isNotNull(carListings.dedupClusterId),
        sql`${carListings.id} <> ${listingId}`,
      ),
    );
}
