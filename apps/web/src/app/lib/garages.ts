import { db, garages, listings, dealerSources } from "@preowned-cars/db";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";

export type GarageKind = "dealer" | "marketplace";

export type GarageSummary = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  description: string | null;
  city: string | null;
  phone: string | null;
  websiteUrl: string | null;
  instagramUrl: string | null;
  logoUrl: string | null;
  listingCount: number;
};

export async function getGarages(options?: {
  kind?: GarageKind;
}): Promise<GarageSummary[]> {
  const conditions = [eq(garages.isActive, true)];
  if (options?.kind) conditions.push(eq(garages.kind, options.kind));
  return db
    .select({
      id: garages.id,
      slug: garages.slug,
      name: garages.name,
      kind: garages.kind,
      description: garages.description,
      city: garages.city,
      phone: garages.phone,
      websiteUrl: garages.websiteUrl,
      instagramUrl: garages.instagramUrl,
      logoUrl: garages.logoUrl,
      listingCount: count(listings.id),
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
    .where(and(...conditions))
    .groupBy(garages.id)
    .orderBy(desc(count(listings.id)), asc(garages.name));
}

export async function getGarageBySlug(slug: string) {
  const [row] = await db
    .select()
    .from(garages)
    .where(and(eq(garages.slug, slug), eq(garages.isActive, true)))
    .limit(1);
  return row ?? null;
}

export async function getGarageSources(garageId: string) {
  return db
    .select({
      id: dealerSources.id,
      platform: dealerSources.platform,
      handle: dealerSources.handle,
      sourceType: dealerSources.sourceType,
      isActive: dealerSources.isActive,
    })
    .from(dealerSources)
    .where(eq(dealerSources.garageId, garageId));
}

/**
 * Uses the same feed rules as the home page: cluster heads only, ordered by
 * recency rather than scrape order, and carrying the garage name so the cards
 * render identically wherever they appear.
 */
export async function getListingsForGarage(garageId: string, limit = 48) {
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
        eq(listings.garageId, garageId),
      ),
    )
    .orderBy(
      desc(sql`coalesce(${listings.listedAt}, ${listings.firstSeenAt})`),
    )
    .limit(limit);
}
