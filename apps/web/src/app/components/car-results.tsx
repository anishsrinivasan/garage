"use client";

/**
 * The cars grid, fetched client-side through /api/listings.
 *
 * Server rendering this meant a slow database call held the HTML stream open,
 * and on Workers a failed one left the page stuck on its skeleton. Fetching it
 * gives the visitor a retry instead of a dead page, and the shell renders
 * immediately either way.
 */
import { useSearchParams } from "next/navigation";
import { ListingCard, ListingCardSkeleton, type CardListing } from "./listing-card";
import { SwipeDeck } from "./swipe-deck";
import { ListingPreview } from "./listing-preview";
import { usePreview } from "@/app/lib/use-preview";
import { useQueryState, parseAsInteger } from "nuqs";
import { ViewToggle, useFeedMode } from "./view-toggle";
import { useBookmarks } from "@/app/lib/use-bookmarks";
import { useDismissed } from "@/app/lib/use-dismissed";
import { Pagination } from "./pagination";
import { useFeed } from "@/app/lib/use-feed";

export function CarResults() {
  const search = useSearchParams();
  const queryString = search.toString();
  const { data, isPending, isError, refetch } = useFeed<CardListing>(
    "/api/listings",
    queryString,
  );
  const term = search.get("search") ?? undefined;
  const [mode, setMode] = useFeedMode();
  const { toggle, isBookmarked } = useBookmarks();
  const { open: openPreview } = usePreview();
  const [, setPage] = useQueryState(
    "page",
    parseAsInteger.withDefault(1).withOptions({ history: "replace", scroll: false }),
  );
  const { dismiss, isDismissed, count: dismissedCount, restoreAll } = useDismissed("cars");

  if (isPending) return <ResultsSkeleton search={term} />;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-20 text-center">
        <p className="font-display text-lg font-semibold text-ink-200">
          Something went wrong loading listings.
        </p>
        <p className="max-w-sm text-sm text-ink-500">
          This is usually temporary.
        </p>
        <button
          onClick={() => refetch()}
          className="mt-2 rounded-lg border border-accent/20 bg-accent/5 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/10"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold tracking-tight text-ink-50">
          {term ? `Cars matching "${term}"` : "Available now"}
        </h2>
        <p className="mt-1 text-sm text-ink-400">
          {data.total.toLocaleString("en-IN")} car{data.total !== 1 ? "s" : ""} match your filters
        </p>
      </div>

      <ViewToggle
        mode={mode}
        onChange={setMode}
        dismissedCount={dismissedCount}
        onRestore={restoreAll}
      />

      {mode === "swipe" ? (
        <SwipeDeck
          items={data.listings.filter((l) => !isDismissed(l.id))}
          emptyMessage="No cars match those filters."
          renderCard={(listing) => (
            <ListingCard listing={listing} priority showBookmark={false} />
          )}
          onOpen={(listing) => openPreview(listing.id)}
          hasMore={data.page < data.totalPages}
          onExhausted={() => {
            if (data.page < data.totalPages) setPage(data.page + 1);
          }}
          onDecide={(listing, decision) => {
            // Right saves into the same bookmarks the grid hearts and /saved
            // use; left is remembered per-browser so a passed car does not come
            // back on the next visit.
            if (decision === "save") {
              if (!isBookmarked(listing.id)) toggle(listing.id);
            } else {
              dismiss(listing.id);
            }
          }}
        />
      ) : data.listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-20 text-center">
          <p className="font-display text-lg font-semibold text-ink-200">
            No cars match those filters.
          </p>
          <p className="max-w-sm text-sm text-ink-500">
            Try widening the budget or extending the “Listed” window.
          </p>
        </div>
      ) : (
        <div className="grid animate-fade-in-up grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {data.listings.map((listing, i) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              priority={i < 3}
              onPreview={openPreview}
            />
          ))}
        </div>
      )}

      {mode === "grid" && (
        <Pagination page={data.page} totalPages={data.totalPages} total={data.total} />
      )}

      <ListingPreview />
    </>
  );
}

function ResultsSkeleton({ search }: { search?: string }) {
  return (
    <>
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold tracking-tight text-ink-50">
          {search ? `Cars matching "${search}"` : "Available now"}
        </h2>
        <div className="mt-2 h-4 w-40 animate-pulse rounded bg-white/[0.05]" />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <ListingCardSkeleton key={i} />
        ))}
      </div>
    </>
  );
}
