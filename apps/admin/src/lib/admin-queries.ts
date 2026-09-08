import {
  db,
  listings,
  cities,
  localities,
  garages,
  dealerSources,
  scrapeRuns,
  listingReports,
  feedback,
  llmUsageLogs,
} from "@preowned-cars/db";
import { and, asc, count, desc, eq, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { STALE_AFTER_DAYS } from "@preowned-cars/shared";

/**
 * Read models for the admin dashboard.
 *
 * Deliberately separate from the public app's queries: the admin needs to see
 * everything, including delisted rows, demoted duplicates, and listings flagged
 * for review — all of which the public feed filters out by design.
 */

export type DashboardStats = {
  active: number;
  delisted: number;
  sold: number;
  needsReview: number;
  stale: number;
  addedToday: number;
  addedThisWeek: number;
  noMedia: number;
  noPrice: number;
  duplicatesCollapsed: number;
};

export async function getDashboardStats(): Promise<DashboardStats> {
  const [row] = await db
    .select({
      active: sql<number>`count(*) filter (where ${listings.isActive})::int`,
      delisted: sql<number>`count(*) filter (where not ${listings.isActive})::int`,
      sold: sql<number>`count(*) filter (where ${listings.saleStatus} = 'sold')::int`,
      needsReview: sql<number>`count(*) filter (where ${listings.needsReview} and ${listings.isActive})::int`,
      stale: sql<number>`count(*) filter (where ${listings.isActive} and ${listings.lastSeenAt} < now() - ${`${STALE_AFTER_DAYS} days`}::interval)::int`,
      addedToday: sql<number>`count(*) filter (where ${listings.firstSeenAt} >= now() - interval '1 day')::int`,
      addedThisWeek: sql<number>`count(*) filter (where ${listings.firstSeenAt} >= now() - interval '7 days')::int`,
      noMedia: sql<number>`count(*) filter (where ${listings.isActive} and jsonb_array_length(coalesce(${listings.media}, '[]'::jsonb)) = 0)::int`,
      noPrice: sql<number>`count(*) filter (where ${listings.isActive} and ${listings.price} is null)::int`,
      duplicatesCollapsed: sql<number>`count(*) filter (where ${listings.isActive} and not ${listings.isClusterHead})::int`,
    })
    .from(listings);

  return (
    row ?? {
      active: 0,
      delisted: 0,
      sold: 0,
      needsReview: 0,
      stale: 0,
      addedToday: 0,
      addedThisWeek: 0,
      noMedia: 0,
      noPrice: 0,
      duplicatesCollapsed: 0,
    }
  );
}

export async function getReviewCount(): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(listings)
    .where(and(eq(listings.needsReview, true), eq(listings.isActive, true)));
  return row?.total ?? 0;
}

export async function getOpenReportCount(): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(listingReports)
    .where(eq(listingReports.status, "open"));
  return row?.total ?? 0;
}

/** Listings added per day for the last 30 days, for the dashboard sparkline. */
export async function getIntakeTrend() {
  const rows = await db.execute<{ day: string; total: number }>(
    sql`select to_char(date_trunc('day', ${listings.firstSeenAt}), 'YYYY-MM-DD') as day,
               count(*)::int as total
          from ${listings}
         where ${listings.firstSeenAt} >= now() - interval '30 days'
         group by 1
         order by 1`,
  );
  return rows as unknown as Array<{ day: string; total: number }>;
}

export type AdminListingFilters = {
  search?: string;
  status?: "active" | "delisted" | "sold" | "review" | "duplicate" | "no-media";
  source?: string;
  garage?: string;
  page?: number;
  pageSize?: number;
};

