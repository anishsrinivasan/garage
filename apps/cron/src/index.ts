/**
 * Torque scraper cron service.
 *
 * A Hono app with an embedded scheduler, meant to run as a long-lived container
 * on the homelab under Dokploy. The catalogue previously went fifteen weeks
 * without a successful Instagram scrape because runs were manual and a failure
 * was invisible; this both runs them on a schedule and exposes the health of
 * the last run so the failure is noticeable.
 *
 * Endpoints:
 *   GET  /health          — liveness + scheduler state (open, for Dokploy)
 *   GET  /status          — last runs per source, from the database
 *   GET  /jobs            — in-memory job history for this process
 *   GET  /jobs/:id        — one job
 *   POST /scrape          — queue a scrape        (auth)
 *   POST /maintenance     — queue delist + dedupe (auth)
 */

import { Hono } from "hono";
import { logger } from "hono/logger";
import { Cron } from "croner";
import { desc, eq, sql } from "drizzle-orm";
import { db, scrapeRuns, listings, dealerSources, garages } from "@preowned-cars/db";
import { ALL_SOURCES, type SourceName } from "@preowned-cars/scraper";
import { getPoolHealth } from "@preowned-cars/pipeline";
import { savedSearches, alertDeliveries } from "@preowned-cars/db";
import { loadConfig } from "./config";
import {
  enqueue,
  getActiveJob,
  getHistory,
  getJob,
  queueDepth,
} from "./jobs";

const config = loadConfig();
const app = new Hono();
const startedAt = new Date();

app.use("*", logger());

/**
 * Bearer-token guard on everything that mutates. Applied as middleware rather
 * than per-route so adding a new trigger can't accidentally ship unauthenticated.
 */
app.use("/scrape", requireAuth);
app.use("/maintenance", requireAuth);

async function requireAuth(
  c: Parameters<Parameters<typeof app.use>[1]>[0],
  next: () => Promise<void>,
) {
  if (!config.apiToken) {
    // Only reachable outside production, where loadConfig() allows a null token.
    console.warn("[cron] CRON_API_TOKEN is unset — trigger endpoints are open");
    return next();
  }
  const header = c.req.header("authorization") ?? "";
  const provided = header.startsWith("Bearer ")
    ? header.slice(7)
    : c.req.header("x-api-token");
  if (provided !== config.apiToken) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return next();
}

app.get("/health", (c) =>
  c.json({
    ok: true,
    startedAt: startedAt.toISOString(),
    uptimeSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
    scheduler: {
      enabled: config.schedulerEnabled,
      timezone: config.timezone,
      scrape: config.scrapeSchedule,
      maintenance: config.maintenanceSchedule,
      nextScrape: scrapeJob?.nextRun()?.toISOString() ?? null,
      nextMaintenance: maintenanceJob?.nextRun()?.toISOString() ?? null,
    },
    activeJob: getActiveJob(),
    queueDepth: queueDepth(),
  }),
);

/**
 * Catalogue health straight from the database, so this is meaningful even
 * after a container restart wipes the in-memory job history.
 */
