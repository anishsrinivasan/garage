import { db, carListings, garages } from "@preowned-cars/db";
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
  isNull,
  SQL,
} from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { unstable_cache } from "next/cache";
import {
  FRESHNESS_HALF_LIFE_DAYS,
  FRESHNESS_WINDOWS,
  MIN_RECENCY_MULTIPLIER,
  PREMIUM_MAKES,
  PRICE_TIERS,
  RANKING_WEIGHTS,
  STALE_AFTER_DAYS,
  type FreshnessBucket,
} from "@preowned-cars/shared";

export type SortField =
  | "relevance"
  | "price"
  | "year"
  | "kmDriven"
  | "listedAt"
  | "scrapedAt";
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
  garage?: string;
  /** "today" | "week" | "month" | "quarter" — max age of the listing. */
  freshness?: string;
  /** Include listings we've stopped being able to confirm. Off by default. */
  includeStale?: boolean;
  sortBy?: SortField;
  sortOrder?: SortOrder;
  page?: number;
  pageSize?: number;
}

const PAGE_SIZE = 24;

/**
 * Age of a listing in days, from the publish date where the source gives us one
 * and the first-seen date otherwise. `listed_at` alone isn't enough: the
 * marketplace adapters never populated it, so 181 of 500 rows would sort as
 * infinitely old.
 */
const AGE_DAYS = sql`extract(epoch from (now() - coalesce(${carListings.listedAt}, ${carListings.firstSeenAt}))) / 86400.0`;

/**
 * The default feed ordering.
 *
 * The previous "Featured" order was `available → has-media → premium-brand →
 * price DESC → scrapedAt DESC`. Because price outranked recency by two
 * positions, the single most expensive row in the table was pinned to slot 1
 * permanently — which is how a 16-week-old listing became the first card
 * everyone saw.
 *
 * Recency is now a decay curve multiplied into a quality score, and price is a
 * band multiplier rather than a sort key. The decay is bounded below rather
 * than running to zero: an unbounded exponential made age the only thing that
 * mattered, so a same-day batch of ₹3 lakh hatchbacks buried every premium
 * listing older than a few weeks. Bounded, a well-photographed premium car from
 * last month can still beat a bare mass-market one posted this morning.
 */
const RECENCY = sql`(
  ${MIN_RECENCY_MULTIPLIER}::numeric
  + (1 - ${MIN_RECENCY_MULTIPLIER}::numeric)
    * exp(-(${AGE_DAYS}) / ${FRESHNESS_HALF_LIFE_DAYS}::numeric)
)`;

const PRICE_TIER = sql`(case ${sql.join(
  PRICE_TIERS.filter((tier) => tier.min > 0).map(
    (tier) => sql`when ${carListings.price} >= ${tier.min} then ${tier.multiplier}::numeric`,
  ),
  sql` `,
)} else 1 end)`;

const RELEVANCE_SCORE = sql`(
  ${RECENCY}
  * ${PRICE_TIER}
  * (case when ${carListings.saleStatus} = 'sold' then ${RANKING_WEIGHTS.soldPenalty}::numeric else 1 end)
  * (case when ${carListings.lastSeenAt} < now() - ${`${STALE_AFTER_DAYS} days`}::interval then ${RANKING_WEIGHTS.stalePenalty}::numeric else 1 end)
  * (case when ${carListings.needsReview} then ${RANKING_WEIGHTS.needsReviewPenalty}::numeric else 1 end)
  * (case when jsonb_array_length(coalesce(${carListings.media}, '[]'::jsonb)) > 0 then ${RANKING_WEIGHTS.hasMedia}::numeric else 1 end)
  * (case when coalesce((${carListings.media} -> 0 ->> 'score')::numeric, 0) >= 60 then ${RANKING_WEIGHTS.hasScoredMedia}::numeric else 1 end)
  * (case when ${carListings.price} is not null then ${RANKING_WEIGHTS.hasPrice}::numeric else 1 end)
  * (case when lower(${carListings.make}) = ANY(ARRAY[${sql.join(
    PREMIUM_MAKES.map((m) => sql`${m}`),
    sql`, `,
  )}]::text[]) then ${RANKING_WEIGHTS.premiumMake}::numeric else 1 end)
  * (case when ${carListings.kmDriven} is not null
              and ${carListings.fuelType} is not null
              and ${carListings.transmission} is not null
              and ${carListings.bodyType} is not null
         then ${RANKING_WEIGHTS.completeSpecs}::numeric else 1 end)
)`;

