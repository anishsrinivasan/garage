/**
 * Per-source run outcomes.
 *
 * `scrape_runs` records one row per adapter, which is too coarse for Instagram:
 * a run covering fifteen dealers reports a single status, so one handle whose
 * session has expired or whose account went private is invisible inside an
 * otherwise "completed" run. That is the same class of blind spot that let the
 * whole Instagram scraper fail unnoticed for fifteen weeks, just one level down.
 *
 * These write to `dealer_sources.last_scrape_*`, which the admin's Sources
 * screen renders per handle.
 */

import { eq } from "drizzle-orm";
import { db, dealerSources } from "@preowned-cars/db";

export type SourceStatus = "ok" | "empty" | "failed";

/**
 * Records how one source fared. Never throws: a bookkeeping failure must not
 * abort a scrape that otherwise succeeded.
 */
export async function recordSourceRun(
  dealerSourceId: string | null | undefined,
  status: SourceStatus,
  error?: string | null,
): Promise<void> {
  if (!dealerSourceId) return;
  try {
    await db
      .update(dealerSources)
      .set({
        lastScrapedAt: new Date(),
        lastScrapeStatus: status,
        // Clear the previous error on success so a stale message doesn't linger
        // next to a healthy source.
        lastScrapeError: status === "failed" ? (error ?? "unknown error") : null,
        updatedAt: new Date(),
      })
      .where(eq(dealerSources.id, dealerSourceId));
  } catch (err) {
    console.warn(
      `[source-health] could not record status for ${dealerSourceId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

/** Looks up the aggregator source row for a marketplace platform. */
export async function findAggregatorSourceId(
  platform: string,
): Promise<string | null> {
  try {
    const [row] = await db
      .select({ id: dealerSources.id })
      .from(dealerSources)
      .where(eq(dealerSources.platform, platform))
      .limit(1);
    return row?.id ?? null;
  } catch {
    return null;
  }
}
