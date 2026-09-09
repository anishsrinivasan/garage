/**
 * Everywhere the listings come from, both verticals in one place.
 *
 * The garages directory this replaces only ever showed `kind = 'dealer'` and
 * `kind = 'marketplace'`, so every rental broker — sixteen of them, the whole
 * supply side of the rentals catalogue — was silently absent, and the detail
 * page rendered car cards regardless of what the org actually lists. A visitor
 * who found a good broker through a rental card had nowhere to go to see the
 * rest of their inventory.
 */
import { db, garages, listings, listingRentalAttrs, localities, dealerSources } from "@classifieds/db";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { RENTAL_SELECTION } from "./rentals-queries";

export type SourceVertical = "cars" | "rentals";

export type SourceSummary = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  vertical: string;
  city: string | null;
  description: string | null;
  instagramUrl: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  listingCount: number;
  /** Newest listing, so a dormant source is visibly dormant. */
  lastListedAt: Date | null;
  handles: string[];
};

/**
 * Counts and handles come from separate aggregates rather than one query with
 * two joins: joining both listings and dealer_sources multiplies the rows, and
 * an org with three handles would report three times its inventory.
 */
export async function getSources(): Promise<SourceSummary[]> {
  const [orgs, handleRows] = await Promise.all([
    db
      .select({
        id: garages.id,
        slug: garages.slug,
        name: garages.name,
        kind: garages.kind,
        vertical: garages.vertical,
        city: garages.city,
        description: garages.description,
        instagramUrl: garages.instagramUrl,
        websiteUrl: garages.websiteUrl,
        logoUrl: garages.logoUrl,
        listingCount: count(listings.id),
        lastListedAt: sql<Date | null>`max(coalesce(${listings.listedAt}, ${listings.firstSeenAt}))`,
      })
      .from(garages)
      .leftJoin(
        listings,
        and(
          eq(listings.garageId, garages.id),
          eq(listings.isActive, true),
          eq(listings.isClusterHead, true),
        ),
      )
      // A marketplace has no dealer_sources row; everything else needs at
      // least one active handle to still be a source. Without this, an org
      // whose handle was switched off — because it turned out to post nothing
      // but sale listings — stayed in the directory advertising zero homes.
      .where(
        and(
          eq(garages.isActive, true),
          sql`(${garages.kind} = 'marketplace' or exists (
            select 1 from ${dealerSources} ds
            where ds.garage_id = ${garages.id} and ds.is_active = true
          ))`,
        ),
      )
      .groupBy(garages.id)
      .orderBy(desc(count(listings.id)), asc(garages.name)),
    db
      .select({ garageId: dealerSources.garageId, handle: dealerSources.handle })
      .from(dealerSources)
      .where(eq(dealerSources.isActive, true)),
  ]);

  const handlesByOrg = new Map<string, string[]>();
  for (const row of handleRows) {
    const list = handlesByOrg.get(row.garageId) ?? [];
    list.push(row.handle);
    handlesByOrg.set(row.garageId, list);
  }

  return orgs.map((org) => ({ ...org, handles: handlesByOrg.get(org.id) ?? [] }));
}

export async function getSourceBySlug(slug: string) {
  const [row] = await db
    .select()
    .from(garages)
    .where(and(eq(garages.slug, slug), eq(garages.isActive, true)))
    .limit(1);
  return row ?? null;
}

/** Cars listed by one source, in the same shape and order the feed uses. */
export async function getCarsForSource(garageId: string, limit = 60) {
  return db
    .select({
      id: listings.id,
      make: listings.make,
      model: listings.model,
      variant: listings.variant,
      year: listings.year,
      price: listings.price,
      listingStatus: listings.listingStatus,
      saleStatus: listings.saleStatus,
      kmDriven: listings.kmDriven,
      fuelType: listings.fuelType,
      transmission: listings.transmission,
      city: listings.city,
      sourcePlatform: listings.sourcePlatform,
      media: listings.media,
      heroMediaUrl: listings.heroMediaUrl,
      listedAt: listings.listedAt,
      firstSeenAt: listings.firstSeenAt,
      garageName: garages.name,
      garageSlug: garages.slug,
    })
    .from(listings)
    .innerJoin(garages, eq(garages.id, listings.garageId))
    .where(
      and(
        eq(listings.isActive, true),
        eq(listings.isClusterHead, true),
        eq(listings.vertical, "cars"),
        eq(listings.garageId, garageId),
      ),
    )
    .orderBy(desc(sql`coalesce(${listings.listedAt}, ${listings.firstSeenAt})`))
    .limit(limit);
}

/** Rentals listed by one source. Same columns the rentals feed selects. */
export async function getRentalsForSource(garageId: string, limit = 60) {
  return db
    .select(RENTAL_SELECTION)
    .from(listings)
    .innerJoin(listingRentalAttrs, eq(listingRentalAttrs.listingId, listings.id))
    .leftJoin(localities, eq(localities.id, listings.localityId))
    .leftJoin(garages, eq(garages.id, listings.garageId))
    .where(
      and(
        eq(listings.isActive, true),
        eq(listings.isClusterHead, true),
        eq(listings.vertical, "rentals"),
        eq(listings.garageId, garageId),
      ),
    )
    .orderBy(desc(sql`coalesce(${listings.listedAt}, ${listings.firstSeenAt})`))
    .limit(limit);
}
