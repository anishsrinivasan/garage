import Link from "next/link";
import { getReviewQueue } from "@/lib/admin-queries";
import { PageHeader, EmptyState } from "@/components/ui";
import { ReviewActions } from "@/components/review-actions";
import { extractPriceCandidates } from "@preowned-cars/shared";

export const dynamic = "force-dynamic";

/**
 * Listings the price checker flagged — either the model's number disagreed with
 * the caption by a power of ten, or the price is outside a plausible band for
 * the marque. Nothing is auto-rejected; a real Rolls-Royce should still list.
 */
export default async function ReviewPage() {
  const rows = await getReviewQueue();

  return (
    <>
      <PageHeader
        title="Review queue"
        description="Listings whose price looks wrong. Confirm or correct each one."
      />

      {rows.length === 0 ? (
        <EmptyState>Nothing flagged. Every price looks plausible.</EmptyState>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            // Show what the caption itself says, so the correct figure is
            // usually visible without opening Instagram.
            const candidates = extractPriceCandidates(row.description);
            return (
              <div
                key={row.id}
                className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/listings/${row.id}`}
                      className="font-display text-sm font-bold text-ink-100 hover:text-accent"
                    >
                      {row.year} {row.make} {row.model}
                    </Link>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {row.garageName ?? "—"}
                    </p>
                    <p className="mt-2 text-xs text-amber-200/80">{row.reviewReason}</p>

                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                      <span className="text-ink-400">
                        Stored:{" "}
                        <span className="font-mono text-ink-100">
                          {row.price
                            ? `₹${Number(row.price).toLocaleString("en-IN")}`
                            : "none"}
                        </span>
                      </span>
                      {candidates.length > 0 && (
                        <span className="text-ink-400">
                          Caption says:{" "}
                          <span className="font-mono text-emerald-300">
                            {candidates
                              .map((c) => `₹${c.toLocaleString("en-IN")}`)
                              .join(" / ")}
                          </span>
                        </span>
                      )}
                      <a
                        href={row.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline"
                      >
                        Open source
                      </a>
                    </div>
                  </div>

                  <ReviewActions
                    id={row.id}
                    suggestions={candidates}
                    currentPrice={row.price}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
