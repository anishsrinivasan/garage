/**
 * One definition of "what the query string means", shared by the pages that
 * render a feed and the API routes that serve it. Two copies would drift, and
 * the drift would show up as a filter that works when the page loads and stops
 * working when the client refetches.
 */
import type { ListingFilters, SortField, SortOrder } from "./queries";
import type { RentalFilters } from "./rentals-queries";

export type Params = Record<string, string | undefined>;

const num = (v: string | undefined) => {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export function paramsFromSearch(search: URLSearchParams): Params {
  const out: Params = {};
  for (const [k, v] of search.entries()) out[k] = v;
  return out;
}

export function parseCarFilters(sp: Params): ListingFilters {
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

export function parseRentalFilters(sp: Params): RentalFilters {
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
