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

import { and, desc, eq, inArray, isNull, lt, notInArray, sql } from "drizzle-orm";
import { db, listings, scrapeRuns } from "@preowned-cars/db";
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
  const [activeRow] = await db
    .select({ activeCount: sql<number>`count(*)::int` })
    .from(listings)
    .where(
      and(
        eq(listings.sourcePlatform, sourcePlatform),
        eq(listings.isActive, true),
      ),
    );
  const activeCount = activeRow?.activeCount ?? 0;

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
    .update(listings)
    .set({ isActive: false, delistedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(listings.sourcePlatform, sourcePlatform),
        eq(listings.isActive, true),
        notInArray(listings.sourceUrl, seenSourceUrls),
      ),
    )
    .returning({ id: listings.id });

  if (delisted.length > 0) {
    console.log(
      `[delist] ${sourcePlatform}: retired ${delisted.length} listing(s) not seen in this run`,
    );
  }
  return { delisted: delisted.length, skipped: false, reason: null };
}

/** When a source last completed a scrape, successfully or with errors. */
async function lastSuccessfulRunBySource(): Promise<Map<string, Date>> {
  const rows = await db
    .select({
      sourcePlatform: scrapeRuns.sourcePlatform,
      completedAt: scrapeRuns.completedAt,
      status: scrapeRuns.status,
    })
    .from(scrapeRuns)
    .orderBy(desc(scrapeRuns.completedAt));

  const out = new Map<string, Date>();
  for (const row of rows) {
    if (!row.completedAt) continue;
    if (row.status !== "completed" && row.status !== "completed_with_errors") continue;
    if (!out.has(row.sourcePlatform)) out.set(row.sourcePlatform, row.completedAt);
  }
  return out;
}

/**
 * Age-based sweep, independent of any run.
 *
 * Critically, a listing is only aged out if its source has *successfully
 * scraped since the listing was last seen*. Without that guard the sweep
 * punishes listings for the scraper being broken rather than for the car being
 * gone — when this was first wired up against back-filled data it retired 460
 * of 500 listings in one pass, including every Instagram row, purely because
 * the Instagram scraper had been failing. A broken scraper must never be able
 * to empty the catalogue; that is the failure mode this whole subsystem exists
 * to prevent.
 */
export async function delistStale(
  staleAfterDays = STALE_AFTER_DAYS,
): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterDays * 86_400_000);
  const lastRuns = await lastSuccessfulRunBySource();

  const candidates = await db
    .select({
      id: listings.id,
      sourcePlatform: listings.sourcePlatform,
      lastSeenAt: listings.lastSeenAt,
    })
    .from(listings)
    .where(and(eq(listings.isActive, true), lt(listings.lastSeenAt, cutoff)));

  const skippedSources = new Set<string>();
  const toDelist = candidates.filter((row) => {
    const lastRun = lastRuns.get(row.sourcePlatform);
    // The source has produced no successful run since we last saw this listing,
    // so we have no evidence it is gone — only evidence the scraper is stuck.
    if (!lastRun || lastRun <= row.lastSeenAt) {
      skippedSources.add(row.sourcePlatform);
      return false;
    }
    return true;
  });

  for (const source of skippedSources) {
    console.warn(
      `[delist] ${source}: skipping stale sweep — no successful run since these listings were last confirmed. Fix the scraper rather than retiring its listings.`,
    );
  }

  if (toDelist.length === 0) return 0;

  const delisted = await db
    .update(listings)
    .set({ isActive: false, delistedAt: new Date(), updatedAt: new Date() })
    .where(
      inArray(
        listings.id,
        toDelist.map((row) => row.id),
      ),
    )
    .returning({ id: listings.id });

  console.log(
    `[delist] retired ${delisted.length} listing(s) not confirmed in ${staleAfterDays} days`,
  );
  return delisted.length;
}

/** Reactivates rows a fresh scrape has confirmed after a previous delisting. */
export async function reactivate(sourceUrls: string[]): Promise<number> {
  if (sourceUrls.length === 0) return 0;
  const rows = await db
    .update(listings)
    .set({ isActive: true, delistedAt: null, updatedAt: new Date() })
    .where(
      and(
        inArray(listings.sourceUrl, sourceUrls),
        eq(listings.isActive, false),
      ),
    )
    .returning({ id: listings.id });
  return rows.length;
}

/** Rows old enough that we no longer want them in any default listing at all. */
export async function countExpired(): Promise<number> {
  const cutoff = new Date(Date.now() - EXPIRE_AFTER_DAYS * 86_400_000);
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(listings)
    .where(
      and(
        eq(listings.isActive, true),
        lt(listings.lastSeenAt, cutoff),
        isNull(listings.delistedAt),
      ),
    );
  return row?.total ?? 0;
}
