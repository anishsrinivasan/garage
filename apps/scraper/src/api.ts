/**
 * Programmatic entry points for the scraper.
 *
 * The CLI in `index.ts` was the only way to run a scrape, which meant the cron
 * service and the admin dashboard would have had to shell out to it. These
 * functions are what both of those call instead, so a run triggered from a
 * schedule, from a button, or from the terminal takes exactly the same path.
 */

import { and, eq } from "drizzle-orm";
import { db, dealerSources, garages } from "@classifieds/db";
import { createInstagramAdapter } from "./adapters/instagram";
import { createCars24Adapter } from "./adapters/cars24";
import { createOlxAdapter } from "./adapters/olx";
import { createCardekhoAdapter } from "./adapters/cardekho";
import { createInstagramRentalsAdapter } from "./adapters/instagram-rentals";
import { runAdapter, type RunOptions } from "./runner";
import { delistStale, deliverPendingAlerts } from "@classifieds/pipeline";
import { rebuildDedupeClusters } from "./dedupe-runner";
import type { ScraperAdapter } from "@classifieds/shared";

export type SourceName =
  | "instagram"
  | "instagram-rentals"
  | "cars24"
  | "cardekho"
  | "olx";

export const ALL_SOURCES: SourceName[] = [
  "instagram",
  "instagram-rentals",
  "cars24",
  // Headful-only: OLX's bot check rejects headless outright. Needs a display,
  // so it is excluded from environments without one — see olx-config.ts.
  "olx",
  "cardekho",
];

export type DealerInfo = {
  dealerSourceId: string;
  garageId: string;
  handle: string;
  displayName: string | null;
  city: string | null;
};

/**
 * Active sources for a platform, optionally narrowed to one vertical. A car
 * dealer and a rental broker are both "an Instagram handle"; the vertical column
 * is what tells them apart.
 */
export async function fetchDealers(
  platform: string,
  vertical?: string,
): Promise<DealerInfo[]> {
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
        vertical ? eq(dealerSources.vertical, vertical) : undefined,
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
    let dealers = await fetchDealers("instagram", "cars");
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

  if (sources.includes("instagram-rentals")) {
    let brokers = await fetchDealers("instagram", "rentals");
    if (options.handles?.length) {
      const wanted = new Set(options.handles.map((h) => h.replace(/^@/, "")));
      brokers = brokers.filter((b) => wanted.has(b.handle));
    }
    if (brokers.length === 0) {
      console.warn("[scraper] no active rental brokers matched — skipping rentals");
    } else {
      adapters.push(createInstagramRentalsAdapter(brokers));
    }
  }

  if (sources.includes("cars24")) adapters.push(createCars24Adapter());
  if (sources.includes("olx")) adapters.push(createOlxAdapter());
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
  alertsSent: number;
  alertsFailed: number;
};

/** Age sweep + cluster rebuild, with no scraping. Safe to run on a schedule. */
export async function runMaintenance(): Promise<MaintenanceSummary> {
  const delisted = await delistStale();
  const dedupe = await rebuildDedupeClusters();
  // Sending is separate from matching on purpose: matching runs inside the
  // scrape, delivery runs on the sweep, so a transport outage delays alerts
  // rather than losing the matches that produced them.
  const alerts = await deliverPendingAlerts().catch((err: unknown) => {
    console.warn(
      `[maintenance] alert delivery failed — ${err instanceof Error ? err.message : String(err)}`,
    );
    return { sent: 0, failed: 0, skipped: 0 };
  });
  return {
    delisted,
    clusters: dedupe.clusters,
    demoted: dedupe.demoted,
    alertsSent: alerts.sent,
    alertsFailed: alerts.failed,
  };
}

export { runAdapter, delistStale, rebuildDedupeClusters };
export { rebuildClustersFor } from "./dedupe-runner";
export type { RunOptions };
export * from "./garage-onboarding";
