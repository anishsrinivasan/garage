import Link from "next/link";
import { ExternalLink } from "lucide-react";
import {
  getDashboardStats,
  getRecentRuns,
  getLlmUsage,
  getDataQualityOutliers,
} from "@/lib/admin-queries";
import { getCronHealth, isCronConfigured } from "@/lib/cron-client";
import { PageHeader, StatCard, Panel, Badge, EmptyState } from "@/components/ui";
import { RunControls } from "@/components/run-controls";
import { relativeAge } from "@classifieds/shared";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [stats, runs, usage, outliers, cron] = await Promise.all([
    getDashboardStats(),
    getRecentRuns(8),
    getLlmUsage(),
    getDataQualityOutliers(),
    isCronConfigured() ? getCronHealth() : Promise.resolve(null),
  ]);

  const lastRun = runs[0];
  const lastFailure = runs.find((r) => r.status === "failed");

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Catalogue health, scrape status, and data quality."
        action={<RunControls />}
      />

      {/* A failed run is the single most consequential thing to know: it is how
          the catalogue went fifteen weeks without an Instagram scrape. */}
      {lastFailure && (
        <div className="mb-6 rounded-xl border border-rose-500/25 bg-rose-500/[0.07] p-4 text-sm">
          <p className="font-semibold text-rose-100">
            Last {lastFailure.sourcePlatform} run failed{" "}
            {relativeAge(lastFailure.startedAt)?.toLowerCase()}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-rose-200/70">
            {lastFailure.errorMessage?.slice(0, 400) ?? "No error recorded"}
          </p>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active listings" value={stats.active} href="/listings?status=active" />
        <StatCard label="Added this week" value={stats.addedThisWeek} tone="good" />
        <StatCard
          label="Needs review"
          value={stats.needsReview}
          tone={stats.needsReview > 0 ? "warn" : "neutral"}
          href="/review"
        />
        <StatCard
          label="Stale"
          value={stats.stale}
          tone={stats.stale > 0 ? "warn" : "neutral"}
          hint="Not confirmed in 45 days"
        />
        <StatCard label="Delisted" value={stats.delisted} href="/listings?status=delisted" />
        <StatCard label="Sold" value={stats.sold} href="/listings?status=sold" />
        <StatCard
          label="No photos"
          value={stats.noMedia}
          tone={stats.noMedia > 0 ? "warn" : "neutral"}
          href="/listings?status=no-media"
        />
        <StatCard
          label="Duplicates collapsed"
          value={stats.duplicatesCollapsed}
          href="/listings?status=duplicate"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Recent runs"
          action={
            <Link href="/sources" className="text-[11px] text-accent hover:underline">
              All runs
            </Link>
          }
        >
          {runs.length === 0 ? (
            <EmptyState>No scrape runs recorded yet.</EmptyState>
          ) : (
            <ul className="space-y-1.5">
              {runs.map((run) => (
                <li
                  key={run.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/5 px-3 py-2 text-xs"
                >
                  <span className="flex items-center gap-2">
                    <RunBadge status={run.status} />
                    <span className="font-medium text-ink-200">{run.sourcePlatform}</span>
                    <span className="text-ink-600">{run.trigger}</span>
                  </span>
                  <span className="flex items-center gap-3 text-ink-500">
                    <span>
                      +{run.listingsNew ?? 0} / ~{run.listingsUpdated ?? 0} / −
                      {run.listingsDelisted ?? 0}
                    </span>
                    <span>{relativeAge(run.startedAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Scheduler">
          {!cron ? (
            <EmptyState>
              Set <code className="font-mono">CRON_SERVICE_URL</code> to see the
              scheduler and trigger runs from here.
            </EmptyState>
          ) : !cron.ok ? (
            <p className="rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2 text-xs text-amber-200">
              Cron service unreachable: {cron.error}
            </p>
          ) : (
            <dl className="space-y-2 text-xs">
              <Row
                label="Scheduler"
                value={cron.data.scheduler.enabled ? "Enabled" : "Disabled"}
              />
              <Row
                label="Next scrape"
                value={
                  cron.data.scheduler.nextScrape
                    ? new Date(cron.data.scheduler.nextScrape).toLocaleString("en-IN")
                    : "—"
                }
              />
              <Row
                label="Next sweep"
                value={
                  cron.data.scheduler.nextMaintenance
                    ? new Date(cron.data.scheduler.nextMaintenance).toLocaleString("en-IN")
                    : "—"
                }
              />
              <Row
                label="Running now"
                value={cron.data.activeJob ? cron.data.activeJob.kind : "Idle"}
              />
            </dl>
          )}
        </Panel>

        <Panel title="LLM usage">
          {usage.length === 0 ? (
            <EmptyState>No LLM calls logged yet.</EmptyState>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-ink-500">
                <tr className="text-left">
                  <th className="pb-2 font-mono text-[10px] uppercase tracking-wider">
                    Operation
                  </th>
                  <th className="pb-2 text-right font-mono text-[10px] uppercase tracking-wider">
                    Calls
                  </th>
                  <th className="pb-2 text-right font-mono text-[10px] uppercase tracking-wider">
                    In
                  </th>
                  <th className="pb-2 text-right font-mono text-[10px] uppercase tracking-wider">
                    Out
                  </th>
                  <th className="pb-2 text-right font-mono text-[10px] uppercase tracking-wider">
                    Fail
                  </th>
                </tr>
              </thead>
              <tbody className="text-ink-300">
                {usage.map((row) => (
                  <tr key={`${row.operation}-${row.model}`} className="border-t border-white/5">
                    <td className="py-1.5">{row.operation}</td>
                    <td className="py-1.5 text-right font-mono">{row.calls}</td>
                    <td className="py-1.5 text-right font-mono">
                      {Number(row.inputTokens).toLocaleString("en-IN")}
                    </td>
                    <td className="py-1.5 text-right font-mono">
                      {Number(row.outputTokens).toLocaleString("en-IN")}
                    </td>
                    <td className="py-1.5 text-right font-mono">
                      {row.failures > 0 ? (
                        <span className="text-rose-300">{row.failures}</span>
                      ) : (
                        "0"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Data quality">
          <DataQuality outliers={outliers} />
        </Panel>
      </div>
    </>
  );
}

function DataQuality({
  outliers,
}: {
  outliers: Awaited<ReturnType<typeof getDataQualityOutliers>>;
}) {
  const groups = [
    { label: "Fuel", rows: outliers.fuels },
    { label: "Transmission", rows: outliers.transmissions },
    { label: "Body", rows: outliers.bodies },
  ].filter((g) => g.rows.length > 0);

  if (groups.length === 0 && outliers.makes.length === 0) {
    return (
      <p className="text-xs text-emerald-300">
        Every value matches the canonical set. Nothing to clean up.
      </p>
    );
  }

  return (
    <div className="space-y-3 text-xs">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-ink-500">
            {group.label} — outside the canonical set
          </p>
          <div className="flex flex-wrap gap-1.5">
            {group.rows.map((row) => (
              <span
                key={row.value}
                className="rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-amber-200"
              >
                {row.value} ({row.total})
              </span>
            ))}
          </div>
        </div>
      ))}
      {outliers.makes.length > 0 && (
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-ink-500">
            Makes still spelled more than one way
          </p>
          <ul className="space-y-1 text-ink-300">
            {outliers.makes.map((row) => (
              <li key={row.normalized}>
                {row.variants}{" "}
                <span className="font-mono text-ink-600">({row.total})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RunBadge({ status }: { status: string }) {
  if (status === "completed") return <Badge tone="good">ok</Badge>;
  if (status === "completed_with_errors") return <Badge tone="warn">partial</Badge>;
  if (status === "failed") return <Badge tone="bad">failed</Badge>;
  return <Badge tone="info">{status}</Badge>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="font-mono text-[10px] uppercase tracking-wider text-ink-500">
        {label}
      </dt>
      <dd className="text-ink-200">{value}</dd>
    </div>
  );
}
