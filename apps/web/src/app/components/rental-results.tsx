"use client";

/**
 * The rentals grid, fetched client-side through /api/rentals.
 * Mirror of car-results; see the note there.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RentalCard, RentalCardSkeleton, type RentalCardListing } from "./rental-card";
import { Pagination } from "./pagination";
import { useFeed } from "@/app/lib/use-feed";

export function RentalResults() {
  const search = useSearchParams();
  const queryString = search.toString();
  const { data, isPending, isError, refetch } = useFeed<RentalCardListing>(
    "/api/rentals",
    queryString,
  );
  const term = search.get("search") ?? undefined;
  const includeTaken = search.get("includeTaken") === "1";

  // Every current filter survives the toggle; only the toggle itself and the
  // page cursor are dropped, since including taken flats renumbers the pages.
  const withoutToggle = new URLSearchParams(search.toString());
  withoutToggle.delete("includeTaken");
  withoutToggle.delete("page");
  const withToggle = new URLSearchParams(withoutToggle.toString());
  withToggle.set("includeTaken", "1");

  if (isPending) return <ResultsSkeleton search={term} />;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-20 text-center">
        <p className="font-display text-lg font-semibold text-ink-200">
          Something went wrong loading rentals.
        </p>
        <p className="max-w-sm text-sm text-ink-500">This is usually temporary.</p>
        <button
          onClick={() => refetch()}
          className="mt-2 rounded-lg border border-accent/20 bg-accent/5 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/10"
        >
          Try again
        </button>
      </div>
    );
  }

  const takenHidden = data.takenHidden ?? 0;

  return (
    <>
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold tracking-tight text-ink-50">
          {term
            ? `Rentals matching "${term}"`
            : includeTaken
              ? "All rentals, including taken"
              : "Available now"}
        </h2>
        <p className="mt-1 text-sm text-ink-400">
          {data.total.toLocaleString("en-IN")} home{data.total !== 1 ? "s" : ""} match your filters
        </p>
        {/* Taken flats are hidden, not deleted. Saying how many and offering
            them is the difference between a filter and missing inventory. */}
        {takenHidden > 0 && (
          <Link
            href={`?${withToggle.toString()}`}
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-ink-500 underline-offset-4 transition hover:text-ink-300 hover:underline"
          >
            {takenHidden} already taken — show {takenHidden === 1 ? "it" : "them"} too
          </Link>
        )}
        {includeTaken && (
          <Link
            href={`?${withoutToggle.toString()}`}
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-ink-500 underline-offset-4 transition hover:text-ink-300 hover:underline"
          >
            Hide taken listings
          </Link>
        )}
      </div>

      {data.listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-20 text-center">
          <p className="font-display text-lg font-semibold text-ink-200">
            No homes match those filters.
          </p>
          <p className="max-w-sm text-sm text-ink-500">
            Try widening the budget, or a different bedroom count.
          </p>
        </div>
      ) : (
        <div className="grid animate-fade-in-up grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {data.listings.map((listing, i) => (
            <RentalCard key={listing.id} listing={listing} priority={i < 3} />
          ))}
        </div>
      )}

      <Pagination page={data.page} totalPages={data.totalPages} total={data.total} />
    </>
  );
}

function ResultsSkeleton({ search }: { search?: string }) {
  return (
    <>
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold tracking-tight text-ink-50">
          {search ? `Rentals matching "${search}"` : "Available now"}
        </h2>
        <div className="mt-2 h-4 w-40 animate-pulse rounded bg-white/[0.05]" />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <RentalCardSkeleton key={i} />
        ))}
      </div>
    </>
  );
}
