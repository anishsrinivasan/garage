import { db, listings, listingRentalAttrs, localities, garages } from "@preowned-cars/db";
import { and, asc, count, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { unstable_cache } from "next/cache";
import {
  FRESHNESS_WINDOWS,
  MIN_RECENCY_MULTIPLIER,
  RANKING_WEIGHTS,
  STALE_AFTER_DAYS,
} from "@preowned-cars/shared";

/**
 * The rentals feed.
 *
 * Shares the core listing row, the freshness lifecycle and the dedupe with cars;
 * differs in what it filters and ranks on. Rent bands, bedroom counts and
 * localities are the query path here, so they are joined against real indexed
 * columns rather than dug out of a blob.
 *
 * The freshness half-life is 7 days against 30 for cars — the single most
 * load-bearing difference between the two verticals. A flat listed a fortnight
 * ago is usually gone.
 */

const RENTALS_HALF_LIFE_DAYS = 7;
const PAGE_SIZE = 24;

export type RentalSortField = "relevance" | "listedAt" | "rent" | "area";

export interface RentalFilters {
  search?: string;
  minRent?: number;
  maxRent?: number;
  bhk?: number[];
  furnishing?: string;
  propertyType?: string;
  tenantPreference?: string;
  locality?: string;
  minArea?: number;
  maxArea?: number;
  freshness?: string;
  includeStale?: boolean;
  sortBy?: RentalSortField;
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

const AGE_DAYS = sql`extract(epoch from (now() - coalesce(${listings.listedAt}, ${listings.firstSeenAt}))) / 86400.0`;

const RECENCY = sql`(
  ${MIN_RECENCY_MULTIPLIER}::numeric
  + (1 - ${MIN_RECENCY_MULTIPLIER}::numeric)
    * exp(-(${AGE_DAYS}) / ${RENTALS_HALF_LIFE_DAYS}::numeric)
)`;

/**
 * No price-band multiplier here, unlike cars.
 *
 * A ₹90k flat is not "better" than a ₹20k one — it is a different search. Cars
 * carry a premium-brand and price-tier boost because this audience came for the
 * interesting cars; a renter has a budget and wants the best match inside it.
 * Weighting by rent would just bury everything affordable.
 */
const RELEVANCE_SCORE = sql`(
  ${RECENCY}
  * (case when ${listings.saleStatus} = 'sold' then ${RANKING_WEIGHTS.soldPenalty}::numeric else 1 end)
  * (case when ${listings.lastSeenAt} < now() - ${`${STALE_AFTER_DAYS} days`}::interval then ${RANKING_WEIGHTS.stalePenalty}::numeric else 1 end)
  * (case when ${listings.needsReview} then ${RANKING_WEIGHTS.needsReviewPenalty}::numeric else 1 end)
  * (case when jsonb_array_length(coalesce(${listings.media}, '[]'::jsonb)) > 0 then ${RANKING_WEIGHTS.hasMedia}::numeric else 1 end)
  * (case when coalesce((${listings.media} -> 0 ->> 'score')::numeric, 0) >= 60 then ${RANKING_WEIGHTS.hasScoredMedia}::numeric else 1 end)
  * (case when ${listingRentalAttrs.rent} is not null then ${RANKING_WEIGHTS.hasPrice}::numeric else 1 end)
  * (case when ${listings.localityId} is not null then 1.15::numeric else 1 end)
  * (case when ${listingRentalAttrs.bhk} is not null
              and ${listingRentalAttrs.furnishing} is not null
              and ${listingRentalAttrs.carpetAreaSqft} is not null
         then ${RANKING_WEIGHTS.completeSpecs}::numeric else 1 end)
)`;

function buildConditions(filters: RentalFilters): SQL[] {
  const conditions: SQL[] = [
    eq(listings.vertical, "rentals"),
    eq(listings.isActive, true),
    eq(listings.isClusterHead, true),
  ];

  if (!filters.includeStale) {
    conditions.push(
      sql`${listings.lastSeenAt} >= now() - ${`${STALE_AFTER_DAYS * 3} days`}::interval`,
    );
  }

  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(listings.location, term),
        ilike(listings.description, term),
        ilike(localities.name, term),
      )!,
    );
  }

  if (filters.minRent != null) conditions.push(gte(listingRentalAttrs.rent, filters.minRent));
  if (filters.maxRent != null) conditions.push(lte(listingRentalAttrs.rent, filters.maxRent));
  if (filters.minArea != null) {
    conditions.push(gte(listingRentalAttrs.carpetAreaSqft, filters.minArea));
  }
  if (filters.maxArea != null) {
    conditions.push(lte(listingRentalAttrs.carpetAreaSqft, filters.maxArea));
  }

  if (filters.bhk?.length) {
    // "3 BHK" on a filter means "3 or more" — nobody searching for three
    // bedrooms wants a four-bedroom flat hidden from them.
    const max = Math.max(...filters.bhk);
    const exact = filters.bhk.filter((b) => b < 4);
    const clauses: SQL[] = [];
    if (exact.length) {
      clauses.push(sql`${listingRentalAttrs.bhk} in ${sql`(${sql.join(exact.map((b) => sql`${b}`), sql`, `)})`}`);
    }
    if (max >= 4) clauses.push(gte(listingRentalAttrs.bhk, 4));
    if (clauses.length) conditions.push(or(...clauses)!);
  }

  if (filters.furnishing) conditions.push(eq(listingRentalAttrs.furnishing, filters.furnishing));
  if (filters.propertyType) {
    conditions.push(eq(listingRentalAttrs.propertyType, filters.propertyType));
  }
  if (filters.tenantPreference) {
    conditions.push(eq(listingRentalAttrs.tenantPreference, filters.tenantPreference));
  }
  if (filters.locality) conditions.push(eq(listings.localityId, filters.locality));

  const window = FRESHNESS_WINDOWS[filters.freshness as keyof typeof FRESHNESS_WINDOWS];
  if (window != null) conditions.push(sql`${AGE_DAYS} <= ${window}`);

  return conditions;
}

