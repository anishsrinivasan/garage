import Link from "next/link";
import { getReports, getFeedback } from "@/lib/admin-queries";
import { PageHeader, Panel, Badge, EmptyState } from "@/components/ui";
import { ReportActions } from "@/components/report-actions";
import { relativeAge } from "@classifieds/shared";

export const dynamic = "force-dynamic";

/**
 * Listing reports and site feedback. Both tables were being written to by the
 * public site and read by nothing.
 */
export default async function InboxPage() {
  const [reports, notes] = await Promise.all([getReports(), getFeedback()]);

  return (
    <>
      <PageHeader
        title="Inbox"
        description="Listing reports and feedback from the public site."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={`Reports (${reports.filter((r) => r.status === "open").length} open)`}>
          {reports.length === 0 ? (
            <EmptyState>No reports.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {reports.map((report) => (
                <li
                  key={report.id}
                  className="rounded-lg border border-white/5 p-3 text-xs"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={report.status === "open" ? "warn" : "good"}>
                          {report.status}
                        </Badge>
                        <span className="font-semibold text-ink-200">
                          {report.reportType}
                        </span>
                        <span className="text-ink-600">
                          {relativeAge(report.createdAt)}
                        </span>
                      </div>
                      {report.make && (
                        <Link
                          href={`/listings/${report.listingId}`}
                          className="mt-1 block text-ink-400 hover:text-accent"
                        >
                          {report.year} {report.make} {report.model}
                        </Link>
                      )}
                      {report.description && (
                        <p className="mt-1 text-ink-500">{report.description}</p>
                      )}
                    </div>
                    {report.status === "open" && <ReportActions id={report.id} />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Feedback">
          {notes.length === 0 ? (
            <EmptyState>No feedback yet.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {notes.map((note) => (
                <li key={note.id} className="rounded-lg border border-white/5 p-3 text-xs">
                  <div className="flex items-center gap-2">
                    <Badge>{note.category}</Badge>
                    {note.rating != null && (
                      <span className="font-mono text-ink-400">{note.rating}/5</span>
                    )}
                    <span className="text-ink-600">{relativeAge(note.createdAt)}</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-ink-300">{note.message}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
