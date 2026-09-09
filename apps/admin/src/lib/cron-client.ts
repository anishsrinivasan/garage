/**
 * Thin client for the cron service.
 *
 * The dashboard triggers scrapes through the cron service rather than running
 * them in-process: a scrape drives a headless Chromium for minutes, which a
 * Next.js server action has no business doing, and routing everything through
 * one service keeps the "only one scrape at a time" mutex meaningful.
 *
 * Reading an Instagram profile goes the same way, for the same reason plus a
 * harder one: this app is deployed to Cloudflare Workers, where Playwright
 * cannot run at all.
 */

const BASE_URL = process.env.CRON_SERVICE_URL;
const TOKEN = process.env.CRON_API_TOKEN;

export type CronJob = {
  id: string;
  kind: string;
  status: string;
  trigger: string;
  queuedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  error: string | null;
};

export function isCronConfigured(): boolean {
  return Boolean(BASE_URL);
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  if (!BASE_URL) {
    return {
      ok: false,
      error: "CRON_SERVICE_URL is not set — point it at the cron service to trigger runs from here",
    };
  }
  try {
    const res = await fetch(`${BASE_URL.replace(/\/+$/, "")}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
        ...init?.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        error: (body as { error?: string })?.error ?? `cron service returned ${res.status}`,
      };
    }
    return { ok: true, data: body as T };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function triggerScrape(body: { sources?: string[]; handles?: string[] }) {
  return request<CronJob>("/scrape", {
    method: "POST",
    body: JSON.stringify({ ...body, trigger: "admin" }),
  });
}

export function triggerMaintenance() {
  return request<CronJob>("/maintenance", { method: "POST" });
}

export function getCronHealth() {
  return request<{
    ok: boolean;
    scheduler: {
      enabled: boolean;
      nextScrape: string | null;
      nextMaintenance: string | null;
    };
    activeJob: CronJob | null;
  }>("/health");
}

export function getCronJobs() {
  return request<{ active: CronJob | null; history: CronJob[] }>("/jobs");
}

export type InstagramProfilePreview = {
  handle: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  externalUrl: string | null;
  followers: number | null;
  isPrivate: boolean;
  exists: boolean;
};

/** Reads an Instagram profile on the cron host, which has a browser. */
export async function fetchProfileViaCron(
  handle: string,
): Promise<{ ok: true; profile: InstagramProfilePreview } | { ok: false; error: string }> {
  const result = await request<{ profile: InstagramProfilePreview }>(
    "/instagram/profile",
    { method: "POST", body: JSON.stringify({ handle }) },
  );
  return result.ok ? { ok: true, profile: result.data.profile } : result;
}