const SELECTION = {
  id: listings.id,
  price: listings.price,
  pricePeriod: listings.pricePeriod,
  saleStatus: listings.saleStatus,
  listingStatus: listings.listingStatus,
  city: listings.city,
  locationText: listings.location,
  sourcePlatform: listings.sourcePlatform,
  sourceUrl: listings.sourceUrl,
  media: listings.media,
  heroMediaUrl: listings.heroMediaUrl,
  description: listings.description,
  listedAt: listings.listedAt,
  firstSeenAt: listings.firstSeenAt,
  lastSeenAt: listings.lastSeenAt,
  sellerPhone: listings.sellerPhone,

  localityId: listings.localityId,
  localityName: localities.name,
  latitude: localities.latitude,
  longitude: localities.longitude,

  orgName: garages.name,
  orgSlug: garages.slug,

  bhk: listingRentalAttrs.bhk,
  propertyType: listingRentalAttrs.propertyType,
  carpetAreaSqft: listingRentalAttrs.carpetAreaSqft,
  floor: listingRentalAttrs.floor,
  totalFloors: listingRentalAttrs.totalFloors,
  rent: listingRentalAttrs.rent,
  deposit: listingRentalAttrs.deposit,
  maintenance: listingRentalAttrs.maintenance,
  maintenanceIncluded: listingRentalAttrs.maintenanceIncluded,
  furnishing: listingRentalAttrs.furnishing,
  tenantPreference: listingRentalAttrs.tenantPreference,
  parking: listingRentalAttrs.parking,
  availableFrom: listingRentalAttrs.availableFrom,
  amenities: listingRentalAttrs.amenities,
} as const;

function baseQuery() {
  return db
    .select(SELECTION)
    .from(listings)
    .innerJoin(listingRentalAttrs, eq(listingRentalAttrs.listingId, listings.id))
    .leftJoin(localities, eq(localities.id, listings.localityId))
    .leftJoin(garages, eq(garages.id, listings.garageId));
}

export type RentalListing = Awaited<ReturnType<typeof getRentals>>["listings"][number];