function buildConditions(filters: ListingFilters): SQL[] {
  const conditions: SQL[] = [
    eq(carListings.isActive, true),
    // Only the head of a dedup cluster reaches the feed; the reposts of the
    // same car stay reachable by URL but stop repeating in the grid.
    eq(carListings.isClusterHead, true),
  ];

  if (!filters.includeStale) {
    conditions.push(
      sql`${carListings.lastSeenAt} >= now() - ${`${STALE_AFTER_DAYS * 3} days`}::interval`,
    );
  }

  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(carListings.make, term),
        ilike(carListings.model, term),
        ilike(carListings.variant, term),
        ilike(carListings.description, term),
      )!,
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
  if (filters.garage) {
    conditions.push(eq(carListings.garageId, filters.garage));
  }

  const window = FRESHNESS_WINDOWS[filters.freshness as keyof typeof FRESHNESS_WINDOWS];
  if (window != null) {
    conditions.push(sql`${AGE_DAYS} <= ${window}`);
  }

  return conditions;
}

const SORT_COLUMNS = {
  price: carListings.price,
  year: carListings.year,
  kmDriven: carListings.kmDriven,
  scrapedAt: carListings.firstSeenAt,
} as const;

export async function getListings(filters: ListingFilters) {
  const where = and(...buildConditions(filters));

  const sortField = filters.sortBy ?? "relevance";
  const sortOrder = filters.sortOrder ?? "desc";

  let orderBy: SQL[];
  if (sortField === "relevance") {
    orderBy = [
      sql`${RELEVANCE_SCORE} DESC`,
      sql`${carListings.price} DESC NULLS LAST`,
      desc(carListings.firstSeenAt),
    ];
  } else if (sortField === "listedAt") {
    // Explicit "recently listed" — pure date, no quality weighting.
    orderBy = [
      sortOrder === "asc" ? sql`${AGE_DAYS} DESC` : sql`${AGE_DAYS} ASC`,
      desc(carListings.firstSeenAt),
    ];
  } else {
    const column = SORT_COLUMNS[sortField];
    orderBy = [
      sortOrder === "asc"
        ? sql`${column} ASC NULLS LAST`
        : sql`${column} DESC NULLS LAST`,
      desc(carListings.firstSeenAt),
    ];
  }

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  const [listings, [totals]] = await Promise.all([
    db
      .select({
        id: carListings.id,
        make: carListings.make,
        model: carListings.model,
        variant: carListings.variant,
        year: carListings.year,
        price: carListings.price,
        listingStatus: carListings.listingStatus,
        saleStatus: carListings.saleStatus,
        kmDriven: carListings.kmDriven,
        fuelType: carListings.fuelType,
        transmission: carListings.transmission,
        bodyType: carListings.bodyType,
        city: carListings.city,
        sourcePlatform: carListings.sourcePlatform,
        media: carListings.media,
        heroMediaUrl: carListings.heroMediaUrl,
        listedAt: carListings.listedAt,
        firstSeenAt: carListings.firstSeenAt,
        lastSeenAt: carListings.lastSeenAt,
        garageId: carListings.garageId,
        garageName: garages.name,
        garageSlug: garages.slug,
      })
      .from(carListings)
      .leftJoin(garages, eq(garages.id, carListings.garageId))
      .where(where)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(carListings).where(where),
  ]);

  const total = totals?.total ?? 0;
  return {
    listings,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export type FeedListing = Awaited<ReturnType<typeof getListings>>["listings"][number];

export async function getListingById(id: string) {
  const [row] = await db
    .select({
      listing: carListings,
      garageName: garages.name,
      garageSlug: garages.slug,
      garagePhone: garages.phone,
      garageInstagram: garages.instagramUrl,
    })
    .from(carListings)
    .leftJoin(garages, eq(garages.id, carListings.garageId))
    .where(eq(carListings.id, id))
    .limit(1);
  if (!row) return null;
  return {
    ...row.listing,
    garageName: row.garageName,
    garageSlug: row.garageSlug,
    garagePhone: row.garagePhone,
    garageInstagram: row.garageInstagram,
  };
}

/** Other posts of the same physical car, collapsed out of the feed by dedupe. */
export async function getClusterSiblings(listingId: string, clusterId: string | null) {
  if (!clusterId) return [];
  return db
    .select({
      id: carListings.id,
      sourceUrl: carListings.sourceUrl,
      sourcePlatform: carListings.sourcePlatform,
      listedAt: carListings.listedAt,
      firstSeenAt: carListings.firstSeenAt,
      price: carListings.price,
    })
    .from(carListings)
    .where(
      and(
        eq(carListings.dedupClusterId, clusterId),
        sql`${carListings.id} <> ${listingId}`,
      ),
    )
    .orderBy(desc(carListings.firstSeenAt))
    .limit(6);
}

/** Same model or same garage, for the "more like this" strip. */
export async function getSimilarListings(listing: {
  id: string;
  make: string;
  model: string;
  garageId: string | null;
}) {
  return db
    .select({
      id: carListings.id,
      make: carListings.make,
      model: carListings.model,
      variant: carListings.variant,
      year: carListings.year,
      price: carListings.price,
      listingStatus: carListings.listingStatus,
      saleStatus: carListings.saleStatus,
      kmDriven: carListings.kmDriven,
      fuelType: carListings.fuelType,
      transmission: carListings.transmission,
      city: carListings.city,
      sourcePlatform: carListings.sourcePlatform,
      media: carListings.media,
      heroMediaUrl: carListings.heroMediaUrl,
      listedAt: carListings.listedAt,
      firstSeenAt: carListings.firstSeenAt,
      garageName: garages.name,
      garageSlug: garages.slug,
    })
    .from(carListings)
    .leftJoin(garages, eq(garages.id, carListings.garageId))
    .where(
      and(
        eq(carListings.isActive, true),
        eq(carListings.isClusterHead, true),
        sql`${carListings.id} <> ${listing.id}`,
        or(
          and(
            eq(carListings.make, listing.make),
            eq(carListings.model, listing.model),
          ),
          listing.garageId
            ? eq(carListings.garageId, listing.garageId)
            : sql`false`,
        )!,
      ),
    )
    .orderBy(sql`${RELEVANCE_SCORE} DESC`)
    .limit(6);
}

export async function getListingsByIds(ids: string[]) {
  if (ids.length === 0) return [];
  const results = await db
    .select({
      id: carListings.id,
      make: carListings.make,
      model: carListings.model,
      variant: carListings.variant,
      year: carListings.year,
      price: carListings.price,
      listingStatus: carListings.listingStatus,
      saleStatus: carListings.saleStatus,
      kmDriven: carListings.kmDriven,
      fuelType: carListings.fuelType,
      transmission: carListings.transmission,
      city: carListings.city,
      sourcePlatform: carListings.sourcePlatform,
      media: carListings.media,
      heroMediaUrl: carListings.heroMediaUrl,
      listedAt: carListings.listedAt,
      firstSeenAt: carListings.firstSeenAt,
      garageName: garages.name,
      garageSlug: garages.slug,
    })
    .from(carListings)
    .leftJoin(garages, eq(garages.id, carListings.garageId))
    .where(inArray(carListings.id, ids));
  // Preserve input order (bookmarks are usually sorted newest-first upstream).
  const rank = new Map(ids.map((id, i) => [id, i]));
  return results.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
}

export type FilterOptions = {
  cities: string[];
  fuelTypes: Array<{ value: string; count: number }>;
  transmissions: Array<{ value: string; count: number }>;
  bodyTypes: Array<{ value: string; count: number }>;
  platforms: Array<{ value: string; count: number }>;
  garages: Array<{ id: string; name: string; count: number }>;
  makes: Array<{ value: string; count: number }>;
  priceRange: { min: number; max: number };
  yearRange: { min: number; max: number };
};

/**
 * Filter options with per-value counts.
 *
 * This used to run five `SELECT DISTINCT` queries on every single page view
 * because the page was `force-dynamic`. It changes once per scrape, so it's
 * cached under a tag the scrape run can invalidate.
 */
async function loadFilterOptions(): Promise<FilterOptions> {
  const activeOnly = and(
    eq(carListings.isActive, true),
    eq(carListings.isClusterHead, true),
  );

  const [
    cities,
    fuelTypes,
    transmissions,
    bodyTypes,
    platforms,
    garageRows,
    makes,
    [ranges],
  ] = await Promise.all([
    db
      .selectDistinct({ value: carListings.city })
      .from(carListings)
      .where(activeOnly)
      .orderBy(asc(carListings.city)),
    countsFor(carListings.fuelType, activeOnly),
    countsFor(carListings.transmission, activeOnly),
    countsFor(carListings.bodyType, activeOnly),
    countsFor(carListings.sourcePlatform, activeOnly),
    db
      .select({
        id: garages.id,
        name: garages.name,
        count: count(carListings.id),
      })
      .from(garages)
      .innerJoin(carListings, and(eq(carListings.garageId, garages.id), activeOnly))
      .where(eq(garages.isActive, true))
      .groupBy(garages.id, garages.name)
      .orderBy(desc(count(carListings.id))),
    countsFor(carListings.make, activeOnly),
    db
      .select({
        minPrice: sql<string>`coalesce(min(${carListings.price}), 0)`,
        maxPrice: sql<string>`coalesce(max(${carListings.price}), 0)`,
        minYear: sql<number>`coalesce(min(${carListings.year}), 2000)`,
        maxYear: sql<number>`coalesce(max(${carListings.year}), extract(year from now())::int)`,
      })
      .from(carListings)
      .where(activeOnly),
  ]);

  return {
    cities: cities.map((r) => r.value).filter(Boolean),
    fuelTypes,
    transmissions,
    bodyTypes,
    platforms,
    garages: garageRows.map((g) => ({ id: g.id, name: g.name, count: g.count })),
    makes,
    priceRange: {
      min: Math.floor(Number(ranges?.minPrice ?? 0)),
      max: Math.ceil(Number(ranges?.maxPrice ?? 0)),
    },
    yearRange: {
      min: Number(ranges?.minYear ?? 2000),
      max: Number(ranges?.maxYear ?? new Date().getFullYear()),
    },
  };
}

async function countsFor(
  column: AnyPgColumn,
  where: SQL | undefined,
): Promise<Array<{ value: string; count: number }>> {
  const rows = (await db
    .select({ value: column, total: count() })
    .from(carListings)
    .where(and(where, sql`${column} is not null`))
    .groupBy(column)
    .orderBy(desc(count()))) as Array<{ value: string | null; total: number }>;
  return rows
    .filter((r): r is { value: string; total: number } => Boolean(r.value))
    .map((r) => ({ value: r.value, count: r.total }));
}

export const getFilterOptions = unstable_cache(loadFilterOptions, ["filter-options"], {
  tags: ["listings"],
  revalidate: 900,
});

export type CatalogueHealth = {
  lastSuccessfulRun: Date | null;
  activeListings: number;
  addedThisWeek: number;
};

async function loadCatalogueHealth(): Promise<CatalogueHealth> {
  const [[run], [counts]] = await Promise.all([
    db.execute<{ completed_at: Date | null }>(
      sql`select max(completed_at) as completed_at from torque.scrape_runs where status in ('completed','completed_with_errors')`,
    ) as unknown as Promise<Array<{ completed_at: Date | null }>>,
    db
      .select({
        active: count(),
        addedThisWeek: sql<number>`count(*) filter (where ${carListings.firstSeenAt} >= now() - interval '7 days')::int`,
      })
      .from(carListings)
      .where(and(eq(carListings.isActive, true), eq(carListings.isClusterHead, true))),
  ]);

  return {
    lastSuccessfulRun: run?.completed_at ? new Date(run.completed_at) : null,
    activeListings: counts?.active ?? 0,
    addedThisWeek: counts?.addedThisWeek ?? 0,
  };
}

/**
 * Powers the "last updated" line. The hero used to claim "Updated hourly"
 * unconditionally, which was untrue for fifteen weeks while the Instagram
 * scraper was failing silently.
 */
export const getCatalogueHealth = unstable_cache(
  loadCatalogueHealth,
  ["catalogue-health"],
  { tags: ["listings"], revalidate: 300 },
);

/** All active listing ids + dates, for the sitemap. */
export async function getSitemapListings() {
  return db
    .select({
      id: carListings.id,
      updatedAt: carListings.updatedAt,
    })
    .from(carListings)
    .where(
      and(
        eq(carListings.isActive, true),
        eq(carListings.isClusterHead, true),
        isNull(carListings.delistedAt),
      ),
    )
    .limit(5000);
}

export type { FreshnessBucket };
