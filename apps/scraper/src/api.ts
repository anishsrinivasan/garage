/**
 * Programmatic entry points for the scraper.
 *
 * The CLI in `index.ts` was the only way to run a scrape, which meant the cron
 * service and the admin dashboard would have had to shell out to it. These
 * functions are what both of those call instead, so a run triggered from a
 * schedule, from a button, or from the terminal takes exactly the same path.
 */

import { and, eq } from "drizzle-orm";
import { db, dealerSources, garages } from "@preowned-cars/db";
import { createInstagramAdapter } from "./adapters/instagram";
import { createCars24Adapter } from "./adapters/cars24";
import { createCardekhoAdapter } from "./adapters/cardekho";
import { runAdapter, type RunOptions } from "./runner";
import { delistStale } from "@preowned-cars/pipeline";
import { rebuildDedupeClusters } from "./dedupe-runner";
import type { ScraperAdapter } from "@preowned-cars/shared";

export type SourceName = "instagram" | "cars24" | "cardekho";

export const ALL_SOURCES: SourceName[] = ["instagram", "cars24", "cardekho"];

export type DealerInfo = {
  dealerSourceId: string;
  garageId: string;
  handle: string;
  displayName: string | null;
  city: string | null;
};

export async function fetchDealers(platform: string): Promise<DealerInfo[]> {
  return db
    .select({
      dealerSourceId: dealerSources.id,
      garageId: dealerSources.garageId,
      handle: dealerSources.handle,
      displayName: garages.name,
      city: garages.city,
    })
    .from(dealerSources)
    .innerJoin(garages, eq(garages.id, dealerSources.garageId))
    .where(
      and(
        eq(dealerSources.platform, platform),
        eq(dealerSources.isActive, true),
        eq(garages.isActive, true),
      ),
    );
}

/**
 * Builds the adapters for the requested sources. Instagram is skipped with a
 * warning rather than an error when no handles are configured, so an "all"
 * run on a fresh database still scrapes the marketplaces.
 */
export async function buildAdapters(
  sources: SourceName[],
  options: { handles?: string[] } = {},
): Promise<ScraperAdapter[]> {
  const adapters: ScraperAdapter[] = [];

  if (sources.includes("instagram")) {
    let dealers = await fetchDealers("instagram");
    if (options.handles?.length) {
      const wanted = new Set(options.handles.map((h) => h.replace(/^@/, "")));
      dealers = dealers.filter((d) => wanted.has(d.handle));
    }
    if (dealers.length === 0) {
      console.warn(
        "[scraper] no active Instagram handles matched — skipping Instagram",
      );
    } else {
      adapters.push(createInstagramAdapter(dealers));
    }
  }

  if (sources.includes("cars24")) adapters.push(createCars24Adapter());
  if (sources.includes("cardekho")) adapters.push(createCardekhoAdapter());

  return adapters;
}

export type ScrapeSummary = {
  sources: SourceName[];
  adaptersRun: number;
  durationMs: number;
};

/**
 * Runs the given sources in sequence. Dedupe is deferred to the final adapter
 * because it rebuilds every cluster in the table — running it once per adapter
 * would repeat the same whole-table work for each source.
 */
export async function runScrape(
  sources: SourceName[] = ALL_SOURCES,
  options: RunOptions & { handles?: string[] } = {},
): Promise<ScrapeSummary> {
  const startedAt = Date.now();
  const adapters = await buildAdapters(sources, { handles: options.handles });

  for (const [i, adapter] of adapters.entries()) {
    await runAdapter(adapter, {
      ...options,
      skipDedupe: options.skipDedupe ?? i < adapters.length - 1,
    });
  }

  return {
    sources,
    adaptersRun: adapters.length,
    durationMs: Date.now() - startedAt,
  };
}

export type MaintenanceSummary = {
  delisted: number;
  clusters: number;
  demoted: number;
};

/** Age sweep + cluster rebuild, with no scraping. Safe to run on a schedule. */
export async function runMaintenance(): Promise<MaintenanceSummary> {
  const delisted = await delistStale();
  const dedupe = await rebuildDedupeClusters();
  return {
    delisted,
    clusters: dedupe.clusters,
    demoted: dedupe.demoted,
  };
}

export { runAdapter, delistStale, rebuildDedupeClusters };
export { rebuildClustersFor } from "./dedupe-runner";
export type { RunOptions };
export * from "./garage-onboarding";