export async function getRentals(filters: RentalFilters) {
  const where = and(...buildConditions(filters));
  const sortBy = filters.sortBy ?? "relevance";
  const sortOrder = filters.sortOrder ?? "asc";

  let orderBy: SQL[];
  switch (sortBy) {
    case "rent":
      orderBy = [
        sortOrder === "desc"
          ? sql`${listingRentalAttrs.rent} DESC NULLS LAST`
          : sql`${listingRentalAttrs.rent} ASC NULLS LAST`,
      ];
      break;
    case "area":
      orderBy = [sql`${listingRentalAttrs.carpetAreaSqft} DESC NULLS LAST`];
      break;
    case "listedAt":
      orderBy = [sql`${AGE_DAYS} ASC`];
      break;
    default:
      orderBy = [sql`${RELEVANCE_SCORE} DESC`];
  }
  // Same reasoning as the cars feed: without a unique final key, tied rows come
  // back in whatever order the engine likes, and OFFSET pagination can then show
  // one listing twice and skip another.
  orderBy.push(desc(listings.id));

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? PAGE_SIZE;

  const [rows, [totals]] = await Promise.all([
    baseQuery()
      .where(where)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: count() })
      .from(listings)
      .innerJoin(listingRentalAttrs, eq(listingRentalAttrs.listingId, listings.id))
      .leftJoin(localities, eq(localities.id, listings.localityId))
      .where(where),
  ]);

  const total = totals?.total ?? 0;
  return {
    listings: rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getRentalById(id: string) {
  const [row] = await baseQuery().where(eq(listings.id, id)).limit(1);
  return row ?? null;
}

export async function getSimilarRentals(listing: {
  id: string;
  localityId: string | null;
  bhk: number | null;
}) {
  const conditions: SQL[] = [
    eq(listings.vertical, "rentals"),
    eq(listings.isActive, true),
    eq(listings.isClusterHead, true),
    sql`${listings.id} <> ${listing.id}`,
  ];
  if (listing.localityId) conditions.push(eq(listings.localityId, listing.localityId));
  if (listing.bhk != null) conditions.push(eq(listingRentalAttrs.bhk, listing.bhk));

  return baseQuery()
    .where(and(...conditions))
    .orderBy(sql`${RELEVANCE_SCORE} DESC`, desc(listings.id))
    .limit(6);
}

export type RentalFacets = {
  bhk: Array<{ value: number; count: number }>;
  furnishing: Array<{ value: string; count: number }>;
  propertyType: Array<{ value: string; count: number }>;
  tenantPreference: Array<{ value: string; count: number }>;
  localities: Array<{ id: string; name: string; count: number }>;
  rentRange: { min: number; max: number };
  areaRange: { min: number; max: number };
  total: number;
};

async function loadRentalFacets(): Promise<RentalFacets> {
  const live = and(
    eq(listings.vertical, "rentals"),
    eq(listings.isActive, true),
    eq(listings.isClusterHead, true),
  );

  const attrFacet = async (column: AnyPgColumn) => {
    const rows = (await db
      .select({ value: column, total: count() })
      .from(listings)
      .innerJoin(listingRentalAttrs, eq(listingRentalAttrs.listingId, listings.id))
      .where(and(live, sql`${column} is not null`))
      .groupBy(column)
      .orderBy(desc(count()))) as Array<{ value: string | null; total: number }>;
    return rows
      .filter((r): r is { value: string; total: number } => Boolean(r.value))
      .map((r) => ({ value: r.value, count: r.total }));
  };

  const [bhkRows, furnishing, propertyType, tenantPreference, localityRows, [ranges], [totals]] =
    await Promise.all([
      db
        .select({ value: listingRentalAttrs.bhk, total: count() })
        .from(listings)
        .innerJoin(listingRentalAttrs, eq(listingRentalAttrs.listingId, listings.id))
        .where(and(live, sql`${listingRentalAttrs.bhk} is not null`))
        .groupBy(listingRentalAttrs.bhk)
        .orderBy(asc(listingRentalAttrs.bhk)),
      attrFacet(listingRentalAttrs.furnishing),
      attrFacet(listingRentalAttrs.propertyType),
      attrFacet(listingRentalAttrs.tenantPreference),
      db
        .select({ id: localities.id, name: localities.name, total: count() })
        .from(listings)
        .innerJoin(localities, eq(localities.id, listings.localityId))
        .where(live)
        .groupBy(localities.id, localities.name)
        .orderBy(desc(count())),
      db
        .select({
          minRent: sql<number>`coalesce(min(${listingRentalAttrs.rent}), 0)::int`,
          maxRent: sql<number>`coalesce(max(${listingRentalAttrs.rent}), 0)::int`,
          minArea: sql<number>`coalesce(min(${listingRentalAttrs.carpetAreaSqft}), 0)::int`,
          maxArea: sql<number>`coalesce(max(${listingRentalAttrs.carpetAreaSqft}), 0)::int`,
        })
        .from(listings)
        .innerJoin(listingRentalAttrs, eq(listingRentalAttrs.listingId, listings.id))
        .where(live),
      db.select({ total: count() }).from(listings).where(live),
    ]);

  return {
    bhk: bhkRows
      .filter((r): r is { value: number; total: number } => r.value != null)
      .map((r) => ({ value: r.value, count: r.total })),
    furnishing,
    propertyType,
    tenantPreference,
    localities: localityRows.map((l) => ({ id: l.id, name: l.name, count: l.total })),
    rentRange: { min: ranges?.minRent ?? 0, max: ranges?.maxRent ?? 0 },
    areaRange: { min: ranges?.minArea ?? 0, max: ranges?.maxArea ?? 0 },
    total: totals?.total ?? 0,
  };
}

export const getRentalFacets = unstable_cache(loadRentalFacets, ["rental-facets"], {
  tags: ["listings"],
  revalidate: 900,
});
