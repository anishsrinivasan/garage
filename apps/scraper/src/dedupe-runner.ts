/**
 * Binds the generic clusterer to a vertical and to the store.
 *
 * `clusterListings` in the pipeline is deliberately pure — rows in, updates out
 * — so this is where the database read and write live. Keeping them here is what
 * lets the writes become batched when the store cannot take one UPDATE per
 * changed row.
 */

import { eq } from "drizzle-orm";
import { db, listings } from "@preowned-cars/db";
import { clusterListings, type DedupeResult } from "@preowned-cars/pipeline";
import { carsVertical, type CarAttrs } from "@preowned-cars/verticals/cars";

export async function rebuildDedupeClusters(): Promise<
  Omit<DedupeResult, "updates"> & { written: number }
> {
  const rows = await db
    .select({
      id: listings.id,
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
    })
    .from(listings)
    .where(eq(listings.isActive, true));

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
      .update(listings)
      .set({ dedupClusterId: update.clusterId, isClusterHead: update.isHead })
      .where(eq(listings.id, update.id));
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