app.get("/status", async (c) => {
  try {
    const [runs, [counts], sources, sessionPool, [searchCounts], [deliveryCounts]] =
      await Promise.all([
      db
        .select({
          sourcePlatform: scrapeRuns.sourcePlatform,
          status: scrapeRuns.status,
          startedAt: scrapeRuns.startedAt,
          completedAt: scrapeRuns.completedAt,
          trigger: scrapeRuns.trigger,
          listingsNew: scrapeRuns.listingsNew,
          listingsUpdated: scrapeRuns.listingsUpdated,
          listingsDelisted: scrapeRuns.listingsDelisted,
          errorMessage: scrapeRuns.errorMessage,
        })
        .from(scrapeRuns)
        .orderBy(desc(scrapeRuns.startedAt))
        .limit(20),
      db
        .select({
          active: sql<number>`count(*) filter (where ${listings.isActive})::int`,
          needsReview: sql<number>`count(*) filter (where ${listings.needsReview} and ${listings.isActive})::int`,
          staleWeek: sql<number>`count(*) filter (where ${listings.isActive} and ${listings.lastSeenAt} < now() - interval '7 days')::int`,
          addedToday: sql<number>`count(*) filter (where ${listings.firstSeenAt} >= now() - interval '1 day')::int`,
        })
        .from(listings),
      db
        .select({
          platform: dealerSources.platform,
          handle: dealerSources.handle,
          isActive: dealerSources.isActive,
          garageName: garages.name,
        })
        .from(dealerSources)
        .innerJoin(garages, eq(garages.id, dealerSources.garageId)),
      // An empty or fully-cooled pool is the single most likely cause of a run
      // returning nothing, so it belongs next to the run history.
      getPoolHealth().catch(() => null),
      db
        .select({
          activeSearches: sql<number>`count(distinct ${savedSearches.id}) filter (where ${savedSearches.isActive})::int`,
        })
        .from(savedSearches)
        .catch(() => [{ activeSearches: 0 }]),
      db
        .select({
          pending: sql<number>`count(*) filter (where ${alertDeliveries.status} = 'pending')::int`,
          sent: sql<number>`count(*) filter (where ${alertDeliveries.status} = 'sent')::int`,
        })
        .from(alertDeliveries)
        .catch(() => [{ pending: 0, sent: 0 }]),
    ]);

    const lastByPlatform = new Map<string, (typeof runs)[number]>();
    for (const run of runs) {
      if (!lastByPlatform.has(run.sourcePlatform)) {
        lastByPlatform.set(run.sourcePlatform, run);
      }
    }

    return c.json({
      catalogue: counts,
      sessionPool,
      alerts: { ...searchCounts, ...deliveryCounts },
      lastRunPerSource: Object.fromEntries(lastByPlatform),
      recentRuns: runs,
      sources: sources.length,
      activeSources: sources.filter((s) => s.isActive).length,
    });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

app.get("/jobs", (c) => c.json({ active: getActiveJob(), history: getHistory() }));

app.get("/jobs/:id", (c) => {
  const job = getJob(c.req.param("id"));
  return job ? c.json(job) : c.json({ error: "not found" }, 404);
});

/**
 * Queue a scrape. Body is optional:
 *   { "sources": ["instagram"], "handles": ["kun_elite"] }
 * Returns 202 — a full run takes minutes, well past any HTTP timeout.
 */
app.post("/scrape", async (c) => {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const requested = Array.isArray(body.sources)
    ? (body.sources as string[])
    : null;

  const invalid = requested?.filter((s) => !ALL_SOURCES.includes(s as SourceName)) ?? [];
  if (invalid.length > 0) {
    return c.json(
      { error: `unknown source(s): ${invalid.join(", ")}`, valid: ALL_SOURCES },
      400,
    );
  }

  if (getActiveJob()) {
    // Not an error: the job is queued behind the running one. Say so plainly so
    // an operator doesn't retry in a loop.
    console.log("[cron] a job is already running; queueing behind it");
  }

  const job = enqueue({
    kind: "scrape",
    trigger: typeof body.trigger === "string" ? body.trigger : "manual",
    sources: (requested as SourceName[]) ?? undefined,
    handles: Array.isArray(body.handles) ? (body.handles as string[]) : undefined,
    config,
  });
  return c.json(job, 202);
});

app.post("/maintenance", (c) => {
  const job = enqueue({ kind: "maintenance", trigger: "manual", config });
  return c.json(job, 202);
});

app.notFound((c) => c.json({ error: "not found" }, 404));

app.onError((err, c) => {
  console.error("[cron] unhandled error", err);
  return c.json({ error: err.message }, 500);
});

// --- scheduler ------------------------------------------------------------

let scrapeJob: Cron | null = null;
let maintenanceJob: Cron | null = null;

if (config.schedulerEnabled) {
  scrapeJob = new Cron(
    config.scrapeSchedule,
    { timezone: config.timezone, protect: true, name: "scrape" },
    () => {
      enqueue({ kind: "scrape", trigger: "cron", config });
    },
  );

  maintenanceJob = new Cron(
    config.maintenanceSchedule,
    { timezone: config.timezone, protect: true, name: "maintenance" },
    () => {
      enqueue({ kind: "maintenance", trigger: "cron", config });
    },
  );

  console.log(
    `[cron] scheduler on (${config.timezone}) — scrape "${config.scrapeSchedule}" next ${scrapeJob.nextRun()?.toISOString()}, maintenance "${config.maintenanceSchedule}" next ${maintenanceJob.nextRun()?.toISOString()}`,
  );
} else {
  console.log("[cron] scheduler disabled (CRON_ENABLED=false) — HTTP triggers only");
}

if (config.runOnStart) {
  console.log("[cron] CRON_RUN_ON_START set — queueing an initial scrape");
  enqueue({ kind: "scrape", trigger: "startup", config });
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`[cron] ${signal} received, stopping scheduler`);
    scrapeJob?.stop();
    maintenanceJob?.stop();
    process.exit(0);
  });
}

console.log(`[cron] listening on :${config.port}`);

export default {
  port: config.port,
  fetch: app.fetch,
  // A full scrape of every source can run for a long time; the default 10s
  // request timeout would abort the /scrape response before it is written.
  idleTimeout: 60,
};