export async function getAdminListings(filters: AdminListingFilters) {
  const conditions: SQL[] = [];

  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(listings.make, term),
        ilike(listings.model, term),
        ilike(listings.variant, term),
        ilike(listings.sourceUrl, term),
      )!,
    );
  }

  switch (filters.status) {
    case "active":
      conditions.push(eq(listings.isActive, true));
      break;
    case "delisted":
      conditions.push(eq(listings.isActive, false));
      break;
    case "sold":
      conditions.push(eq(listings.saleStatus, "sold"));
      break;
    case "review":
      conditions.push(eq(listings.needsReview, true));
      break;
    case "duplicate":
      conditions.push(eq(listings.isClusterHead, false));
      break;
    case "no-media":
      conditions.push(
        sql`jsonb_array_length(coalesce(${listings.media}, '[]'::jsonb)) = 0`,
      );
      break;
  }

  if (filters.source) conditions.push(eq(listings.sourcePlatform, filters.source));
  if (filters.garage) conditions.push(eq(listings.garageId, filters.garage));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? 40;

  const [rows, [totals]] = await Promise.all([
    db
      .select({
        id: listings.id,
        make: listings.make,
        model: listings.model,
        variant: listings.variant,
        year: listings.year,
        price: listings.price,
        kmDriven: listings.kmDriven,
        fuelType: listings.fuelType,
        transmission: listings.transmission,
        bodyType: listings.bodyType,
        city: listings.city,
        saleStatus: listings.saleStatus,
        isActive: listings.isActive,
        isClusterHead: listings.isClusterHead,
        needsReview: listings.needsReview,
        reviewReason: listings.reviewReason,
        media: listings.media,
        heroMediaUrl: listings.heroMediaUrl,
        sourcePlatform: listings.sourcePlatform,
        sourceUrl: listings.sourceUrl,
        listedAt: listings.listedAt,
        firstSeenAt: listings.firstSeenAt,
        lastSeenAt: listings.lastSeenAt,
        garageName: garages.name,
      })
      .from(listings)
      .leftJoin(garages, eq(garages.id, listings.garageId))
      .where(where)
      .orderBy(desc(listings.firstSeenAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(listings).where(where),
  ]);

  const total = totals?.total ?? 0;
  return { rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getAdminListing(id: string) {
  const [row] = await db
    .select({
      listing: listings,
      garageName: garages.name,
    })
    .from(listings)
    .leftJoin(garages, eq(garages.id, listings.garageId))
    .where(eq(listings.id, id))
    .limit(1);
  if (!row) return null;
  return { ...row.listing, garageName: row.garageName };
}

/** Listings the price checker flagged, worst first. */
export async function getReviewQueue() {
  return db
    .select({
      id: listings.id,
      make: listings.make,
      model: listings.model,
      year: listings.year,
      price: listings.price,
      reviewReason: listings.reviewReason,
      sourceUrl: listings.sourceUrl,
      description: listings.description,
      media: listings.media,
      firstSeenAt: listings.firstSeenAt,
      garageName: garages.name,
    })
    .from(listings)
    .leftJoin(garages, eq(garages.id, listings.garageId))
    .where(and(eq(listings.needsReview, true), eq(listings.isActive, true)))
    .orderBy(desc(listings.price))
    .limit(100);
}

export async function getAdminGarages() {
  return db
    .select({
      id: garages.id,
      slug: garages.slug,
      name: garages.name,
      kind: garages.kind,
      city: garages.city,
      phone: garages.phone,
      logoUrl: garages.logoUrl,
      instagramUrl: garages.instagramUrl,
      websiteUrl: garages.websiteUrl,
      description: garages.description,
      isActive: garages.isActive,
      listingCount: count(listings.id),
    })
    .from(garages)
    .leftJoin(
      listings,
      and(eq(listings.garageId, garages.id), eq(listings.isActive, true)),
    )
    .groupBy(garages.id)
    .orderBy(desc(count(listings.id)), asc(garages.name));
}

export async function getAdminSources() {
  return db
    .select({
      id: dealerSources.id,
      platform: dealerSources.platform,
      handle: dealerSources.handle,
      sourceType: dealerSources.sourceType,
      isActive: dealerSources.isActive,
      lastScrapedAt: dealerSources.lastScrapedAt,
      lastScrapeStatus: dealerSources.lastScrapeStatus,
      lastScrapeError: dealerSources.lastScrapeError,
      garageId: garages.id,
      garageName: garages.name,
      garageSlug: garages.slug,
      listingCount: count(listings.id),
    })
    .from(dealerSources)
    .innerJoin(garages, eq(garages.id, dealerSources.garageId))
    .leftJoin(
      listings,
      and(
        eq(listings.dealerSourceId, dealerSources.id),
        eq(listings.isActive, true),
      ),
    )
    .groupBy(dealerSources.id, garages.id)
    .orderBy(desc(count(listings.id)));
}

export async function getRecentRuns(limit = 25) {
  return db
    .select()
    .from(scrapeRuns)
    .orderBy(desc(scrapeRuns.startedAt))
    .limit(limit);
}

export async function getReports() {
  return db
    .select({
      id: listingReports.id,
      listingId: listingReports.listingId,
      reportType: listingReports.reportType,
      description: listingReports.description,
      status: listingReports.status,
      createdAt: listingReports.createdAt,
      make: listings.make,
      model: listings.model,
      year: listings.year,
    })
    .from(listingReports)
    .leftJoin(listings, eq(listings.id, listingReports.listingId))
    .orderBy(desc(listingReports.createdAt))
    .limit(100);
}

export async function getFeedback() {
  return db
    .select()
    .from(feedback)
    .orderBy(desc(feedback.createdAt))
    .limit(100);
}

/**
 * LLM spend. `llm_usage_logs` had been accumulating rows that nothing read;
 * extraction and image scoring are the only recurring per-listing cost, so it
 * is worth having in front of you.
 */
export async function getLlmUsage() {
  const rows = await db
    .select({
      operation: llmUsageLogs.operation,
      model: llmUsageLogs.model,
      calls: count(),
      inputTokens: sql<number>`coalesce(sum(${llmUsageLogs.inputTokens}), 0)::bigint`,
      outputTokens: sql<number>`coalesce(sum(${llmUsageLogs.outputTokens}), 0)::bigint`,
      failures: sql<number>`count(*) filter (where not ${llmUsageLogs.success})::int`,
    })
    .from(llmUsageLogs)
    .where(isNotNull(llmUsageLogs.operation))
    .groupBy(llmUsageLogs.operation, llmUsageLogs.model)
    .orderBy(desc(count()));
  return rows;
}

/** Values that fell outside the canonical enums — the long tail to fix by hand. */
export async function getDataQualityOutliers() {
  const [fuels, transmissions, bodies, makes] = await Promise.all([
    db.execute(
      sql`select ${listings.fuelType} as value, count(*)::int as total
            from ${listings}
           where ${listings.isActive}
             and ${listings.fuelType} is not null
             and ${listings.fuelType} not in ('petrol','diesel','cng','electric','hybrid','lpg')
           group by 1 order by 2 desc`,
    ),
    db.execute(
      sql`select ${listings.transmission} as value, count(*)::int as total
            from ${listings}
           where ${listings.isActive}
             and ${listings.transmission} is not null
             and ${listings.transmission} not in ('manual','automatic')
           group by 1 order by 2 desc`,
    ),
    db.execute(
      sql`select ${listings.bodyType} as value, count(*)::int as total
            from ${listings}
           where ${listings.isActive}
             and ${listings.bodyType} is not null
             and ${listings.bodyType} not in ('hatchback','sedan','suv','muv','coupe','convertible','pickup','van','wagon')
           group by 1 order by 2 desc`,
    ),
    // Makes that differ only by case or punctuation still indicate a gap in the
    // canonical alias map.
    db.execute(
      sql`select lower(regexp_replace(${listings.make}, '[^a-zA-Z0-9]', '', 'g')) as normalized,
                 string_agg(distinct ${listings.make}, ' | ') as variants,
                 count(*)::int as total
            from ${listings}
           where ${listings.isActive}
           group by 1
          having count(distinct ${listings.make}) > 1
           order by 3 desc`,
    ),
  ]);

  return {
    fuels: fuels as unknown as Array<{ value: string; total: number }>,
    transmissions: transmissions as unknown as Array<{ value: string; total: number }>,
    bodies: bodies as unknown as Array<{ value: string; total: number }>,
    makes: makes as unknown as Array<{
      normalized: string;
      variants: string;
      total: number;
    }>,
  };
}


export type CityRow = {
  id: string;
  slug: string;
  name: string;
  state: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  localityCount: number;
  listingCount: number;
};

/**
 * Cities with how much they actually carry, so dead entries are obvious.
 *
 * Joined rather than written as correlated subqueries. Drizzle renders a column
 * reference inside a raw `sql` fragment unqualified — `${cities.id}` becomes
 * `"id"` — so inside a subquery it binds to that subquery's own `id` instead of
 * the outer row. The result compiles, runs, and silently returns zero for every
 * city. `count(distinct)` handles the fan-out from joining two child tables.
 */
export async function getCitiesWithCounts(): Promise<CityRow[]> {
  return db
    .select({
      id: cities.id,
      slug: cities.slug,
      name: cities.name,
      state: cities.state,
      country: cities.country,
      latitude: cities.latitude,
      longitude: cities.longitude,
      isActive: cities.isActive,
      localityCount: sql<number>`count(distinct ${localities.id})::int`,
      listingCount: sql<number>`count(distinct ${listings.id}) filter (where ${listings.isActive})::int`,
    })
    .from(cities)
    .leftJoin(localities, eq(localities.cityId, cities.id))
    .leftJoin(listings, eq(listings.cityId, cities.id))
    .groupBy(cities.id)
    .orderBy(desc(sql`count(distinct ${listings.id})`), asc(cities.name));
}

export type LocalityRow = {
  id: string;
  cityId: string;
  slug: string;
  name: string;
  aliases: string[];
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  listingCount: number;
};

export async function getLocalities(cityId: string, search?: string): Promise<LocalityRow[]> {
  const conditions = [eq(localities.cityId, cityId)];
  if (search?.trim()) {
    const term = `%${search.trim().toLowerCase()}%`;
    // Search names *and* aliases — finding the entry that owns a mis-spelling is
    // the whole reason someone opens this screen.
    conditions.push(
      sql`(lower(${localities.name}) like ${term} or exists (
        select 1 from unnest(${localities.aliases}) a where a like ${term}
      ))`,
    );
  }
  return db
    .select({
      id: localities.id,
      cityId: localities.cityId,
      slug: localities.slug,
      name: localities.name,
      aliases: localities.aliases,
      latitude: localities.latitude,
      longitude: localities.longitude,
      isActive: localities.isActive,
      // Joined for the same reason as above — a correlated subquery here bound
      // to the wrong `id` and reported zero for every locality.
      listingCount: sql<number>`count(${listings.id}) filter (where ${listings.isActive})::int`,
    })
    .from(localities)
    .leftJoin(listings, eq(listings.localityId, localities.id))
    .where(and(...conditions))
    .groupBy(localities.id)
    .orderBy(desc(sql`count(${listings.id})`), asc(localities.name));
}

/**
 * Location strings on listings that matched no locality. This is the work queue
 * — each one is either a missing alias or a missing locality.
 */
export async function getUnmatchedLocations(cityId: string, limit = 40) {
  const rows = await db
    .select({
      locationText: listings.location,
      count: count(),
    })
    .from(listings)
    .where(
      and(
        eq(listings.cityId, cityId),
        eq(listings.isActive, true),
        isNull(listings.localityId),
        sql`${listings.location} is not null and ${listings.location} <> ''`,
      ),
    )
    .groupBy(listings.location)
    .orderBy(desc(count()))
    .limit(limit);
  return rows.filter((r): r is { locationText: string; count: number } => Boolean(r.locationText));
}
