import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Clock, Home, MapPin } from "lucide-react";
import { getRentals, getRentalFacets, type RentalFilters } from "@/app/lib/rentals-queries";
import { RentalFilters as FiltersPanel } from "@/app/components/rental-filters";
import { RentalCard, RentalCardSkeleton } from "@/app/components/rental-card";
import { Pagination } from "@/app/components/pagination";
import { MobileFilterToggle } from "@/app/components/mobile-filter-toggle";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Rentals in Chennai",
  description:
    "Flats for rent from Chennai brokers, gathered from Instagram and dated honestly. Every listing shows when it was posted and when we last confirmed it.",
  alternates: { canonical: "/rent" },
};

function parse(sp: Record<string, string | undefined>): RentalFilters {
  const num = (v?: string) => {
    if (!v) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    search: sp.search,
    minRent: num(sp.minRent),
    maxRent: num(sp.maxRent),
    minArea: num(sp.minArea),
    maxArea: num(sp.maxArea),
    bhk: sp.bhk?.split(",").map(Number).filter(Number.isFinite),
    furnishing: sp.furnishing,
    propertyType: sp.propertyType,
    tenantPreference: sp.tenantPreference,
    locality: sp.locality,
    freshness: sp.freshness,
    includeStale: sp.includeStale === "1",
    includeTaken: sp.includeTaken === "1",
    sortBy: (sp.sortBy as RentalFilters["sortBy"]) ?? "relevance",
    sortOrder: sp.sortBy === "rent" ? "asc" : "desc",
    page: num(sp.page) ?? 1,
  };
}

export default async function RentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const filters = parse(sp);
  const facets = await getRentalFacets();

  return (
    <>
      <section className="relative mb-10 overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-900/40 px-6 py-10 backdrop-blur-sm sm:px-10 sm:py-12">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-24 left-1/4 h-[360px] w-[360px] rounded-full bg-electric/15 blur-[120px]" />
          <div className="absolute -bottom-24 right-1/4 h-[320px] w-[320px] rounded-full bg-accent/15 blur-[120px]" />
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-ink-300">
          <Home className="h-3 w-3 text-accent" />
          <span className="font-mono uppercase tracking-[0.18em]">Chennai · from Instagram brokers</span>
        </div>

        <h1 className="mt-5 max-w-3xl font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
          <span className="text-gradient">Flats that are</span>{" "}
          <span className="text-accent-gradient">actually still available.</span>
        </h1>
        {/* The promise, stated plainly. It is the one thing no Indian portal
            offers, and the entire freshness subsystem exists to back it. */}
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-300">
          Every listing carries the date it was posted and the date we last
          confirmed it. Nothing here is quietly six months old.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Stat icon={<Home className="h-3.5 w-3.5" />} label="Live rentals" value={facets.total.toLocaleString("en-IN")} />
          <Stat icon={<MapPin className="h-3.5 w-3.5" />} label="Localities" value={facets.localities.length.toString()} />
          <Stat icon={<Clock className="h-3.5 w-3.5" />} label="Freshness" value="7-day" />
        </div>
      </section>

      <div className="lg:flex lg:gap-8">
        <aside className="mb-6 shrink-0 lg:mb-0 lg:w-72">
          <MobileFilterToggle>
            <Suspense fallback={<div className="h-96" />}>
              <FiltersPanel facets={facets} />
            </Suspense>
          </MobileFilterToggle>
        </aside>

        <div className="min-w-0 flex-1">
          <Suspense key={JSON.stringify(filters)} fallback={<Skeleton />}>
            <Results filters={filters} search={sp.search} params={sp} />
          </Suspense>
        </div>
      </div>
    </>
  );
}

async function Results({
  filters,
  search,
  params,
}: {
  filters: RentalFilters;
  search?: string;
  params: Record<string, string | undefined>;
}) {
  const result = await getRentals(filters);

  // Every current filter survives the toggle; only the toggle itself and the
  // page cursor are dropped, since including taken flats renumbers the pages.
  const cleanParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "includeTaken" && key !== "page") cleanParams[key] = value;
  }

  return (
    <>
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold tracking-tight text-ink-50">
          {search
            ? `Rentals matching "${search}"`
            : filters.includeTaken
              ? "All rentals, including taken"
              : "Available now"}
        </h2>
        <p className="mt-1 text-sm text-ink-400">
          {result.total.toLocaleString("en-IN")} home{result.total !== 1 ? "s" : ""} match your filters
        </p>
        {/* Taken flats are hidden, not deleted. Saying how many and offering
            them is the difference between a filter and missing inventory. */}
        {result.takenHidden > 0 && (
          <Link
            href={`?${new URLSearchParams({ ...cleanParams, includeTaken: "1" })}`}
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-ink-500 underline-offset-4 transition hover:text-ink-300 hover:underline"
          >
            {result.takenHidden} already taken — show {result.takenHidden === 1 ? "it" : "them"} too
          </Link>
        )}
        {filters.includeTaken && (
          <Link
            href={`?${new URLSearchParams(cleanParams)}`}
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-ink-500 underline-offset-4 transition hover:text-ink-300 hover:underline"
          >
            Hide taken listings
          </Link>
        )}
      </div>

      {result.listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-20 text-center">
          <p className="font-display text-lg font-semibold text-ink-200">
            {result.total === 0 && !search
              ? "No rentals indexed yet."
              : "No homes match those filters."}
          </p>
          <p className="max-w-sm text-sm text-ink-500">
            {result.total === 0 && !search
              ? "Add Chennai broker accounts in the admin, then run a rentals scrape."
              : "Try widening the budget, adding a bedroom count, or extending the “Listed” window."}
          </p>
        </div>
      ) : (
        <div className="grid animate-fade-in-up grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {result.listings.map((listing, i) => (
            <RentalCard key={listing.id} listing={listing} priority={i < 3} />
          ))}
        </div>
      )}

      <Suspense>
        <Pagination page={result.page} totalPages={result.totalPages} total={result.total} />
      </Suspense>
    </>
  );
}

function Skeleton() {
  return (
    <>
      <div className="mb-6 h-8 w-48 animate-pulse rounded bg-white/[0.05]" />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <RentalCardSkeleton key={i} />
        ))}
      </div>
    </>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="surface flex items-center gap-3 rounded-xl px-4 py-2.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent ring-1 ring-inset ring-accent/20">
        {icon}
      </span>
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-500">{label}</p>
        <p className="font-display text-lg font-bold leading-none text-ink-50">{value}</p>
      </div>
    </div>
  );
}
