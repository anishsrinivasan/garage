import { ListingCardSkeleton } from "@/app/components/listing-card";

export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-10 h-64 rounded-2xl border border-white/[0.06] bg-ink-900/40" />
      <div className="lg:flex lg:gap-8">
        <div className="mb-6 h-96 shrink-0 rounded-2xl bg-white/[0.02] lg:mb-0 lg:w-72" />
        <div className="min-w-0 flex-1">
          <div className="mb-6 h-8 w-52 rounded bg-white/[0.05]" />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <ListingCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/*
 * Scoped to the home feed via the (home) route group rather than sitting at the
 * app root.
 *
 * A root loading.tsx wraps every route in a Suspense boundary, so Next flushes
 * the shell — and commits HTTP 200 — before the page body runs. `notFound()`
 * and `redirect()` then have no status left to set: every missing listing,
 * rental and garage answered 200 with a "not found" page, which search engines
 * treat as a soft 404 and may index.
 *
 * It is also the wrong skeleton anywhere else: it draws a hero, a filter rail
 * and a grid of car cards, which is not what a detail page is about to show.
 */
