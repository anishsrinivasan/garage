import { db, carListings } from "@preowned-cars/db";
import {
  eq,
  and,
  gte,
  lte,
  ilike,
  inArray,
  or,
  asc,
  desc,
  sql,
  count,
  SQL,
} from "drizzle-orm";

export type SortField = "price" | "year" | "kmDriven" | "scrapedAt";
export type SortOrder = "asc" | "desc";

export interface ListingFilters {
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  minYear?: number;
  maxYear?: number;
  fuelType?: string;
  transmission?: string;
  bodyType?: string;
  sourcePlatform?: string;
  city?: string;
  sortBy?: SortField;
  sortOrder?: SortOrder;
  page?: number;
  pageSize?: number;
}

const PAGE_SIZE = 24;

// Premium-segment makes we want to surface on the default "Featured" feed.
// Matched case-insensitively against car_listings.make.
const PREMIUM_BRANDS_LOWER = [
  "bmw",
  "mercedes-benz",
  "mercedes",
  "audi",
  "porsche",
  "lexus",
  "jaguar",
  "land rover",
  "range rover",
  "volvo",
  "mini",
  "lamborghini",
  "ferrari",
  "bentley",
  "rolls-royce",
  "rolls royce",
  "maserati",
  "aston martin",
  "mclaren",
  "jeep",
  "bmw motorrad",
];

export async function getListings(filters: ListingFilters) {
  const conditions: SQL[] = [eq(carListings.isActive, true)];

  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(carListings.make, term),
        ilike(carListings.model, term),
        ilike(carListings.variant, term),
        ilike(carListings.description, term)
      )!
    );
  }

  if (filters.minPrice != null) {
    conditions.push(gte(carListings.price, String(filters.minPrice)));
  }
  if (filters.maxPrice != null) {
    conditions.push(lte(carListings.price, String(filters.maxPrice)));
  }
  if (filters.minYear != null) {
    conditions.push(gte(carListings.year, filters.minYear));
  }
  if (filters.maxYear != null) {
    conditions.push(lte(carListings.year, filters.maxYear));
  }
  if (filters.fuelType) {
    conditions.push(eq(carListings.fuelType, filters.fuelType));
  }
  if (filters.transmission) {
    conditions.push(eq(carListings.transmission, filters.transmission));
  }
  if (filters.bodyType) {
    conditions.push(eq(carListings.bodyType, filters.bodyType));
  }
  if (filters.sourcePlatform) {
    conditions.push(eq(carListings.sourcePlatform, filters.sourcePlatform));
  }
  if (filters.city) {
    conditions.push(eq(carListings.city, filters.city));
  }

  const where = and(...conditions);

  const sortField = filters.sortBy ?? "scrapedAt";
  const sortOrder = filters.sortOrder ?? "desc";

  // Default "Featured" ordering (sortBy=scrapedAt + desc):
  //   1. Available listings before sold ones.
  //   2. Listings with at least one media item first.
  //   3. Premium-segment brands boosted above mass-market ones.
  //   4. Higher priced cars first (premium-within-premium).
  //   5. Most recently scraped first.
  // Other explicit sort choices (price / year / kmDriven) bypass this.
  const useFeaturedOrder = sortField === "scrapedAt" && sortOrder === "desc";
  const orderBy = useFeaturedOrder
    ? [
        sql`(${carListings.saleStatus} = 'available') DESC`,
        sql`(jsonb_array_length(coalesce(${carListings.media}, '[]'::jsonb)) > 0) DESC`,
        sql`(CASE WHEN lower(${carListings.make}) = ANY(ARRAY[${sql.join(
          PREMIUM_BRANDS_LOWER.map((b) => sql`${b}`),
          sql`, `,
        )}]::text[]) THEN 1 ELSE 0 END) DESC`,
        sql`${carListings.price} DESC NULLS LAST`,
        desc(carListings.scrapedAt),
      ]
    : [
        sortOrder === "asc"
          ? asc(
              {
                price: carListings.price,
                year: carListings.year,
                kmDriven: carListings.kmDriven,
                scrapedAt: carListings.scrapedAt,
              }[sortField],
            )
          : desc(
              {
                price: carListings.price,
                year: carListings.year,
                kmDriven: carListings.kmDriven,
                scrapedAt: carListings.scrapedAt,
              }[sortField],
            ),
      ];

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  const [listings, [{ total }]] = await Promise.all([
    db
      .select()
      .from(carListings)
      .where(where)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(carListings).where(where),
  ]);

  return {
    listings,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getListingById(id: string) {
  const [listing] = await db
    .select()
    .from(carListings)
    .where(eq(carListings.id, id))
    .limit(1);
  return listing ?? null;
}

export async function getListingsByIds(ids: string[]) {
  if (ids.length === 0) return [];
  const results = await db
    .select()
    .from(carListings)
    .where(inArray(carListings.id, ids));
  // Preserve input order (bookmarks are usually sorted newest-first upstream).
  const rank = new Map(ids.map((id, i) => [id, i]));
  return results.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
}

export async function getFilterOptions() {
  const [cities, fuelTypes, transmissions, bodyTypes, platforms] =
    await Promise.all([
      db
        .selectDistinct({ value: carListings.city })
        .from(carListings)
        .where(eq(carListings.isActive, true))
        .orderBy(asc(carListings.city)),
      db
        .selectDistinctOn([carListings.fuelType], {
          value: carListings.fuelType,
        })
        .from(carListings)
        .where(
          and(
            eq(carListings.isActive, true),
            sql`${carListings.fuelType} IS NOT NULL`
          )
        ),
      db
        .selectDistinctOn([carListings.transmission], {
          value: carListings.transmission,
        })
        .from(carListings)
        .where(
          and(
            eq(carListings.isActive, true),
            sql`${carListings.transmission} IS NOT NULL`
          )
        ),
      db
        .selectDistinctOn([carListings.bodyType], {
          value: carListings.bodyType,
        })
        .from(carListings)
        .where(
          and(
            eq(carListings.isActive, true),
            sql`${carListings.bodyType} IS NOT NULL`
          )
        ),
      db
        .selectDistinct({ value: carListings.sourcePlatform })
        .from(carListings)
        .where(eq(carListings.isActive, true)),
    ]);

  return {
    cities: cities.map((r) => r.value),
    fuelTypes: fuelTypes.map((r) => r.value).filter(Boolean) as string[],
    transmissions: transmissions
      .map((r) => r.value)
      .filter(Boolean) as string[],
    bodyTypes: bodyTypes.map((r) => r.value).filter(Boolean) as string[],
    platforms: platforms.map((r) => r.value),
  };
}
