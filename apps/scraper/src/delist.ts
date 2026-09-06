/**
 * Retires listings that are no longer being confirmed by scrapes.
 *
 * `is_active` was set true on insert and on conflict and never set false
 * anywhere, so nothing ever left the catalogue. Every row in the table was
 * active, including cars first seen four months earlier that had almost
 * certainly sold — which is the real reason the feed felt untrustworthy.
 *
 * Two mechanisms:
 *
 *  1. Per-run sweep. When a scrape successfully covers a source, any listing
 *     from that source that the run *should* have seen but didn't is delisted.
 *     Guarded by a floor on coverage, because a run that returned three
 *     listings because Instagram rate-limited us must not wipe the source.
 *
 *  2. Age sweep. Anything not re-confirmed within `STALE_AFTER_DAYS` is
 *     delisted regardless, which covers sources we stop scraping entirely.
 *
 * Delisting is soft: `is_active = false` plus a `delisted_at` stamp. The row and
 * its URL survive, and a later scrape that sees the car again reactivates it.
 */

import { and, eq, inArray, isNull, lt, notInArray, sql } from "drizzle-orm";
import { db, carListings } from "@preowned-cars/db";
import { EXPIRE_AFTER_DAYS, STALE_AFTER_DAYS } from "@preowned-cars/shared";

/**
 * If a run confirms fewer than this fraction of a source's active listings, we
 * assume the run was degraded (auth expired, rate limited, layout change) and
 * skip the sweep rather than delisting a healthy catalogue.
 */
const MIN_COVERAGE_RATIO = 0.5;

/** Never sweep on a run this small, whatever the ratio says. */
const MIN_SEEN_FOR_SWEEP = 5;

export type DelistResult = {
  delisted: number;
  skipped: boolean;
  reason: string | null;
};

export async function delistUnseen(
  sourcePlatform: string,
  seenSourceUrls: string[],
): Promise<DelistResult> {
  const [{ activeCount }] = await db
    .select({ activeCount: sql<number>`count(*)::int` })
    .from(carListings)
    .where(
      and(
        eq(carListings.sourcePlatform, sourcePlatform),
        eq(carListings.isActive, true),
      ),
    );

  if (seenSourceUrls.length < MIN_SEEN_FOR_SWEEP) {
    return {
      delisted: 0,
      skipped: true,
      reason: `only ${seenSourceUrls.length} listing(s) seen — too few to sweep safely`,
    };
  }

  const coverage = activeCount === 0 ? 1 : seenSourceUrls.length / activeCount;
  if (coverage < MIN_COVERAGE_RATIO) {
    return {
      delisted: 0,
      skipped: true,
      reason: `run covered ${(coverage * 100).toFixed(0)}% of ${activeCount} active listing(s) — below the ${MIN_COVERAGE_RATIO * 100}% floor, assuming a degraded run`,
    };
  }

  const delisted = await db
    .update(carListings)
    .set({ isActive: false, delistedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(carListings.sourcePlatform, sourcePlatform),
        eq(carListings.isActive, true),
        notInArray(carListings.sourceUrl, seenSourceUrls),
      ),
    )
    .returning({ id: carListings.id });

  if (delisted.length > 0) {
    console.log(
      `[delist] ${sourcePlatform}: retired ${delisted.length} listing(s) not seen in this run`,
    );
  }
  return { delisted: delisted.length, skipped: false, reason: null };
}

/**
 * Age-based sweep, independent of any run. Safe to call on a schedule.
 */
export async function delistStale(
  staleAfterDays = STALE_AFTER_DAYS,
): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterDays * 86_400_000);
  const delisted = await db
    .update(carListings)
    .set({ isActive: false, delistedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(carListings.isActive, true),
        lt(carListings.lastSeenAt, cutoff),
      ),
    )
    .returning({ id: carListings.id });

  if (delisted.length > 0) {
    console.log(
      `[delist] retired ${delisted.length} listing(s) not confirmed in ${staleAfterDays} days`,
    );
  }
  return delisted.length;
}

/** Reactivates rows a fresh scrape has confirmed after a previous delisting. */
export async function reactivate(sourceUrls: string[]): Promise<number> {
  if (sourceUrls.length === 0) return 0;
  const rows = await db
    .update(carListings)
    .set({ isActive: true, delistedAt: null, updatedAt: new Date() })
    .where(
      and(
        inArray(carListings.sourceUrl, sourceUrls),
        eq(carListings.isActive, false),
      ),
    )
    .returning({ id: carListings.id });
  return rows.length;
}

/** Rows old enough that we no longer want them in any default listing at all. */
export async function countExpired(): Promise<number> {
  const cutoff = new Date(Date.now() - EXPIRE_AFTER_DAYS * 86_400_000);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(carListings)
    .where(and(eq(carListings.isActive, true), lt(carListings.lastSeenAt, cutoff), isNull(carListings.delistedAt)));
  return total;
}
