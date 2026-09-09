import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Clock, Home, MapPin } from "lucide-react";
import { getRentals, getRentalFacets, type RentalFilters } from "@/app/lib/rentals-queries";
import { RentalFilters as FiltersPanel } from "@/app/components/rental-filters";
import { RentalResults } from "@/app/components/rental-results";
import { MobileFilterToggle } from "@/app/components/mobile-filter-toggle";

/**
 * Rendered per request, not ISR.
 *
 * Next classified this route dynamic because it reads searchParams, and
 * `revalidate` only ever applied to the cached data underneath. vinext reads
 * the same export as "prerender and revalidate every 300s", which for a
 * filter-driven feed means one ISR key per filter combination — and on a cold
 * key it serves the shell and fills the cache behind the request, so the first
 * visitor to any new combination saw a page with no results. Being explicit
 * makes both runtimes agree.
 */
export const dynamic = "force-dynamic";

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
          {/* Fetched in the browser through /api/rentals. */}
          <RentalResults />
        </div>
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
