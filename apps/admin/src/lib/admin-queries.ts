import {
  db,
  carListings,
  garages,
  dealerSources,
  scrapeRuns,
  listingReports,
  feedback,
  llmUsageLogs,
} from "@preowned-cars/db";
import { and, asc, count, desc, eq, ilike, isNotNull, or, sql, type SQL } from "drizzle-orm";
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
      active: sql<number>`count(*) filter (where ${carListings.isActive})::int`,
      delisted: sql<number>`count(*) filter (where not ${carListings.isActive})::int`,
      sold: sql<number>`count(*) filter (where ${carListings.saleStatus} = 'sold')::int`,
      needsReview: sql<number>`count(*) filter (where ${carListings.needsReview} and ${carListings.isActive})::int`,
      stale: sql<number>`count(*) filter (where ${carListings.isActive} and ${carListings.lastSeenAt} < now() - ${`${STALE_AFTER_DAYS} days`}::interval)::int`,
      addedToday: sql<number>`count(*) filter (where ${carListings.firstSeenAt} >= now() - interval '1 day')::int`,
      addedThisWeek: sql<number>`count(*) filter (where ${carListings.firstSeenAt} >= now() - interval '7 days')::int`,
      noMedia: sql<number>`count(*) filter (where ${carListings.isActive} and jsonb_array_length(coalesce(${carListings.media}, '[]'::jsonb)) = 0)::int`,
      noPrice: sql<number>`count(*) filter (where ${carListings.isActive} and ${carListings.price} is null)::int`,
      duplicatesCollapsed: sql<number>`count(*) filter (where ${carListings.isActive} and not ${carListings.isClusterHead})::int`,
    })
    .from(carListings);

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
    .from(carListings)
    .where(and(eq(carListings.needsReview, true), eq(carListings.isActive, true)));
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
    sql`select to_char(date_trunc('day', ${carListings.firstSeenAt}), 'YYYY-MM-DD') as day,
               count(*)::int as total
          from ${carListings}
         where ${carListings.firstSeenAt} >= now() - interval '30 days'
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
        ilike(carListings.make, term),
        ilike(carListings.model, term),
        ilike(carListings.variant, term),
        ilike(carListings.sourceUrl, term),
      )!,
    );
  }

  switch (filters.status) {
    case "active":
      conditions.push(eq(carListings.isActive, true));
      break;
    case "delisted":
      conditions.push(eq(carListings.isActive, false));
      break;
    case "sold":
      conditions.push(eq(carListings.saleStatus, "sold"));
      break;
    case "review":
      conditions.push(eq(carListings.needsReview, true));
      break;
    case "duplicate":
      conditions.push(eq(carListings.isClusterHead, false));
      break;
    case "no-media":
      conditions.push(
        sql`jsonb_array_length(coalesce(${carListings.media}, '[]'::jsonb)) = 0`,
      );
      break;
  }

  if (filters.source) conditions.push(eq(carListings.sourcePlatform, filters.source));
  if (filters.garage) conditions.push(eq(carListings.garageId, filters.garage));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? 40;

  const [rows, [totals]] = await Promise.all([
    db
      .select({
        id: carListings.id,
        make: carListings.make,
        model: carListings.model,
        variant: carListings.variant,
        year: carListings.year,
        price: carListings.price,
        kmDriven: carListings.kmDriven,
        fuelType: carListings.fuelType,
        transmission: carListings.transmission,
        bodyType: carListings.bodyType,
        city: carListings.city,
        saleStatus: carListings.saleStatus,
        isActive: carListings.isActive,
        isClusterHead: carListings.isClusterHead,
        needsReview: carListings.needsReview,
        reviewReason: carListings.reviewReason,
        media: carListings.media,
        heroMediaUrl: carListings.heroMediaUrl,
        sourcePlatform: carListings.sourcePlatform,
        sourceUrl: carListings.sourceUrl,
        listedAt: carListings.listedAt,
        firstSeenAt: carListings.firstSeenAt,
        lastSeenAt: carListings.lastSeenAt,
        garageName: garages.name,
      })
      .from(carListings)
      .leftJoin(garages, eq(garages.id, carListings.garageId))
      .where(where)
      .orderBy(desc(carListings.firstSeenAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(carListings).where(where),
  ]);

  const total = totals?.total ?? 0;
  return { rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getAdminListing(id: string) {
  const [row] = await db
    .select({
      listing: carListings,
      garageName: garages.name,
    })
    .from(carListings)
    .leftJoin(garages, eq(garages.id, carListings.garageId))
    .where(eq(carListings.id, id))
    .limit(1);
  if (!row) return null;
  return { ...row.listing, garageName: row.garageName };
}

/** Listings the price checker flagged, worst first. */
export async function getReviewQueue() {
  return db
    .select({
      id: carListings.id,
      make: carListings.make,
      model: carListings.model,
      year: carListings.year,
      price: carListings.price,
      reviewReason: carListings.reviewReason,
      sourceUrl: carListings.sourceUrl,
      description: carListings.description,
      media: carListings.media,
      firstSeenAt: carListings.firstSeenAt,
      garageName: garages.name,
    })
    .from(carListings)
    .leftJoin(garages, eq(garages.id, carListings.garageId))
    .where(and(eq(carListings.needsReview, true), eq(carListings.isActive, true)))
    .orderBy(desc(carListings.price))
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
      listingCount: count(carListings.id),
    })
    .from(garages)
    .leftJoin(
      carListings,
      and(eq(carListings.garageId, garages.id), eq(carListings.isActive, true)),
    )
    .groupBy(garages.id)
    .orderBy(desc(count(carListings.id)), asc(garages.name));
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
      garageId: garages.id,
      garageName: garages.name,
      garageSlug: garages.slug,
      listingCount: count(carListings.id),
    })
    .from(dealerSources)
    .innerJoin(garages, eq(garages.id, dealerSources.garageId))
    .leftJoin(
      carListings,
      and(
        eq(carListings.dealerSourceId, dealerSources.id),
        eq(carListings.isActive, true),
      ),
    )
    .groupBy(dealerSources.id, garages.id)
    .orderBy(desc(count(carListings.id)));
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
      make: carListings.make,
      model: carListings.model,
      year: carListings.year,
    })
    .from(listingReports)
    .leftJoin(carListings, eq(carListings.id, listingReports.listingId))
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
      sql`select ${carListings.fuelType} as value, count(*)::int as total
            from ${carListings}
           where ${carListings.isActive}
             and ${carListings.fuelType} is not null
             and ${carListings.fuelType} not in ('petrol','diesel','cng','electric','hybrid','lpg')
           group by 1 order by 2 desc`,
    ),
    db.execute(
      sql`select ${carListings.transmission} as value, count(*)::int as total
            from ${carListings}
           where ${carListings.isActive}
             and ${carListings.transmission} is not null
             and ${carListings.transmission} not in ('manual','automatic')
           group by 1 order by 2 desc`,
    ),
    db.execute(
      sql`select ${carListings.bodyType} as value, count(*)::int as total
            from ${carListings}
           where ${carListings.isActive}
             and ${carListings.bodyType} is not null
             and ${carListings.bodyType} not in ('hatchback','sedan','suv','muv','coupe','convertible','pickup','van','wagon')
           group by 1 order by 2 desc`,
    ),
    // Makes that differ only by case or punctuation still indicate a gap in the
    // canonical alias map.
    db.execute(
      sql`select lower(regexp_replace(${carListings.make}, '[^a-zA-Z0-9]', '', 'g')) as normalized,
                 string_agg(distinct ${carListings.make}, ' | ') as variants,
                 count(*)::int as total
            from ${carListings}
           where ${carListings.isActive}
           group by 1
          having count(distinct ${carListings.make}) > 1
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
