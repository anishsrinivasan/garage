export const dynamic = "force-dynamic";

import { Suspense } from "react";
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

  return (
    <div className="lg:flex lg:gap-6">
      <aside className="mb-6 shrink-0 lg:mb-0 lg:w-64">
        <MobileFilterToggle>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700">
              Filters
            </h2>
            <Suspense>
              <Filters options={filterOptions} />
            </Suspense>
          </div>
        </MobileFilterToggle>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">
            Car Listings
          </h1>
          <span className="text-sm text-gray-500">
            {result.total} result{result.total !== 1 ? "s" : ""}
          </span>
        </div>

        {result.listings.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center text-gray-500">
            No listings match your filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
  );
}
