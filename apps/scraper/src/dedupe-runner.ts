/**
 * Binds the generic clusterer to a vertical and to the store.
 *
 * `clusterListings` in the pipeline is deliberately pure — rows in, updates out
 * — so this is where the database read and write live. Keeping them here is what
 * lets the writes become batched when the store cannot take one UPDATE per
 * changed row.
 */

import { eq } from "drizzle-orm";
import { db, carListings } from "@preowned-cars/db";
import { clusterListings, type DedupeResult } from "@preowned-cars/pipeline";
import { carsVertical, type CarAttrs } from "@preowned-cars/verticals/cars";

export async function rebuildDedupeClusters(): Promise<
  Omit<DedupeResult, "updates"> & { written: number }
> {
  const rows = await db
    .select({
      id: carListings.id,
      orgId: carListings.garageId,
      listedAt: carListings.listedAt,
      firstSeenAt: carListings.firstSeenAt,
      media: carListings.media,
      price: carListings.price,
      saleStatus: carListings.saleStatus,
      dedupClusterId: carListings.dedupClusterId,
      isClusterHead: carListings.isClusterHead,
      make: carListings.make,
      model: carListings.model,
      year: carListings.year,
      kmDriven: carListings.kmDriven,
    })
    .from(carListings)
    .where(eq(carListings.isActive, true));

  const result = clusterListings(rows, (row) =>
    carsVertical.clusterKey({
      id: row.id,
      orgId: row.orgId,
      price: row.price,
      attrs: {
        make: row.make,
        model: row.model,
        year: row.year,
        kmDriven: row.kmDriven,
      } as CarAttrs,
    }),
  );

  for (const update of result.updates) {
    await db
      .update(carListings)
      .set({ dedupClusterId: update.clusterId, isClusterHead: update.isHead })
      .where(eq(carListings.id, update.id));
  }

  console.log(
    `[dedupe] ${result.clusters} cluster(s) covering ${result.rowsClustered} row(s); ${result.demoted} demoted, ${result.updates.length} row(s) written`,
  );

  return {
    clusters: result.clusters,
    rowsClustered: result.rowsClustered,
    demoted: result.demoted,
    written: result.updates.length,
  };
}
