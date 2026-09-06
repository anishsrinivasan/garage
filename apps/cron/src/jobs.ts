/**
 * Job execution and in-memory run state.
 *
 * A scrape opens a headless browser and can run for many minutes, so jobs are
 * serialised behind a single mutex: two concurrent Instagram runs would fight
 * over the same session cookies and get the account rate-limited. HTTP triggers
 * therefore return 202 with a job id rather than blocking the request.
 */

import { runScrape, runMaintenance, ALL_SOURCES, type SourceName } from "@preowned-cars/scraper";
import type { CronConfig } from "./config";

export type JobKind = "scrape" | "maintenance";
export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export type JobRecord = {
  id: string;
  kind: JobKind;
  trigger: string;
  sources: SourceName[] | null;
  status: JobStatus;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  result: unknown;
  error: string | null;
};

const MAX_HISTORY = 50;

const history: JobRecord[] = [];
let active: JobRecord | null = null;
/** Serialises jobs; a scrape and a sweep must never overlap. */
let queue: Promise<void> = Promise.resolve();

export function getActiveJob(): JobRecord | null {
  return active;
}

export function getHistory(): JobRecord[] {
  return [...history];
}

export function getJob(id: string): JobRecord | null {
  if (active?.id === id) return active;
  return history.find((job) => job.id === id) ?? null;
}

function record(job: JobRecord): void {
  history.unshift(job);
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
}

/**
 * Tells the web app to drop its cached feed so a finished scrape is visible
 * immediately rather than after the revalidation window. Best-effort: a failure
 * here must never fail the run that already succeeded.
 */
async function revalidateWeb(config: CronConfig): Promise<void> {
  if (!config.revalidateUrl || !config.revalidateSecret) return;
  try {
    const res = await fetch(config.revalidateUrl, {
      method: "POST",
      headers: { "x-revalidate-secret": config.revalidateSecret },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn(`[cron] revalidate returned ${res.status}`);
    }
  } catch (err) {
    console.warn(
      `[cron] revalidate failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export type EnqueueOptions = {
  kind: JobKind;
  trigger: string;
  sources?: SourceName[];
  handles?: string[];
  config: CronConfig;
};

/**
 * Queues a job and returns immediately with its record. The caller polls
 * `/jobs/:id` — a scrape routinely outlives any sensible HTTP timeout.
 */
export function enqueue(options: EnqueueOptions): JobRecord {
  const job: JobRecord = {
    id: crypto.randomUUID(),
    kind: options.kind,
    trigger: options.trigger,
    sources: options.kind === "scrape" ? (options.sources ?? ALL_SOURCES) : null,
    status: "queued",
    queuedAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    result: null,
    error: null,
  };

  queue = queue.then(async () => {
    active = job;
    job.status = "running";
    job.startedAt = new Date().toISOString();
    const started = Date.now();
    console.log(`[cron] ${job.kind} started (trigger=${job.trigger}, id=${job.id})`);

    try {
      job.result =
        job.kind === "scrape"
          ? await runScrape(job.sources ?? ALL_SOURCES, {
              trigger: options.trigger,
              handles: options.handles,
            })
          : await runMaintenance();
      job.status = "succeeded";
      await revalidateWeb(options.config);
    } catch (err) {
      job.status = "failed";
      job.error = err instanceof Error ? err.message : String(err);
      console.error(`[cron] ${job.kind} failed: ${job.error}`);
    } finally {
      job.finishedAt = new Date().toISOString();
      job.durationMs = Date.now() - started;
      active = null;
      record(job);
      console.log(
        `[cron] ${job.kind} ${job.status} in ${(job.durationMs / 1000).toFixed(1)}s`,
      );
    }
  });

  return job;
}

export function queueDepth(): number {
  return active ? 1 : 0;
}
