import { Suspense } from "react";
import { Sparkles, TrendingUp, LayoutGrid, Clock } from "lucide-react";
import {
  getListings,
  getFilterOptions,
  getCatalogueHealth,
} from "@/app/lib/queries";
import type { ListingFilters, SortField, SortOrder } from "@/app/lib/queries";
import { Filters } from "@/app/components/filters";
import { ListingCard, ListingCardSkeleton } from "@/app/components/listing-card";
import { Pagination } from "@/app/components/pagination";
import { MobileFilterToggle } from "@/app/components/mobile-filter-toggle";
import { relativeAge } from "@/app/lib/format";

/**
 * The feed changes only when a scrape runs, so it revalidates on a timer and on
 * the `listings` tag the scraper pings. It used to be `force-dynamic`, which
 * re-ran the full query plus five `SELECT DISTINCT` filter queries on every
 * single page view.
 */
export const revalidate = 300;

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

function parseFilters(sp: Record<string, string | undefined>): ListingFilters {
  const num = (v: string | undefined) => {
    if (!v) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    search: sp.search,
    minPrice: num(sp.minPrice),
    maxPrice: num(sp.maxPrice),
    minYear: num(sp.minYear),
    maxYear: num(sp.maxYear),
    fuelType: sp.fuelType,
    transmission: sp.transmission,
    bodyType: sp.bodyType,
    sourcePlatform: sp.sourcePlatform,
    city: sp.city,
    garage: sp.garage,
    freshness: sp.freshness,
    includeStale: sp.includeStale === "1",
    sortBy: (sp.sortBy as SortField) ?? "relevance",
    sortOrder: (sp.sortOrder as SortOrder) ?? "desc",
    page: num(sp.page) ?? 1,
  };
}

export default async function HomePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const filters = parseFilters(sp);

  const [filterOptions, health] = await Promise.all([
    getFilterOptions(),
    getCatalogueHealth(),
  ]);

  const lastRun = relativeAge(health.lastSuccessfulRun);

  return (
    <>
      <section className="relative mb-10 overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-900/40 px-6 py-10 backdrop-blur-sm sm:px-10 sm:py-14">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-24 left-1/4 h-[400px] w-[400px] rounded-full bg-accent/20 blur-[120px]" />
          <div className="absolute -bottom-24 right-1/4 h-[360px] w-[360px] rounded-full bg-electric/10 blur-[120px]" />
        </div>

        {/* The badge used to read "Updated hourly" unconditionally. It said that
            for the fifteen weeks the Instagram scraper was failing. It now
            reports the real timestamp of the last successful run. */}
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-ink-300">
          <Sparkles className="h-3 w-3 text-accent" />
          <span className="font-mono uppercase tracking-[0.18em]">
            {lastRun ? `AI-curated · Updated ${lastRun.toLowerCase()}` : "AI-curated"}
          </span>
        </div>

        <h1 className="mt-5 max-w-3xl font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
          <span className="text-gradient">Your next ride,</span>
          <br />
          <span className="text-accent-gradient">engineered to find you.</span>
        </h1>
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-300">
          Every preowned car listing across Cars24, CarDekho, and trusted
          Instagram dealers — deduplicated, normalized, and searchable in one place.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Stat
            icon={<LayoutGrid className="h-3.5 w-3.5" />}
            label="Live listings"
            value={health.activeListings.toLocaleString("en-IN")}
          />
          <Stat
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Added this week"
            value={health.addedThisWeek.toLocaleString("en-IN")}
          />
          <Stat
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            label="Garages"
            value={filterOptions.garages.length.toString()}
          />
        </div>
      </section>

      <div className="lg:flex lg:gap-8">
        <aside className="mb-6 shrink-0 lg:mb-0 lg:w-72">
          <MobileFilterToggle>
            <Suspense fallback={<div className="h-96" />}>
              <Filters options={filterOptions} />
            </Suspense>
          </MobileFilterToggle>
        </aside>

        <div className="min-w-0 flex-1">
          {/* The results grid is the only thing on this page that depends on the
              filters, so it's the only thing that should suspend. The old code
              wrapped Filters and Pagination, neither of which fetches. */}
          <Suspense key={JSON.stringify(filters)} fallback={<ResultsSkeleton search={sp.search} />}>
            <Results filters={filters} search={sp.search} />
          </Suspense>
        </div>
      </div>
    </>
  );
}

async function Results({
  filters,
  search,
}: {
  filters: ListingFilters;
  search?: string;
}) {
  const result = await getListings(filters);

  return (
    <>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink-50">
            {search ? `Results for "${search}"` : "Latest listings"}
          </h2>
          <p className="mt-1 text-sm text-ink-400">
            {result.total.toLocaleString("en-IN")} car
            {result.total !== 1 ? "s" : ""} match your filters
          </p>
        </div>
      </div>

      {result.listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-20 text-center">
          <p className="font-display text-lg font-semibold text-ink-200">
            No cars match those filters.
          </p>
          <p className="max-w-sm text-sm text-ink-500">
            Try widening the price or year range, clearing a fuel or body type,
            or extending the &ldquo;Listed&rdquo; window.
          </p>
        </div>
      ) : (
        <div className="grid animate-fade-in-up grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {result.listings.map((listing, i) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              // Only the first row is above the fold; marking more than that
              // priority would compete with itself for bandwidth.
              priority={i < 3}
            />
          ))}
        </div>
      )}

      <Suspense>
        <Pagination
          page={result.page}
          totalPages={result.totalPages}
          total={result.total}
        />
      </Suspense>
    </>
  );
}

function ResultsSkeleton({ search }: { search?: string }) {
  return (
    <>
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold tracking-tight text-ink-50">
          {search ? `Results for "${search}"` : "Latest listings"}
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

function Stat({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="surface flex items-center gap-3 rounded-xl px-4 py-2.5">
      {icon && (
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent ring-1 ring-inset ring-accent/20">
          {icon}
        </span>
      )}
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-500">
          {label}
        </p>
        <p className="font-display text-lg font-bold leading-none text-ink-50">
          {value}
        </p>
      </div>
    </div>
  );
}
