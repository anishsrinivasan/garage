/**
 * Collapses the same physical item appearing as several listings.
 *
 * Suppliers repost — the same BMW X7 shows up as a photo carousel on Monday and
 * a reel on Thursday, and the feed showed both. (One X7 was in the table six
 * times.) The same is true, more so, of rental flats posted by several brokers.
 *
 * The *algorithm* here is domain-agnostic. What counts as "the same item" is
 * domain knowledge, so it arrives as an injected `clusterKey`: cars group on
 * make/model/year/km-bucket/garage, rentals on locality/BHK/rent-band/broker.
 *
 * This module is deliberately pure — rows in, updates out. The caller persists.
 * That keeps the clusterer testable without a database, and it is what lets the
 * writes be batched when the store cannot take one UPDATE per changed row.
 */

export type DedupeResult = {
  clusters: number;
  rowsClustered: number;
  demoted: number;
  updates: ClusterUpdate[];
};

export type ClusterUpdate = {
  id: string;
  clusterId: string | null;
  isHead: boolean;
};

/**
 * The row shape the clusterer needs. Everything domain-specific reaches it
 * through `clusterKey`, never through this type.
 */
export type ClusterableRow = {
  id: string;
  listedAt: Date | null;
  firstSeenAt: Date;
  media: unknown;
  price: string | null;
  saleStatus: string;
  dedupClusterId: string | null;
  isClusterHead: boolean;
};

export type ClusterKeyFn<TRow> = (row: TRow) => string;

/**
 * Scores a row's fitness to represent its cluster. Freshness first, then media
 * quality, then completeness — the head is what people actually see.
 */
function headScore(row: ClusterableRow): number {
  const when = (row.listedAt ?? row.firstSeenAt).getTime();
  const ageDays = Math.max(0, (Date.now() - when) / 86_400_000);
  const mediaArray = Array.isArray(row.media)
    ? (row.media as Array<{ score?: number | null }>)
    : [];
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
 * Recomputes clusters across the supplied rows. Idempotent — it only emits
 * updates for rows whose cluster or head status actually changes, so a re-run
 * after a partial failure is safe and cheap.
 */
export function clusterListings<TRow extends ClusterableRow>(
  rows: TRow[],
  clusterKey: ClusterKeyFn<TRow>,
): DedupeResult {
  const groups = new Map<string, TRow[]>();
  for (const row of rows) {
    const key = clusterKey(row);
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  let clusters = 0;
  let rowsClustered = 0;
  let demoted = 0;
  const updates: ClusterUpdate[] = [];

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

  return { clusters, rowsClustered, demoted, updates };
}
