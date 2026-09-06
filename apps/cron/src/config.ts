/**
 * Cron service configuration, all env-driven so Dokploy can tune schedules
 * without a redeploy.
 */

export type CronConfig = {
  port: number;
  /** Shared secret for the mutating HTTP endpoints. Required in production. */
  apiToken: string | null;
  /** Cron expression for the full scrape. Default: 03:30 IST daily. */
  scrapeSchedule: string;
  /** Cron expression for the delist + dedupe sweep. Default: hourly. */
  maintenanceSchedule: string;
  timezone: string;
  /** Skip the scheduler entirely and only serve the HTTP API. */
  schedulerEnabled: boolean;
  /** Run a scrape once at boot. Off by default so a restart loop can't hammer. */
  runOnStart: boolean;
  /** Web app endpoint to bust the listings cache after a run. */
  revalidateUrl: string | null;
  revalidateSecret: string | null;
};

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function loadConfig(): CronConfig {
  const apiToken = process.env.CRON_API_TOKEN ?? null;

  if (!apiToken && process.env.NODE_ENV === "production") {
    // Refuse to run open in production: these endpoints start scrapes and
    // delist listings, and a homelab box is often port-forwarded.
    throw new Error(
      "CRON_API_TOKEN must be set in production — the trigger endpoints mutate the catalogue",
    );
  }

  return {
    port: Number(process.env.PORT ?? 3333),
    apiToken,
    // 03:30 daily: after Instagram's overnight quiet period, before morning
    // traffic, and far enough from midnight to avoid everyone else's cron.
    scrapeSchedule: process.env.CRON_SCRAPE_SCHEDULE ?? "30 3 * * *",
    maintenanceSchedule: process.env.CRON_MAINTENANCE_SCHEDULE ?? "15 * * * *",
    timezone: process.env.CRON_TIMEZONE ?? "Asia/Kolkata",
    schedulerEnabled: bool(process.env.CRON_ENABLED, true),
    runOnStart: bool(process.env.CRON_RUN_ON_START, false),
    revalidateUrl: process.env.WEB_REVALIDATE_URL ?? null,
    revalidateSecret: process.env.REVALIDATE_SECRET ?? null,
  };
}
