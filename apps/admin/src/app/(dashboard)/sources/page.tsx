import { getAdminSources, getRecentRuns } from "@/lib/admin-queries";
import { PageHeader, Panel, Badge, EmptyState } from "@/components/ui";
import { SourceToggle } from "@/components/source-toggle";
import { RunControls } from "@/components/run-controls";
import { relativeAge } from "@preowned-cars/shared";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const [sources, runs] = await Promise.all([getAdminSources(), getRecentRuns(25)]);

  return (
    <>
      <PageHeader
        title="Sources & runs"
        description="Which handles and marketplaces feed the catalogue, and how their last runs went."
        action={<RunControls />}
      />

      <div className="space-y-4">
        <Panel title={`Sources (${sources.filter((s) => s.isActive).length} active)`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-xs">
              <thead className="text-ink-500">
                <tr className="text-left">
                  <th className="pb-2 font-mono text-[10px] uppercase tracking-wider">Handle</th>
                  <th className="pb-2 font-mono text-[10px] uppercase tracking-wider">Garage</th>
                  <th className="pb-2 font-mono text-[10px] uppercase tracking-wider">Type</th>
                  <th className="pb-2 font-mono text-[10px] uppercase tracking-wider">
                    Last run
                  </th>
                  <th className="pb-2 text-right font-mono text-[10px] uppercase tracking-wider">
                    Listings
                  </th>
                  <th className="pb-2 text-right font-mono text-[10px] uppercase tracking-wider">
                    Active
                  </th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <tr key={source.id} className="border-t border-white/5">
                    <td className="py-2 font-medium text-ink-100">
                      {source.platform === "instagram" ? `@${source.handle}` : source.handle}
                    </td>
                    <td className="py-2 text-ink-400">{source.garageName}</td>
                    <td className="py-2">
                      <Badge tone={source.platform === "instagram" ? "neutral" : "info"}>
                        {source.platform}
                      </Badge>
                    </td>
                    {/* Per-handle health. A single Instagram run covers fifteen
                        dealers and reports one status, so a handle whose session
                        expired or whose account went private is invisible at the
                        run level — this is where it shows up. */}
                    <td className="py-2">
                      <SourceHealth
                        status={source.lastScrapeStatus}
                        at={source.lastScrapedAt}
                        error={source.lastScrapeError}
                      />
                    </td>
                    <td className="py-2 text-right font-mono text-ink-300">
                      {source.listingCount}
                    </td>
                    <td className="py-2 text-right">
                      <SourceToggle id={source.id} isActive={source.isActive} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Recent runs">
          {runs.length === 0 ? (
            <EmptyState>No runs recorded yet.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-xs">
                <thead className="text-ink-500">
                  <tr className="text-left">
                    <th className="pb-2 font-mono text-[10px] uppercase tracking-wider">Source</th>
                    <th className="pb-2 font-mono text-[10px] uppercase tracking-wider">Status</th>
                    <th className="pb-2 font-mono text-[10px] uppercase tracking-wider">Trigger</th>
                    <th className="pb-2 text-right font-mono text-[10px] uppercase tracking-wider">
                      New
                    </th>
                    <th className="pb-2 text-right font-mono text-[10px] uppercase tracking-wider">
                      Updated
                    </th>
                    <th className="pb-2 text-right font-mono text-[10px] uppercase tracking-wider">
                      Delisted
                    </th>
                    <th className="pb-2 text-right font-mono text-[10px] uppercase tracking-wider">
                      When
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id} className="border-t border-white/5 align-top">
                      <td className="py-2 font-medium text-ink-100">{run.sourcePlatform}</td>
                      <td className="py-2">
                        <RunBadge status={run.status} />
                        {run.errorMessage && (
                          <p
                            title={run.errorMessage}
                            className="mt-1 max-w-xs truncate text-[10px] text-rose-300/80"
                          >
                            {run.errorMessage}
                          </p>
                        )}
                      </td>
                      <td className="py-2 text-ink-500">{run.trigger}</td>
                      <td className="py-2 text-right font-mono text-emerald-300">
                        {run.listingsNew ?? 0}
                      </td>
                      <td className="py-2 text-right font-mono text-ink-300">
                        {run.listingsUpdated ?? 0}
                      </td>
                      <td className="py-2 text-right font-mono text-ink-400">
                        {run.listingsDelisted ?? 0}
                      </td>
                      <td className="py-2 text-right text-ink-500">
                        {relativeAge(run.startedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

function SourceHealth({
  status,
  at,
  error,
}: {
  status: string | null;
  at: Date | null;
  error: string | null;
}) {
  if (!at || !status) {
    return <span className="text-ink-600">never run</span>;
  }
  const tone = status === "ok" ? "good" : status === "empty" ? "warn" : "bad";
  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1.5">
        <Badge tone={tone}>{status}</Badge>
        <span className="text-ink-500">{relativeAge(at)}</span>
      </span>
      {error && (
        <span title={error} className="max-w-[16rem] truncate text-[10px] text-rose-300/80">
          {error}
        </span>
      )}
    </span>
  );
}

function RunBadge({ status }: { status: string }) {
  if (status === "completed") return <Badge tone="good">ok</Badge>;
  if (status === "completed_with_errors") return <Badge tone="warn">partial</Badge>;
  if (status === "failed") return <Badge tone="bad">failed</Badge>;
  return <Badge tone="info">{status}</Badge>;
}
