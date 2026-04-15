export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { Sparkles, TrendingUp, LayoutGrid } from "lucide-react";
import { getListings, getFilterOptions } from "@/app/lib/queries";
import type { ListingFilters, SortField, SortOrder } from "@/app/lib/queries";
import { Filters } from "@/app/components/filters";
import { ListingCard } from "@/app/components/listing-card";
import { Pagination } from "@/app/components/pagination";
import { MobileFilterToggle } from "@/app/components/mobile-filter-toggle";

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function HomePage({ searchParams }: PageProps) {
  const sp = await searchParams;

  const filters: ListingFilters = {
    search: sp.search,
    minPrice: sp.minPrice ? Number(sp.minPrice) : undefined,
    maxPrice: sp.maxPrice ? Number(sp.maxPrice) : undefined,
    minYear: sp.minYear ? Number(sp.minYear) : undefined,
    maxYear: sp.maxYear ? Number(sp.maxYear) : undefined,
    fuelType: sp.fuelType,
    transmission: sp.transmission,
    bodyType: sp.bodyType,
    sourcePlatform: sp.sourcePlatform,
    city: sp.city,
    sortBy: (sp.sortBy as SortField) ?? "scrapedAt",
    sortOrder: (sp.sortOrder as SortOrder) ?? "desc",
    page: sp.page ? Number(sp.page) : 1,
  };

  const [result, filterOptions] = await Promise.all([
    getListings(filters),
    getFilterOptions(),
  ]);

  const sourceCount = filterOptions.platforms.length;
  const cityCount = filterOptions.cities.length;

  return (
    <>
      <section className="relative mb-10 overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-900/40 px-6 py-10 backdrop-blur-sm sm:px-10 sm:py-14">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-24 left-1/4 h-[400px] w-[400px] rounded-full bg-accent/20 blur-[120px]" />
          <div className="absolute -bottom-24 right-1/4 h-[360px] w-[360px] rounded-full bg-electric/10 blur-[120px]" />
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-ink-300">
          <Sparkles className="h-3 w-3 text-accent" />
          <span className="font-mono uppercase tracking-[0.18em]">
            AI-curated · Updated hourly
          </span>
        </div>

        <h1 className="mt-5 max-w-3xl font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
          <span className="text-gradient">Your next ride,</span>
          <br />
          <span className="text-accent-gradient">engineered to find you.</span>
        </h1>
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-300">
          Every preowned car listing across Cars24, CarDekho, OLX, and trusted
          Instagram dealers — deduplicated, normalized, and searchable in one place.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Stat
            icon={<LayoutGrid className="h-3.5 w-3.5" />}
            label="Live listings"
            value={result.total.toLocaleString("en-IN")}
          />
          <Stat
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            label="Sources"
            value={sourceCount.toString()}
          />
          <Stat label="Cities" value={cityCount.toString()} />
        </div>
      </section>

      <div className="lg:flex lg:gap-8">
        <aside className="mb-6 shrink-0 lg:mb-0 lg:w-72">
          <MobileFilterToggle>
            <Suspense>
              <Filters options={filterOptions} />
            </Suspense>
          </MobileFilterToggle>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight text-ink-50">
                {sp.search ? `Results for "${sp.search}"` : "Latest listings"}
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
                Try widening the price or year range, or clearing a fuel / body
                type constraint.
              </p>
            </div>
          ) : (
            <div className="grid animate-fade-in-up grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {result.listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing as any} />
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
        </div>
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
